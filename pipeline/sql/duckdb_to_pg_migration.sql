install postgres;
load postgres;
attach '{DB_URL}' as pg (type postgres, read_write);
set search_path = 'pg';


insert into pypi.indecies_stage (normalized_name)
select normalized_name 
from '{cwd}/pipeline/staging/raw_data/**/*.parquet' 
group by normalized_name
order by min(upload_date);


-- active_version: PEP 440 active version (prefer final, then highest). last_upload_date: max upload_date
create temp table last_records as
select  
    id
    ,package_name
    ,normalized_name
    ,author
    ,home_page
    ,requires_dist
    ,version                                                        active_version
    ,count(distinct version) over(partition by normalized_name)     releases_count
    ,min(upload_date) over(partition by normalized_name)            first_upload_date
    ,max(upload_date) over(partition by normalized_name)            last_upload_date
    ,is_active_package
from '{cwd}/pipeline/staging/raw_data/**/*.parquet' q
join pypi.indecies_stage using(normalized_name) 
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


create temp table dependencies as
with dependencies as (
    select 
        *
        ,regexp_extract(unnest(requires_dist), '^([a-zA-Z0-9._-]+)', 1)              dependency 
        ,regexp_extract(unnest(requires_dist), 'extra == ["'']([^"'' ]+)["'']', 1)   extra_name
    from last_records
    where is_active_package
)
select distinct 
    child.id                                                dependent_id
    ,parent.id                                              depends_on_id
    ,child.extra_name is null or child.extra_name = ''      is_core_edge
from dependencies child 
left join pypi.indecies_stage parent
    on parent.normalized_name = lower(regexp_replace(child.dependency, '[-._]+', '-', 'g'))
join last_records parent_last_records
    on parent.normalized_name = parent_last_records.normalized_name
where parent_last_records.is_active_package;


insert into pypi.metadata_cdc_stage (
    id, package_name, normalized_name, author, home_page, 
    version, upload_date, is_active_package, inserted_at
)
with raw_with_id as (
    select distinct 
        id                       
        ,package_name            
        ,normalized_name       
        ,author                  
        ,home_page               
        ,version                  
        ,upload_date         
        ,is_active_package
        ,q.inserted_at
    from '{cwd}/pipeline/staging/raw_data/**/*.parquet' q
    join pypi.indecies_stage using(normalized_name)
), 
track_changes as (
    select *
        ,lag((package_name, author, home_page, version, is_active_package))
            over(partition by normalized_name order by upload_date, inserted_at)    prev_state
        ,(package_name, author, home_page, version, is_active_package)              current_state
    from raw_with_id
)
select 
    id
    ,package_name
    ,normalized_name
    ,author
    ,home_page
    ,version
    ,upload_date
    ,is_active_package
    ,inserted_at
from track_changes
where prev_state is null
    or prev_state is distinct from current_state 
order by upload_date, inserted_at; 


insert into pypi.metadata_stage (
    id, package_name, normalized_name, author, home_page, active_version, 
    releases_count, first_upload_date, last_upload_date, is_active_package, 
    importance_score
)
with used_by_counts as (
    select 
        depends_on_id 
        ,count(case when is_core_edge then 1 end)             used_by_core_counts
        ,count(case when not is_core_edge then 1 end)         used_by_optional_counts
    from dependencies
    group by depends_on_id
)    
select 
    lr.id
    ,package_name
    ,normalized_name
    ,author
    ,home_page
    ,active_version
    ,releases_count
    ,first_upload_date
    ,last_upload_date
    ,is_active_package
    ,coalesce(used_by_core_counts, 0)+0.3*coalesce(used_by_optional_counts, 0)    importance_score
from last_records lr left join used_by_counts c on lr.id = c.depends_on_id;


insert into pypi.package_connections_stage (
    id, is_active_package, depends_on_core_counts, depends_on_optional_counts,
    used_by_core_counts, used_by_optional_counts, depends_on_core_ids,
    depends_on_optional_ids, used_by_core_ids, used_by_optional_ids
)
with depends_on_agg as (
    select 
        dependent_id id 
        ,count(case when is_core_edge and depends_on_id is not null then 1 end)       depends_on_core_counts
        ,count(case when not is_core_edge and depends_on_id is not null then 1 end)   depends_on_optional_counts
        ,array_agg(depends_on_id order by depends_on_id) 
            filter (where is_core_edge and depends_on_id is not null)                 depends_on_core_ids
        ,array_agg(depends_on_id order by depends_on_id) 
            filter (where not is_core_edge and depends_on_id is not null)             depends_on_optional_ids
    from dependencies group by 1
), 
used_by_agg as (
    select 
        depends_on_id 
        ,count(case when is_core_edge then 1 end)                                 used_by_core_counts
        ,count(case when not is_core_edge then 1 end)                             used_by_optional_counts
        ,array_agg(dependent_id order by dependent_id) filter (where is_core_edge)        used_by_core_ids
        ,array_agg(dependent_id order by dependent_id) filter (where not is_core_edge)    used_by_optional_ids
    from dependencies group by 1
)
select 
    lr.id
    ,lr.is_active_package
    ,coalesce(depends_on_core_counts, 0)                                                depends_on_core_counts
    ,coalesce(depends_on_optional_counts, 0)                                            depends_on_optional_counts
    ,coalesce(used_by_core_counts, 0)                                              used_by_core_counts
    ,coalesce(used_by_optional_counts, 0)                                          used_by_optional_counts
    ,coalesce(depends_on_core_ids, array[]::int[])                                      depends_on_core_ids
    ,coalesce(depends_on_optional_ids, array[]::int[])                                  depends_on_optional_ids
    ,coalesce(used_by_core_ids, array[]::int[])                                    used_by_core_ids
    ,coalesce(used_by_optional_ids, array[]::int[])                                used_by_optional_ids
from last_records lr 
left join depends_on_agg p on lr.id = p.id 
left join used_by_agg c on lr.id = c.depends_on_id;
