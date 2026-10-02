create index if not exists task_activity_workspace_id_created_at_idx
on public.task_activity (workspace_id, created_at desc);

create or replace function public.record_task_activity()
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
  values (
    target_workspace_id,
    case when tg_op = 'DELETE' then null else new.id end,
    auth.uid(),
    target_action
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
