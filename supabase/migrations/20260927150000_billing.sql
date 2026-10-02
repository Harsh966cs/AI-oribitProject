create table public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'lite' check (plan in ('lite', 'pro')),
  status text not null default 'inactive' check (status in ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index workspace_subscriptions_status_idx
on public.workspace_subscriptions (status, plan);

create or replace function public.seed_workspace_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_subscriptions (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

create trigger workspace_subscription_after_insert
after insert on public.workspaces
for each row execute function public.seed_workspace_subscription();

insert into public.workspace_subscriptions (workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;

alter table public.workspace_subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy "members can read workspace subscription"
on public.workspace_subscriptions
for select using (public.is_workspace_member(workspace_id));

create function public.touch_workspace_subscription_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspace_subscriptions_touch_updated_at
before update on public.workspace_subscriptions
for each row execute function public.touch_workspace_subscription_updated_at();

create function public.enforce_workspace_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_plan text;
  member_count integer;
  board_count integer;
begin
  if tg_table_name = 'workspace_members' then
    select plan into workspace_plan
    from public.workspace_subscriptions
    where workspace_id = new.workspace_id;

    if coalesce(workspace_plan, 'lite') = 'lite' then
      select count(*) into member_count
      from public.workspace_members
      where workspace_id = new.workspace_id;
      if member_count >= 5 then
        raise exception 'Lite plan workspaces can have up to 5 members. Upgrade to Pro to add more.';
      end if;
    end if;
  elsif tg_table_name = 'boards' then
    select plan into workspace_plan
    from public.workspace_subscriptions
    where workspace_id = new.workspace_id;

    if coalesce(workspace_plan, 'lite') = 'lite' then
      select count(*) into board_count
      from public.boards
      where workspace_id = new.workspace_id;
      if board_count >= 3 then
        raise exception 'Lite plan workspaces can have up to 3 boards. Upgrade to Pro to add more.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger workspace_member_plan_limit
before insert on public.workspace_members
for each row execute function public.enforce_workspace_plan_limits();

create trigger workspace_board_plan_limit
before insert on public.boards
for each row execute function public.enforce_workspace_plan_limits();
