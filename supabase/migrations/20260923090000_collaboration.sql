create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

insert into public.profiles (id, email, display_name)
select id, email, coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

create function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger profile_after_auth_user_insert
after insert on auth.users
for each row execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;

create policy "users can read profiles in their workspaces" on public.profiles
for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.workspace_members viewer_membership
    join public.workspace_members target_membership
      on target_membership.workspace_id = viewer_membership.workspace_id
    where viewer_membership.user_id = auth.uid()
      and target_membership.user_id = profiles.id
  )
);

alter table public.workspace_members
  drop constraint workspace_members_role_check;

alter table public.workspace_members
  add constraint workspace_members_role_check check (role in ('owner', 'admin', 'member'));

alter table public.workspace_members
  add constraint workspace_members_user_profile_fk
  foreign key (user_id) references public.profiles(id) on delete cascade;

create or replace function public.is_workspace_manager(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index workspace_pending_invitation_idx
on public.workspace_invitations (workspace_id, lower(email))
where status = 'pending';

create index workspace_invitations_workspace_id_idx
on public.workspace_invitations (workspace_id, created_at desc);

alter table public.workspace_invitations enable row level security;

create policy "members can read workspace invitations" on public.workspace_invitations
for select using (public.is_workspace_member(workspace_id));

create policy "owners and admins can manage invitations" on public.workspace_invitations
for all using (public.is_workspace_manager(workspace_id))
with check (public.is_workspace_manager(workspace_id));

create policy "invitees can read their invitations" on public.workspace_invitations
for select using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy "owners can manage membership" on public.workspace_members;

create policy "owners and admins can add members" on public.workspace_members
for insert with check (
  role <> 'owner'
  and public.is_workspace_manager(workspace_id)
);

create policy "owners and admins can update members" on public.workspace_members
for update using (role <> 'owner' and public.is_workspace_manager(workspace_id))
with check (role <> 'owner');

create policy "owners and admins can remove members" on public.workspace_members
for delete using (
  role <> 'owner'
  and public.is_workspace_manager(workspace_id)
);

create or replace function public.accept_workspace_invitation(target_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.workspace_invitations;
  current_email text;
begin
  select email into current_email from auth.users where id = auth.uid();
  if current_email is null then
    raise exception 'You must be signed in to accept an invitation.';
  end if;

  select * into invitation
  from public.workspace_invitations
  where id = target_invitation_id
    and status = 'pending'
    and lower(email) = lower(current_email)
  for update;

  if invitation.id is null then
    raise exception 'Invitation not found or it belongs to another email address.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (invitation.workspace_id, auth.uid(), invitation.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  update public.workspace_invitations
  set status = 'accepted'
  where id = invitation.id;

  return invitation.workspace_id;
end;
$$;

grant execute on function public.accept_workspace_invitation(uuid) to authenticated;

alter table public.tasks add column assigned_to uuid references public.profiles(id) on delete set null;
alter table public.tasks add column updated_at timestamptz not null default now();
create index tasks_assigned_to_idx on public.tasks(assigned_to);

create function public.touch_task_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_touch_updated_at
before update on public.tasks
for each row execute function public.touch_task_updated_at();

drop policy "members can manage tasks" on public.tasks;

create policy "members can manage tasks" on public.tasks
for all using (
  exists (
    select 1 from public.boards
    where boards.id = tasks.board_id
      and public.is_workspace_member(boards.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.boards
    where boards.id = tasks.board_id
      and public.is_workspace_member(boards.workspace_id)
  )
  and (
    assigned_to is null
    or exists (
      select 1 from public.boards
      join public.workspace_members assigned_member
        on assigned_member.workspace_id = boards.workspace_id
       and assigned_member.user_id = tasks.assigned_to
      where boards.id = tasks.board_id
    )
  )
);

create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'moved', 'assigned', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index task_activity_task_id_created_at_idx
on public.task_activity (task_id, created_at desc);

alter table public.task_activity enable row level security;

create policy "members can read task activity" on public.task_activity
for select using (public.is_workspace_member(workspace_id));

create policy "members can create task activity" on public.task_activity
for insert with check (
  actor_id = auth.uid() and public.is_workspace_member(workspace_id)
);

create function public.record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  target_action text;
begin
  if tg_op = 'DELETE' then
    select workspace_id into target_workspace_id from public.boards where id = old.board_id;
  else
    select workspace_id into target_workspace_id from public.boards where id = new.board_id;
  end if;
  if target_workspace_id is null or auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    target_action := 'created';
  elsif tg_op = 'DELETE' then
    target_action := 'deleted';
  elsif old.column_id is distinct from new.column_id then
    target_action := 'moved';
  elsif old.assigned_to is distinct from new.assigned_to then
    target_action := 'assigned';
  else
    target_action := 'updated';
  end if;

  insert into public.task_activity (workspace_id, task_id, actor_id, action)
  values (target_workspace_id, case when tg_op = 'DELETE' then old.id else new.id end, auth.uid(), target_action);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger task_activity_after_change
after insert or update or delete on public.tasks
for each row execute function public.record_task_activity();
