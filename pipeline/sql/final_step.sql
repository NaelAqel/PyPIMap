select count(*) from pypi.metadata_staging ;                -- checkers
select count(*) from pypi.package_connections_staging ;
select count(*) from pypi.seo_cache_staging ;

-- indexing 
create index if not exists idx_metadata_package_name on pypi.metadata_staging using gin(package_name gin_trgm_ops);
create index if not exists idx_metadata_author_trgm on pypi.metadata_staging using gin(author gin_trgm_ops);
create index if not exists idx_metadata_importance_score on pypi.metadata_staging(importance_score desc);
create index if not exists idx_metadata_releases_count on pypi.metadata_staging(releases_count desc);


-- run analyze to update statistics
analyze pypi.metadata_staging;
analyze pypi.package_connections_staging;
analyze pypi.seo_cache_staging;


-- from staging in production (will run after commit previous)
drop table pypi.metadata;
alter table pypi.metadata_staging rename to metadata;
drop table pypi.package_connections;
alter table pypi.package_connections_staging rename to package_connections;
drop table pypi.seo_cache;
alter table pypi.seo_cache_staging rename to seo_cache;

