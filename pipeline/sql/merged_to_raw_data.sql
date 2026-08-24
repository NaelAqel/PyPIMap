create temp table active_packages as 
select normalized_name from '{cwd}/pipeline/staging/active_packages.parquet';


create temp table deactivated_packages as
with latest_states as (
    select
        normalized_name
        ,arg_max(
            struct_pack(upload_date := upload_date, inserted_at := inserted_at, is_active_package := is_active_package),
            struct_pack(upload_date := upload_date, inserted_at := inserted_at)
        ) latest_state
    from '{cwd}/pipeline/staging/raw_data/**/*.parquet'
    group by normalized_name
)
select
    ls.normalized_name
    ,ls.latest_state.upload_date        upload_date
    ,ls.latest_state.inserted_at        inserted_at
from latest_states ls
left join active_packages ap using(normalized_name)
where ls.latest_state.is_active_package
    and ap.normalized_name is null;


copy (
    select
        pr.*
        ,ap.normalized_name is not null is_active_package
        ,now() inserted_at
    from '{cwd}/pipeline/staging/tmp.parquet' pr
    left join active_packages ap using(normalized_name)

    union all

    select
        pr.* exclude(is_active_package, inserted_at, month, year)
        ,false      is_active_package
        ,now()      inserted_at
    from '{cwd}/pipeline/staging/raw_data/**/*.parquet' pr
    join deactivated_packages d
        on pr.normalized_name = d.normalized_name
        and pr.upload_date = d.upload_date
        and pr.inserted_at = d.inserted_at
) to '{file_name}' (format parquet, compression 'ZSTD');


drop table if exists active_packages;
drop table if exists deactivated_packages;