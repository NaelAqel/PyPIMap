create extension if not exists pg_trgm;

-- create indecies table
drop table if exists pypi.indecies_stage;
create table if not exists pypi.indecies_stage (
    id                       serial primary key
    ,normalized_name         text not null unique
    ,inserted_at             timestamptz not null default now()
);


-- create metadata cdc table
drop table if exists pypi.metadata_cdc_stage;
create table if not exists pypi.metadata_cdc_stage (
    id                       int
    ,package_name            text not null
    ,normalized_name         text not null
    ,author                  text
    ,home_page               text
    ,version                 text not null
    ,upload_date             timestamptz not null
    ,is_active_package       bool not null
    ,inserted_at             timestamptz not null default now()
);


-- create metadata table
drop table if exists pypi.metadata_stage;
create table if not exists pypi.metadata_stage (
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
    ,inserted_at             timestamptz not null default now()
    ,updated_at              timestamptz not null default now()
);


-- create package connections table
drop table if exists pypi.package_connections_stage;
create table if not exists pypi.package_connections_stage (
    id                        int primary key
    ,is_active_package        bool not null
    ,parent_core_counts       int not null default 0
    ,parent_non_core_counts   int not null default 0
    ,children_core_counts     int not null default 0
    ,children_non_core_counts int not null default 0
    ,parent_core_ids          int[] default '{}'
    ,parent_non_core_ids      int[] default '{}'
    ,children_core_ids        int[] default '{}'
    ,children_non_core_ids    int[] default '{}'
    ,inserted_at              timestamptz not null default now()
    ,updated_at               timestamptz not null default now()
);


-- create seo_cache
drop table if exists pypi.seo_cache_stage;
create table if not exists pypi.seo_cache_stage (
    normalized_name         text not null primary key
    ,seo_header             text not null
    ,is_active_package      bool not null
    ,inserted_at            timestamptz not null default now()
    ,updated_at             timestamptz not null default now()
);
