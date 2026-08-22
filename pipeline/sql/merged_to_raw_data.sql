copy (
    select pr.*, ap.name is not null is_active_package, now() inserted_at 
    from '{cwd}/pipeline/staging/tmp.parquet' pr 
    left join '{cwd}/pipeline/staging/active_packages.parquet' ap using(normalized_name)

    union

    -- this to check packages that become deactivated
    select pr.* exclude(is_active_package), false as is_active_package, now() inserted_at
    from (
        select * exclude(inserted_at, month, year)
        from '{cwd}/pipeline/staging/raw_data/**/*.parquet'
        qualify row_number() over(partition by normalized_name order by upload_date desc, inserted_at desc) = 1
    ) pr 
    left join '{cwd}/pipeline/staging/active_packages.parquet' ap using(normalized_name)
    where pr.is_active_package = true and ap.normalized_name is null
) to '{file_name}' (format parquet, compression 'ZSTD')