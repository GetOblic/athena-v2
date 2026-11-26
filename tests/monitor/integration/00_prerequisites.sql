-- Disposable PostgreSQL prerequisites for the Monitor category publication tests.
-- This file is not a production migration and is not part of the runtime transfer.
-- It creates only the roles and tables the original Monitor migration references.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create table if not exists public.organizations (
  id uuid primary key
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;
