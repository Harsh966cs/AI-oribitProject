alter table public.stripe_webhook_events
  add column processing_status text not null default 'pending'
  check (processing_status in ('pending', 'processing', 'processed'));

alter table public.stripe_webhook_events
  alter column processed_at drop not null,
  alter column processed_at drop default;

update public.stripe_webhook_events
set processing_status = 'processed'
where processed_at is not null;

create or replace function public.enforce_workspace_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_plan text;
  workspace_status text;
  member_count integer;
  board_count integer;
begin
  select plan, status
  into workspace_plan, workspace_status
  from public.workspace_subscriptions
  where workspace_id = new.workspace_id;

  if coalesce(workspace_plan, 'lite') = 'pro'
     and coalesce(workspace_status, 'inactive') in ('trialing', 'active', 'past_due') then
    return new;
  end if;

  if tg_table_name = 'workspace_members' then
    select count(*) into member_count
    from public.workspace_members
    where workspace_id = new.workspace_id;
    if member_count >= 5 then
      raise exception 'Lite plan workspaces can have up to 5 members. Upgrade to Pro to add more.';
    end if;
  elsif tg_table_name = 'boards' then
    select count(*) into board_count
    from public.boards
    where workspace_id = new.workspace_id;
    if board_count >= 3 then
      raise exception 'Lite plan workspaces can have up to 3 boards. Upgrade to Pro to add more.';
    end if;
  end if;
  return new;
end;
$$;
