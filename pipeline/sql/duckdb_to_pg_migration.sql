install postgres;
load postgres;
attach '{DB_URL}' as pg (type postgres, read_write);
set search_path = 'pg';


insert into pypi.indecies_stage (normalized_name)
select normalized_name 
from '{cwd}/pipeline/staging/raw_data/**/*.parquet' 
group by normalized_name
order by min(upload_date);


create temp table last_records as
select  
    id
    ,package_name
    ,normalized_name
    ,author
    ,home_page
    ,requires_dist
    ,version                                                        last_version
    ,count(distinct version) over(partition by normalized_name)     releases_count
    ,min(upload_date) over(partition by normalized_name)            first_upload_date
    ,upload_date                                                    last_upload_date
    ,is_active_package
from '{cwd}/pipeline/staging/raw_data/**/*.parquet' q
join pypi.indecies_stage using(normalized_name) 
qualify row_number() over(partition by normalized_name order by upload_date desc, q.inserted_at desc) = 1;


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
    child.id                                                child_id
    ,parent.id                                              parent_id
    ,child.extra_name is null or child.extra_name = ''      is_core_parent
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
    id, package_name, normalized_name, author, home_page, last_version, 
    releases_count, first_upload_date, last_upload_date, is_active_package, 
    importance_score
)
with children_counts as (
    select 
        parent_id 
        ,count(case when is_core_parent then 1 end)             children_core_counts
        ,count(case when not is_core_parent then 1 end)         children_non_core_counts
    from dependencies
    group by parent_id
)    
select 
    lr.id
    ,package_name
    ,normalized_name
    ,author
    ,home_page
    ,last_version
    ,releases_count
    ,first_upload_date
    ,last_upload_date
    ,is_active_package
    ,coalesce(children_core_counts, 0)+0.3*coalesce(children_non_core_counts, 0)    importance_score
from last_records lr left join children_counts c on lr.id = c.parent_id;


insert into pypi.package_connections_stage (
    id, is_active_package, parent_core_counts, parent_non_core_counts,
    children_core_counts, children_non_core_counts, parent_core_ids,
    parent_non_core_ids, children_core_ids, children_non_core_ids
)
with parents as (
    select 
        child_id id 
        ,count(case when is_core_parent and parent_id is not null then 1 end)       parent_core_counts
        ,count(case when not is_core_parent and parent_id is not null then 1 end)   parent_non_core_counts
        ,array_agg(parent_id order by parent_id) 
            filter (where is_core_parent and parent_id is not null)                 parent_core_ids
        ,array_agg(parent_id order by parent_id) 
            filter (where not is_core_parent and parent_id is not null)             parent_non_core_ids
    from dependencies group by 1
), 
children as (
    select 
        parent_id 
        ,count(case when is_core_parent then 1 end)                                 children_core_counts
        ,count(case when not is_core_parent then 1 end)                             children_non_core_counts
        ,array_agg(child_id order by child_id) filter (where is_core_parent)        children_core_ids
        ,array_agg(child_id order by child_id) filter (where not is_core_parent)    children_non_core_ids
    from dependencies group by 1
)
select 
    lr.id
    ,lr.is_active_package
    ,coalesce(parent_core_counts, 0)                                                parent_core_counts
    ,coalesce(parent_non_core_counts, 0)                                            parent_non_core_counts
    ,coalesce(children_core_counts, 0)                                              children_core_counts
    ,coalesce(children_non_core_counts, 0)                                          children_non_core_counts
    ,coalesce(parent_core_ids, array[]::int[])                                      parent_core_ids
    ,coalesce(parent_non_core_ids, array[]::int[])                                  parent_non_core_ids
    ,coalesce(children_core_ids, array[]::int[])                                    children_core_ids
    ,coalesce(children_non_core_ids, array[]::int[])                                children_non_core_ids
from last_records lr 
left join parents p on lr.id = p.id 
left join children c on lr.id = c.parent_id;
