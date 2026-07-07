copy (
    with base_query as (
        select 
            pr.*
            ,ap.name is not null            is_active_package 
        from '{cwd}/staging/pypi_raw.parquet' pr 
        left join '{cwd}/staging/active_packages.parquet' ap  
            on pr.normalized_name = ap.normalized_name
    ),
    dependencies as (
        select 
            normalized_name 
            ,regexp_extract(unnest(requires_dist), '^([a-zA-Z0-9._-]+)', 1)              dependency 
            ,regexp_extract(unnest(requires_dist), 'extra == ["'']([^"'' ]+)["'']', 1)   extra_name
        from '{cwd}/staging/pypi_raw.parquet'
    ), 
    joins as (
        select distinct 
            b.id
            ,b.package_name
            ,b.normalized_name
            ,b.author
            ,b.home_page
            ,parent.id parent_id
            ,child.extra_name is null or child.extra_name = ''      is_core_parent
            ,b.last_version
            ,b.releases_count
            ,b.first_upload_date
            ,b.last_upload_date
            ,b.is_active_package
        from base_query b
        left join dependencies child 
            on b.normalized_name = child.normalized_name
        left join (select id, normalized_name from base_query) parent
            on parent.normalized_name = lower(regexp_replace(child.dependency, '[-._]+', '-', 'g'))
    ), 
    flag_rows_to_remove as (
        select *
            ,max(parent_id is not null) over (partition by id)      has_active_parent
        from joins
    )
    select * exclude(has_active_parent) 
    from flag_rows_to_remove
    where (parent_id is not null or not has_active_parent) and is_active_package 
    qualify row_number() over(partition by id, parent_id order by is_core_parent desc) = 1
    order by id, parent_id
) to '{cwd}/base.parquet' (format parquet, compression 'ZSTD')