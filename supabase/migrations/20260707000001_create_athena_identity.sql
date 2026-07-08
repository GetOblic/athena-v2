create table if not exists athena_identity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  greeting_name text,
  about_you text,
  expertise text,
  website text,

  brain_status text not null default 'pending',
  brain_last_updated timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint athena_identity_user_id_unique unique (user_id)
);

create table if not exists identity_documents (
  id uuid primary key default gen_random_uuid(),

  identity_id uuid not null references athena_identity(id) on delete cascade,

  filename text not null,
  file_type text,
  storage_path text,

  status text not null default 'pending',
  chunks_created integer not null default 0,
  knowledge_assets_created integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identity_documents_identity_id_idx
  on identity_documents(identity_id);
