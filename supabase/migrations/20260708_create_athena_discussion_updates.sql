create table if not exists athena_discussion_updates (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null,
  author text,
  url text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists athena_discussion_updates_discussion_id_idx
  on athena_discussion_updates (discussion_id, created_at desc);
