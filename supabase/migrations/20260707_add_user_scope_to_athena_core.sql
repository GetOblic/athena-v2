alter table discussions
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table athena_discussion_analysis
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table opportunities
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table athena_reviews
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table knowledge_assets
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists discussions_user_id_idx
  on discussions(user_id);

create index if not exists athena_discussion_analysis_user_id_idx
  on athena_discussion_analysis(user_id);

create index if not exists opportunities_user_id_idx
  on opportunities(user_id);

create index if not exists athena_reviews_user_id_idx
  on athena_reviews(user_id);

create index if not exists knowledge_assets_user_id_idx
  on knowledge_assets(user_id);
