-- Host-only Grok key. Never selected into guest responses.
create table if not exists grok_link (
  id         int primary key default 1,
  api_key    text not null,
  updated_at timestamptz not null default now(),
  constraint grok_link_singleton check (id = 1)
);
