with base as (
    select distinct
        name                                                                                      package_name
        ,lower(regexp_replace(name, r'[-._]+', '-'))                                              normalized_name
        ,last_value(author ignore nulls) over
            (partition by lower(regexp_replace(name, r'[-._]+', '-')), version 
             order by upload_time rows between unbounded preceding and unbounded following)       author
        ,last_value(home_page ignore nulls) over
            (partition by lower(regexp_replace(name, r'[-._]+', '-')), version 
             order by upload_time rows between unbounded preceding and unbounded following)       home_page                                 
        ,last_value(case when array_length(requires_dist) > 0 then requires_dist end ignore 
          nulls) over (partition by lower(regexp_replace(name, r'[-._]+', '-')), version 
             order by upload_time rows between unbounded preceding and unbounded following)       requires_dist
        ,version                                                                                  
        ,min(upload_time) over(partition by lower(regexp_replace(name, r'[-._]+', '-')), version) upload_date
    from bigquery-public-data.pypi.distribution_metadata
        where upload_time >= '{start_date}' and upload_time < '{end_date}'
) 
select 
    package_name
    ,normalized_name
    ,author
    ,home_page
    ,requires_dist
    ,version
    ,upload_date
from base;