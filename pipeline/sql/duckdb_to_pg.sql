set memory_limit = '1GB';
set threads = 2;
set preserve_insertion_order = false;
set temp_directory = '{cwd}/pipeline/staging/duckdb_tmp';


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


-- active_version: PEP 440 active version (prefer final, then highest). last_upload_date: max upload_date
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
    ,max(upload_date) over(partition by normalized_name)            last_upload_date
    ,is_active_package
from '{cwd}/pipeline/staging/raw_data/**/*.parquet' q
join pypi.indecies using(normalized_name) 
where normalized_name in (select normalized_name from changed_packages)
qualify row_number() over (
    partition by normalized_name
    order by
        -- prefer final over pre/dev (PyPI project-page rule)
        case
            when regexp_matches(lower(version), '(?:^|[.\-_]|[0-9])(a|b|rc|alpha|beta|c|pre|preview)[0-9]*')
              or regexp_matches(lower(version), '(?:^|[.\-_])dev')
            then 1 else 0
        end asc,
        -- epoch (PEP 440)
        coalesce(try_cast(regexp_extract(lower(version), '^([0-9]+)!', 1) as int), 0) desc,
        -- release segment
        coalesce(try_cast(split_part(regexp_extract(lower(version),
            '^(?:[0-9]+!)?([0-9]+(?:\.[0-9]+)*)', 1), '.', 1) as int), 0) desc,
        coalesce(try_cast(split_part(regexp_extract(lower(version),
            '^(?:[0-9]+!)?([0-9]+(?:\.[0-9]+)*)', 1), '.', 2) as int), 0) desc,
        coalesce(try_cast(split_part(regexp_extract(lower(version),
            '^(?:[0-9]+!)?([0-9]+(?:\.[0-9]+)*)', 1), '.', 3) as int), 0) desc,
        coalesce(try_cast(split_part(regexp_extract(lower(version),
            '^(?:[0-9]+!)?([0-9]+(?:\.[0-9]+)*)', 1), '.', 4) as int), 0) desc,
        coalesce(try_cast(split_part(regexp_extract(lower(version),
            '^(?:[0-9]+!)?([0-9]+(?:\.[0-9]+)*)', 1), '.', 5) as int), 0) desc,
        coalesce(try_cast(split_part(regexp_extract(lower(version),
            '^(?:[0-9]+!)?([0-9]+(?:\.[0-9]+)*)', 1), '.', 6) as int), 0) desc,
        coalesce(try_cast(split_part(regexp_extract(lower(version),
            '^(?:[0-9]+!)?([0-9]+(?:\.[0-9]+)*)', 1), '.', 7) as int), 0) desc,
        coalesce(try_cast(split_part(regexp_extract(lower(version),
            '^(?:[0-9]+!)?([0-9]+(?:\.[0-9]+)*)', 1), '.', 8) as int), 0) desc,
        -- pre: none > rc > b > a
        case
            when regexp_matches(lower(version), '(?:^|[.\-_]|[0-9])(rc|c|pre|preview)[0-9]*') then 3
            when regexp_matches(lower(version), '(?:^|[.\-_]|[0-9])(b|beta)[0-9]*') then 2
            when regexp_matches(lower(version), '(?:^|[.\-_]|[0-9])(a|alpha)[0-9]*') then 1
            else 4
        end desc,
        coalesce(try_cast(regexp_extract(lower(version),
            '(?:^|[.\-_]|[0-9])(?:a|b|rc|alpha|beta|c|pre|preview)\.?([0-9]+)', 1) as int), 0) desc,
        -- post
        case when regexp_matches(lower(version), '(?:^|[.\-_])post') then 1 else 0 end desc,
        coalesce(try_cast(regexp_extract(lower(version),
            '(?:^|[.\-_])post\.?([0-9]+)', 1) as int), 0) desc,
        -- no-dev > dev
        case when regexp_matches(lower(version), '(?:^|[.\-_])dev') then 0 else 1 end desc,
        coalesce(try_cast(regexp_extract(lower(version),
            '(?:^|[.\-_])dev\.?([0-9]+)', 1) as int), 0) desc,
        upload_date desc,
        q.inserted_at desc
) = 1;


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


drop table if exists daily_raw;


insert into pypi.metadata (
    id, package_name, normalized_name, author, home_page, active_version, 
    releases_count, first_upload_date, last_upload_date, is_active_package, 
    importance_score, inserted_at, updated_at
)   
select 
    id
    ,package_name
    ,normalized_name
    ,author
    ,home_page
    ,version                active_version
    ,releases_count
    ,first_upload_date
    ,last_upload_date
    ,is_active_package
    ,0                      importance_score
    ,now()                  inserted_at
    ,now()                  updated_at
from last_records lr
on conflict (id) do update set
    package_name        = excluded.package_name
    ,author             = excluded.author
    ,home_page          = excluded.home_page
    ,active_version       = excluded.active_version
    ,releases_count     = excluded.releases_count
    ,first_upload_date  = excluded.first_upload_date
    ,last_upload_date   = excluded.last_upload_date
    ,is_active_package  = excluded.is_active_package
    ,updated_at         = now()
where row(
    package_name, author, home_page,
    active_version, releases_count, first_upload_date,
    last_upload_date, is_active_package
) is distinct from row(
    excluded.package_name, excluded.author, excluded.home_page,
    excluded.active_version, excluded.releases_count, excluded.first_upload_date,
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
    child.id                                                                        dependent_id
    ,parent.id                                                                      depends_on_id
    ,child.extra_name is null or child.extra_name = ''                              is_core_edge
from extracted child 
left join pypi.metadata parent
    on parent.normalized_name = lower(regexp_replace(child.dependency, '[-._]+', '-', 'g'))
left join last_records parent_last_records
    on parent.normalized_name = parent_last_records.normalized_name
where coalesce(parent_last_records.is_active_package, parent.is_active_package, false);


drop table if exists last_records;


create temp table old_dependencies as
select 
    pc.id                                   dependent_id
    ,unnest(pc.depends_on_core_ids)             depends_on_id
    ,true                                   is_core_edge
from pypi.package_connections pc
join changed_packages ch on pc.id = ch.id
union
select 
    pc.id
    ,unnest(pc.depends_on_optional_ids)
    ,false
from pypi.package_connections pc
join changed_packages ch on pc.id = ch.id;


insert into pypi.package_connections (
    id, is_active_package, depends_on_core_counts, depends_on_optional_counts,
    used_by_core_counts, used_by_optional_counts, depends_on_core_ids,
    depends_on_optional_ids, used_by_core_ids, used_by_optional_ids,
    inserted_at, updated_at
)
with affected_depended_on as (
    select distinct depends_on_id id from old_dependencies
    union
    select distinct depends_on_id from dependencies
),
existing_dependents as (
    select
        pc.id                                                                           depends_on_id
        ,unnest(pc.used_by_core_ids)                                                   dependent_id
        ,true                                                                           is_core_edge
    from pypi.package_connections pc
    join affected_depended_on ap on pc.id = ap.id
    union
    select
        pc.id
        ,unnest(pc.used_by_optional_ids)
        ,false
    from pypi.package_connections pc
    join affected_depended_on ap on pc.id = ap.id
),
current_dependents as (
    select depends_on_id, dependent_id, is_core_edge from existing_dependents
    where dependent_id not in (select id from changed_packages)
    union
    select depends_on_id, dependent_id, is_core_edge from dependencies
),
depends_on_agg as (
    select 
        ch.id
        ,count(case when is_core_edge and depends_on_id is not null then 1 end)       depends_on_core_counts
        ,count(case when not is_core_edge and depends_on_id is not null then 1 end)   depends_on_optional_counts
        ,array_agg(depends_on_id order by depends_on_id) 
            filter (where is_core_edge and depends_on_id is not null)                 depends_on_core_ids
        ,array_agg(depends_on_id order by depends_on_id) 
            filter (where not is_core_edge and depends_on_id is not null)             depends_on_optional_ids
    from changed_packages ch
    left join dependencies d on ch.id = d.dependent_id
    group by ch.id
), 
used_by_agg as (
    select 
        ap.id
        ,count(case when is_core_edge then 1 end)                                 used_by_core_counts
        ,count(case when not is_core_edge then 1 end)                             used_by_optional_counts
        ,array_agg(dependent_id order by dependent_id) filter (where ch.is_core_edge)     used_by_core_ids
        ,array_agg(dependent_id order by dependent_id) filter (where not ch.is_core_edge) used_by_optional_ids
    from affected_depended_on ap
    left join current_dependents ch on ap.id = ch.depends_on_id
    group by ap.id
),
affected_ids as (
    select id from changed_packages
    union
    select id from affected_depended_on
)
select
    a.id
    ,m.is_active_package
    ,case when cp.id is not null then coalesce(p.depends_on_core_counts, 0)
        else coalesce(old.depends_on_core_counts, 0) end                                depends_on_core_counts
    ,case when cp.id is not null then coalesce(p.depends_on_optional_counts, 0)
        else coalesce(old.depends_on_optional_counts, 0) end                            depends_on_optional_counts
    ,case when ap.id is not null then coalesce(c.used_by_core_counts, 0)
        else coalesce(old.used_by_core_counts, 0) end                              used_by_core_counts
    ,case when ap.id is not null then coalesce(c.used_by_optional_counts, 0)
        else coalesce(old.used_by_optional_counts, 0) end                          used_by_optional_counts
    ,case when cp.id is not null then coalesce(p.depends_on_core_ids, array[]::int[])
        else coalesce(old.depends_on_core_ids, array[]::int[]) end                      depends_on_core_ids
    ,case when cp.id is not null then coalesce(p.depends_on_optional_ids, array[]::int[])
        else coalesce(old.depends_on_optional_ids, array[]::int[]) end                  depends_on_optional_ids
    ,case when ap.id is not null then coalesce(c.used_by_core_ids, array[]::int[])
        else coalesce(old.used_by_core_ids, array[]::int[]) end                    used_by_core_ids
    ,case when ap.id is not null then coalesce(c.used_by_optional_ids, array[]::int[])
        else coalesce(old.used_by_optional_ids, array[]::int[]) end                used_by_optional_ids
    ,now()                                                                          inserted_at
    ,now()                                                                          updated_at
from affected_ids a
join pypi.metadata m using(id)
left join pypi.package_connections old using(id)
left join changed_packages cp using(id)
left join affected_depended_on ap using(id)
left join depends_on_agg p using(id)
left join used_by_agg c using(id)
on conflict (id) do update set
    is_active_package          = excluded.is_active_package
    ,depends_on_core_counts        = excluded.depends_on_core_counts
    ,depends_on_optional_counts    = excluded.depends_on_optional_counts
    ,used_by_core_counts      = excluded.used_by_core_counts
    ,used_by_optional_counts  = excluded.used_by_optional_counts
    ,depends_on_core_ids           = excluded.depends_on_core_ids
    ,depends_on_optional_ids       = excluded.depends_on_optional_ids
    ,used_by_core_ids         = excluded.used_by_core_ids
    ,used_by_optional_ids     = excluded.used_by_optional_ids
    ,updated_at                = now()
where row(
    is_active_package, depends_on_core_counts, depends_on_optional_counts,
    used_by_core_counts, used_by_optional_counts, depends_on_core_ids, 
    depends_on_optional_ids, used_by_core_ids, used_by_optional_ids
) is distinct from row(
    excluded.is_active_package, excluded.depends_on_core_counts, excluded.depends_on_optional_counts,
    excluded.used_by_core_counts, excluded.used_by_optional_counts, excluded.depends_on_core_ids, 
    excluded.depends_on_optional_ids, excluded.used_by_core_ids, excluded.used_by_optional_ids
);


drop table if exists old_dependencies;
drop table if exists dependencies;
drop table if exists changed_packages;