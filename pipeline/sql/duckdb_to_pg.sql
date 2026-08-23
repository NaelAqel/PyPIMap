install postgres;
load postgres;
attach '{DB_URL}' as pg (type postgres, read_write);
set search_path = 'pg';


create temp table daily_raw as 
select distinct
    package_name,
    normalized_name,
    author,
    home_page,
    requires_dist,
    version,
    upload_date,
    is_active_package,
    inserted_at
from '{cwd}/pipeline/staging/raw_data/year={year}/month={month}/{day}.parquet';


insert into pypi.indecies (normalized_name)
select s.normalized_name 
from daily_raw s
left join pypi.indecies p using(normalized_name)
where p.normalized_name is null
group by s.normalized_name
order by min(upload_date);


create temp table changed_packages as
select distinct id, normalized_name
from daily_raw
join pypi.indecies using(normalized_name);


create temp table last_records as
select  
    id
    ,package_name
    ,normalized_name
    ,author
    ,home_page
    ,requires_dist
    ,version
    ,count(distinct version) over(partition by normalized_name)     releases_count
    ,min(upload_date) over(partition by normalized_name)            first_upload_date
    ,upload_date
    ,is_active_package
from '{cwd}/pipeline/staging/raw_data/**/*.parquet' q
join pypi.indecies using(normalized_name) 
where normalized_name in (select normalized_name from changed_packages)
qualify row_number() over(partition by normalized_name order by upload_date desc, q.inserted_at desc) = 1;


insert into pypi.metadata_cdc (
    id, package_name, normalized_name, author, home_page, 
    version, upload_date, is_active_package, inserted_at
)
with ordered_daily as (
    select distinct 
        i.id                       
        ,d.* exclude (requires_dist)
        ,row_number() over (partition by d.normalized_name 
            order by d.upload_date, d.inserted_at)                  daily_sequence
        ,lag((d.package_name, d.author, d.home_page, 
                d.version, d.is_active_package)) 
            over (partition by d.normalized_name
                order by d.upload_date, d.inserted_at)              prev_daily_state
        ,(d.package_name, d.author, d.home_page, d.version, 
            d.is_active_package)                                    current_state
    from daily_raw d
    join pypi.indecies i 
        using(normalized_name)
), 
last_cdc as (
    select distinct on (normalized_name)
        normalized_name
        ,(package_name, author, home_page, version, is_active_package)  prev_state
    from pypi.metadata_cdc
    where normalized_name in (select normalized_name from changed_packages)
),
changes as (
    select
        d.*
        ,case when daily_sequence = 1 then last_cdc.prev_state
            else prev_daily_state end                           prev_state
    from ordered_daily d
    left join last_cdc using(normalized_name)
)
select 
    ch.id
    ,ch.package_name
    ,ch.normalized_name
    ,ch.author
    ,ch.home_page
    ,ch.version
    ,ch.upload_date
    ,ch.is_active_package
    ,ch.inserted_at
from changes ch
where prev_state is null 
    or prev_state is distinct from current_state
order by ch.upload_date, ch.inserted_at; 


insert into pypi.metadata (
    id, package_name, normalized_name, author, home_page, last_version, 
    releases_count, first_upload_date, last_upload_date, is_active_package, 
    importance_score, inserted_at, updated_at
)   
select 
    id
    ,package_name
    ,normalized_name
    ,author
    ,home_page
    ,version                last_version
    ,releases_count
    ,first_upload_date
    ,upload_date            last_upload_date
    ,is_active_package
    ,0                      importance_score
    ,now()                  inserted_at
    ,now()                  updated_at
from last_records lr
on conflict (id) do update set
    package_name        = excluded.package_name
    ,author             = excluded.author
    ,home_page          = excluded.home_page
    ,last_version       = excluded.last_version
    ,releases_count     = excluded.releases_count
    ,first_upload_date  = excluded.first_upload_date
    ,last_upload_date   = excluded.last_upload_date
    ,is_active_package  = excluded.is_active_package
    ,updated_at         = now()
where row(
    package_name, author, home_page,
    last_version, releases_count, first_upload_date,
    last_upload_date, is_active_package
) is distinct from row(
    excluded.package_name, excluded.author, excluded.home_page,
    excluded.last_version, excluded.releases_count, excluded.first_upload_date,
    excluded.last_upload_date, excluded.is_active_package
);


create temp table dependencies as
with extracted as (
    select 
        *
        ,regexp_extract(unnest(requires_dist), '^([a-zA-Z0-9._-]+)', 1)              dependency 
        ,regexp_extract(unnest(requires_dist), 'extra == ["'']([^"'' ]+)["'']', 1)   extra_name
    from last_records
    where is_active_package
)
select distinct 
    child.id                                                                        child_id
    ,parent.id                                                                      parent_id
    ,child.extra_name is null or child.extra_name = ''                              is_core_parent
from extracted child 
left join pypi.metadata parent
    on parent.normalized_name = lower(regexp_replace(child.dependency, '[-._]+', '-', 'g'))
left join last_records parent_last_records
    on parent.normalized_name = parent_last_records.normalized_name
where coalesce(parent_last_records.is_active_package, parent.is_active_package, false);


create temp table old_dependencies as
select 
    pc.id                                   child_id
    ,unnest(pc.parent_core_ids)             parent_id
    ,true                                   is_core_parent
from pypi.package_connections pc
join changed_packages ch on pc.id = ch.id
union
select 
    pc.id
    ,unnest(pc.parent_non_core_ids)
    ,false
from pypi.package_connections pc
join changed_packages ch on pc.id = ch.id;


insert into pypi.package_connections (
    id, is_active_package, parent_core_counts, parent_non_core_counts,
    children_core_counts, children_non_core_counts, parent_core_ids,
    parent_non_core_ids, children_core_ids, children_non_core_ids,
    inserted_at, updated_at
)
with affected_parents as (
    select distinct parent_id id from old_dependencies
    union
    select distinct parent_id from dependencies
),
existing_children as (
    select
        pc.id                                                                           parent_id
        ,unnest(pc.children_core_ids)                                                   child_id
        ,true                                                                           is_core_parent
    from pypi.package_connections pc
    join affected_parents ap on pc.id = ap.id
    union
    select
        pc.id
        ,unnest(pc.children_non_core_ids)
        ,false
    from pypi.package_connections pc
    join affected_parents ap on pc.id = ap.id
),
current_children as (
    select parent_id, child_id, is_core_parent from existing_children
    where child_id not in (select id from changed_packages)
    union
    select parent_id, child_id, is_core_parent from dependencies
),
parents as (
    select 
        ch.id
        ,count(case when is_core_parent and parent_id is not null then 1 end)       parent_core_counts
        ,count(case when not is_core_parent and parent_id is not null then 1 end)   parent_non_core_counts
        ,array_agg(parent_id order by parent_id) 
            filter (where is_core_parent and parent_id is not null)                 parent_core_ids
        ,array_agg(parent_id order by parent_id) 
            filter (where not is_core_parent and parent_id is not null)             parent_non_core_ids
    from changed_packages ch
    left join dependencies d on ch.id = d.child_id
    group by ch.id
), 
children as (
    select 
        ap.id
        ,count(case when is_core_parent then 1 end)                                 children_core_counts
        ,count(case when not is_core_parent then 1 end)                             children_non_core_counts
        ,array_agg(child_id order by child_id) filter (where ch.is_core_parent)     children_core_ids
        ,array_agg(child_id order by child_id) filter (where not ch.is_core_parent) children_non_core_ids
    from affected_parents ap
    left join current_children ch on ap.id = ch.parent_id
    group by ap.id
),
affected_ids as (
    select id from changed_packages
    union
    select id from affected_parents
)
select
    a.id
    ,m.is_active_package
    ,case when cp.id is not null then coalesce(p.parent_core_counts, 0)
        else coalesce(old.parent_core_counts, 0) end                                parent_core_counts
    ,case when cp.id is not null then coalesce(p.parent_non_core_counts, 0)
        else coalesce(old.parent_non_core_counts, 0) end                            parent_non_core_counts
    ,case when ap.id is not null then coalesce(c.children_core_counts, 0)
        else coalesce(old.children_core_counts, 0) end                              children_core_counts
    ,case when ap.id is not null then coalesce(c.children_non_core_counts, 0)
        else coalesce(old.children_non_core_counts, 0) end                          children_non_core_counts
    ,case when cp.id is not null then coalesce(p.parent_core_ids, array[]::int[])
        else coalesce(old.parent_core_ids, array[]::int[]) end                      parent_core_ids
    ,case when cp.id is not null then coalesce(p.parent_non_core_ids, array[]::int[])
        else coalesce(old.parent_non_core_ids, array[]::int[]) end                  parent_non_core_ids
    ,case when ap.id is not null then coalesce(c.children_core_ids, array[]::int[])
        else coalesce(old.children_core_ids, array[]::int[]) end                    children_core_ids
    ,case when ap.id is not null then coalesce(c.children_non_core_ids, array[]::int[])
        else coalesce(old.children_non_core_ids, array[]::int[]) end                children_non_core_ids
    ,now()                                                                          inserted_at
    ,now()                                                                          updated_at
from affected_ids a
join pypi.metadata m using(id)
left join pypi.package_connections old using(id)
left join changed_packages cp using(id)
left join affected_parents ap using(id)
left join parents p using(id)
left join children c using(id)
on conflict (id) do update set
    is_active_package          = excluded.is_active_package
    ,parent_core_counts        = excluded.parent_core_counts
    ,parent_non_core_counts    = excluded.parent_non_core_counts
    ,children_core_counts      = excluded.children_core_counts
    ,children_non_core_counts  = excluded.children_non_core_counts
    ,parent_core_ids           = excluded.parent_core_ids
    ,parent_non_core_ids       = excluded.parent_non_core_ids
    ,children_core_ids         = excluded.children_core_ids
    ,children_non_core_ids     = excluded.children_non_core_ids
    ,updated_at                = now()
where row(
    is_active_package, parent_core_counts, parent_non_core_counts,
    children_core_counts, children_non_core_counts, parent_core_ids, 
    parent_non_core_ids, children_core_ids, children_non_core_ids
) is distinct from row(
    excluded.is_active_package, excluded.parent_core_counts, excluded.parent_non_core_counts,
    excluded.children_core_counts, excluded.children_non_core_counts, excluded.parent_core_ids, 
    excluded.parent_non_core_ids, excluded.children_core_ids, excluded.children_non_core_ids
);