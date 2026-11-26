-- create indices
create index if not exists idx_indecies_stage_normalized_name on pypi.indecies_stage using gin(normalized_name gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_package_name on pypi.metadata_cdc_stage using gin(package_name gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_normalized_name on pypi.metadata_cdc_stage using gin(normalized_name gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_author_trgm on pypi.metadata_cdc_stage using gin(author gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_version_trgm on pypi.metadata_cdc_stage using gin(version gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_latest on pypi.metadata_cdc_stage(normalized_name, upload_date desc, inserted_at desc);
create index if not exists idx_metadata_cdc_stage_id on pypi.metadata_cdc_stage(id);
create index if not exists idx_metadata_stage_package_name on pypi.metadata_stage using gin(package_name gin_trgm_ops);
create index if not exists idx_metadata_stage_normalized_name on pypi.metadata_stage using gin(normalized_name gin_trgm_ops);
create index if not exists idx_metadata_stage_author_trgm on pypi.metadata_stage using gin(author gin_trgm_ops);
create index if not exists idx_metadata_stage_importance_score on pypi.metadata_stage(importance_score desc);
create index if not exists idx_metadata_stage_releases_count on pypi.metadata_stage(releases_count desc);


-- from staging to production
drop table if exists pypi.indecies;
alter table pypi.indecies_stage rename to indecies;
drop table if exists pypi.metadata_cdc;
alter table pypi.metadata_cdc_stage rename to metadata_cdc;
drop table if exists pypi.metadata;
alter table pypi.metadata_stage rename to metadata;
drop table if exists pypi.package_connections;
alter table pypi.package_connections_stage rename to package_connections;


-- run analyze to update statistics
analyze pypi.indecies;
analyze pypi.metadata_cdc;
analyze pypi.metadata;
analyze pypi.package_connections;
