create extension if not exists "pgcrypto";

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null,
  position integer not null check (position >= 0),
  unique (board_id, position)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id uuid not null references public.columns(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  priority text not null default 'No priority' check (priority in ('No priority', 'Urgent', 'High', 'Medium', 'Low')),
  created_at timestamptz not null default now()
);

create function public.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger workspace_owner_after_insert
after insert on public.workspaces
for each row execute function public.add_workspace_owner();

create index boards_workspace_id_idx on public.boards(workspace_id);
create index columns_board_id_idx on public.columns(board_id);
create index tasks_board_id_idx on public.tasks(board_id);
create index tasks_column_id_idx on public.tasks(column_id);

create function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid()
  );
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.tasks enable row level security;

create policy "members can read workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "users can create workspaces" on public.workspaces for insert with check (created_by = auth.uid());
create policy "members can update workspaces" on public.workspaces for update using (public.is_workspace_member(id));

create policy "members can read membership" on public.workspace_members for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));
create policy "owners can manage membership" on public.workspace_members for all using (
  exists (select 1 from public.workspace_members owner where owner.workspace_id = workspace_id and owner.user_id = auth.uid() and owner.role = 'owner')
);

create policy "members can read boards" on public.boards for select using (public.is_workspace_member(workspace_id));
create policy "members can manage boards" on public.boards for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy "members can read columns" on public.columns for select using (
  exists (select 1 from public.boards where boards.id = columns.board_id and public.is_workspace_member(boards.workspace_id))
);
create policy "members can manage columns" on public.columns for all using (
  exists (select 1 from public.boards where boards.id = columns.board_id and public.is_workspace_member(boards.workspace_id))
);

create policy "members can read tasks" on public.tasks for select using (
  exists (select 1 from public.boards where boards.id = tasks.board_id and public.is_workspace_member(boards.workspace_id))
);
create policy "members can manage tasks" on public.tasks for all using (
  exists (select 1 from public.boards where boards.id = tasks.board_id and public.is_workspace_member(boards.workspace_id))
);
