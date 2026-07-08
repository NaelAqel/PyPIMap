with base as (
    select
        name                                                                package_name
        ,lower(regexp_replace(name, r'[-._]+', '-'))                        normalized_name
        ,last_value(author ignore nulls) over
            (partition by lower(regexp_replace(name, r'[-._]+', '-')) 
                order by upload_time rows between unbounded preceding 
                and unbounded following)                                    author
        ,last_value(home_page ignore nulls) over
            (partition by lower(regexp_replace(name, r'[-._]+', '-')) 
            order by upload_time rows between unbounded preceding 
            and unbounded following)                                        home_page                                  
        ,case when array_length(requires_dist) > 0 then requires_dist end   requires_dist
        ,upload_time
        ,version                                                            last_version
        ,min(upload_time) over 
            (partition by lower(regexp_replace(name, r'[-._]+', '-')))      first_upload_date 
        ,max(upload_time) over 
            (partition by lower(regexp_replace(name, r'[-._]+', '-')))      last_upload_date
        ,count(distinct version) over 
            (partition by lower(regexp_replace(name, r'[-._]+', '-')))      releases_count
    from bigquery-public-data.pypi.distribution_metadata
        where upload_time < timestamp(current_date())
    -- pypi could record twice per release, so we will get the two records
    -- becasue one of them is inserted without requires_dist
    qualify timestamp_diff(max(upload_time) over 
        (partition by lower(regexp_replace(name, r'[-._]+', '-'))), upload_time, second) < 10
),
latest_dist as (
    -- to take the latest requires_dist
    select 
        package_name
        ,normalized_name
        ,author 
        ,home_page                                 
        ,requires_dist
        ,last_version
        ,first_upload_date 
        ,last_upload_date
        ,releases_count
        ,row_number() over(partition by normalized_name order by requires_dist is null, upload_time desc) rn
    from base
)
select 
    row_number() over(order by first_upload_date)   id 
    ,package_name
    ,normalized_name
    ,author
    ,home_page
    ,requires_dist
    ,last_version
    ,first_upload_date
    ,last_upload_date
    ,releases_count
from latest_dist
where rn = 1;