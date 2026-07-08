#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-eosql
    -- 
    create extension if not exists pg_trgm;
    
    -- 1. Create your clean schema
    create schema if not exists pypi;

    -- 2. Dynamically create your users using your .env variables
    create user ${POSTGRES_USER_WRITE} with password '${POSTGRES_PASSWORD_WRITE}';
    create user ${POSTGRES_USER_READ} with password '${POSTGRES_PASSWORD_READ}';

    -- 3. Assign their permissions
    grant usage, create on schema pypi to ${POSTGRES_USER_WRITE};
    grant usage on schema pypi to ${POSTGRES_USER_READ};

    -- 4. Ensure future tables automatically get correct permissions 
    alter default privileges for role ${POSTGRES_USER_WRITE} in schema pypi grant all privileges on tables to ${POSTGRES_USER_WRITE};
    alter default privileges for role ${POSTGRES_USER_WRITE} in schema pypi grant select on tables to ${POSTGRES_USER_READ};