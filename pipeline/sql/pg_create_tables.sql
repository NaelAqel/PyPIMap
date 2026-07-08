-- create metadata table
create table if not exists pypi.metadata (
    id                       int primary key
    ,package_name            text not null
    ,normalized_name         text not null
    ,author                  text
    ,home_page               text
    ,last_version            text not null
    ,releases_count          int not null default 0
    ,first_upload_date       timestamp not null
    ,last_upload_date        timestamp not null
    ,is_active_package       bool not null
    ,importance_score        real not null default 0
);

-- create metadata_staging table
drop table if exists pypi.metadata_staging cascade;
create table pypi.metadata_staging (like pypi.metadata);
alter table pypi.metadata_staging add primary key (id);


-- create package_connections table
create table if not exists pypi.package_connections (
    id                        int primary key
    ,releases_count           int not null default 0
    ,parent_core_counts       int not null default 0
    ,parent_non_core_counts   int not null default 0
    ,children_core_counts     int not null default 0
    ,children_non_core_counts int not null default 0
    ,parent_core_ids          int[] default '{}'
    ,parent_non_core_ids      int[] default '{}'
    ,children_core_ids        int[] default '{}'
    ,children_non_core_ids    int[] default '{}'
);

-- create package_connections_staging table
drop table if exists pypi.package_connections_staging cascade;
create table pypi.package_connections_staging (like pypi.package_connections);
alter table pypi.package_connections_staging add primary key (id);


-- create seo_cache
create table if not exists pypi.seo_cache (
    normalized_name         text not null
    ,seo_header             text not null
);

-- create seo_cache_staging table
drop table if exists pypi.seo_cache_staging cascade;
create table pypi.seo_cache_staging (like pypi.seo_cache);
alter table pypi.seo_cache_staging add primary key (normalized_name);