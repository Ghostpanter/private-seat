-- Private seats: each user's threads stay scoped to their own account.
create table if not exists members (
  user_id      text primary key,
  role         text not null check (role in ('host', 'guest')),
  display_name text,
  joined_at    timestamptz not null default now(),
  revoked_at   timestamptz
);

create table if not exists invites (
  id         text primary key,
  code       text not null unique,
  created_by text not null,
  label      text not null default '',
  max_uses   int not null default 1,
  uses       int not null default 0,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists invites_code_idx on invites (code);

create table if not exists threads (
  id         text primary key,
  user_id    text not null,
  title      text not null default '新对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists threads_user_idx on threads (user_id, updated_at desc);
create unique index if not exists members_one_host_idx on members (role) where role = 'host';

create table if not exists messages (
  id         text primary key,
  thread_id  text not null,
  user_id    text not null,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_idx on messages (thread_id, user_id, created_at);

create table if not exists usage_daily (
  user_id text not null,
  day     date not null,
  turns   int not null default 0,
  primary key (user_id, day)
);
