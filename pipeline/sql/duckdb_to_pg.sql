install postgres;
load postgres;
attach '{DB_URL}' as pg (type postgres, read_write);
set search_path = 'pg';


insert into pypi.metadata_staging 
with base_info as (
    select distinct 
        id
        ,package_name
        ,normalized_name
        ,author
        ,home_page
        ,last_version
        ,releases_count
        ,first_upload_date
        ,last_upload_date
        ,is_active_package
    from '{cwd}/base.parquet'
),
children as (
    select 
        parent_id 
        ,count(case when is_core_parent then 1 end)                                 children_core_counts
        ,count(case when not is_core_parent then 1 end)                             children_non_core_counts
    from '{cwd}/base.parquet' where is_active_package group by 1
)    
select 
    b.*
    ,coalesce(children_core_counts, 0)+0.3*coalesce(children_non_core_counts, 0)    importance_score
from base_info b left join children c on b.id = c.parent_id;


insert into pypi.package_connections_staging
with parents as (
    select 
        id 
        ,releases_count
        ,count(case when is_core_parent and parent_id is not null then 1 end)       parent_core_counts
        ,count(case when not is_core_parent and parent_id is not null then 1 end)   parent_non_core_counts
        ,array_agg(parent_id order by parent_id) 
            filter (where is_core_parent and parent_id is not null)                 parent_core_ids
        ,array_agg(parent_id order by parent_id) 
            filter (where not is_core_parent and parent_id is not null)             parent_non_core_ids
    from '{cwd}/base.parquet' where is_active_package group by 1,2
), 
children as (
    select 
        parent_id 
        ,count(case when is_core_parent then 1 end)                                 children_core_counts
        ,count(case when not is_core_parent then 1 end)                             children_non_core_counts
        ,array_agg(id order by id) filter (where is_core_parent)                    children_core_ids
        ,array_agg(id order by id) filter (where not is_core_parent)                children_non_core_ids
    from '{cwd}/base.parquet' where is_active_package group by 1
)
select 
    id
    ,coalesce(releases_count, 0)                                                    releases_count
    ,parent_core_counts                             
    ,parent_non_core_counts                         
    ,coalesce(children_core_counts, 0)                                              children_core_counts
    ,coalesce(children_non_core_counts, 0)                                          children_non_core_counts
    ,coalesce(parent_core_ids, array[]::int[])                                      parent_core_ids
    ,coalesce(parent_non_core_ids, array[]::int[])                                  parent_non_core_ids
    ,coalesce(children_core_ids, array[]::int[])                                    children_core_ids
    ,coalesce(children_non_core_ids, array[]::int[])                                children_non_core_ids
from parents p left join children c on p.id = c.parent_id;