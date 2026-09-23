import type { SupabaseClient } from "@supabase/supabase-js";
import type { Board, BoardColumn, OrbitState, Task, TaskActivity, TaskPriority, WorkspaceInvitation, WorkspaceMember } from "@/lib/orbit";
import type { Database } from "./database.types";

type OrbitClient = SupabaseClient<Database>;

export async function loadRemoteState(client: OrbitClient, requestedWorkspaceId?: string): Promise<OrbitState | null> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userResult.user) return null;

  let membershipQuery = client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userResult.user.id)
    .limit(1);
  if (requestedWorkspaceId) membershipQuery = membershipQuery.eq("workspace_id", requestedWorkspaceId);
  const { data: memberships, error: membershipError } = await membershipQuery;
  if (membershipError) throw membershipError;
  const workspaceId = requestedWorkspaceId ?? memberships[0]?.workspace_id;
  if (!workspaceId) return null;

  const [{ data: workspace, error: workspaceError }, { data: boards, error: boardsError }] = await Promise.all([
    client.from("workspaces").select("id,name").eq("id", workspaceId).single(),
    client.from("boards").select("id,name,workspace_id").eq("workspace_id", workspaceId).order("created_at"),
  ]);
  if (workspaceError) throw workspaceError;
  if (boardsError) throw boardsError;
  if (!boards?.length) return null;

  const boardRows = await Promise.all(boards.map(async (board) => {
    const [{ data: columns, error: columnsError }, { data: tasks, error: tasksError }] = await Promise.all([
      client.from("columns").select("id,name,color,position").eq("board_id", board.id).order("position"),
      client.from("tasks").select("id,title,description,priority,column_id,assigned_to,created_at,updated_at").eq("board_id", board.id).order("created_at"),
    ]);
    if (columnsError) throw columnsError;
    if (tasksError) throw tasksError;
    return {
      id: board.id,
      name: board.name,
      columns: (columns ?? []).map((column): BoardColumn => ({ id: column.id, name: column.name, color: column.color })),
      tasks: (tasks ?? []).map((task): Task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority as TaskPriority,
        status: task.column_id,
        assignedTo: task.assigned_to,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      })),
    } satisfies Board;
  }));

  return { workspaceName: workspace.name, workspaceId, boards: boardRows, activeBoardId: boardRows[0].id };
}

export async function createWorkspaceWithBoard(client: OrbitClient, name: string): Promise<OrbitState> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userResult.user) throw new Error("You must sign in before creating a workspace.");

  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"}-${Date.now()}`;
  const { error: workspaceInsertError } = await client
    .from("workspaces")
    .insert({ name, slug, created_by: userResult.user.id });
  if (workspaceInsertError) throw workspaceInsertError;
  const { data: workspace, error: workspaceError } = await client
    .from("workspaces")
    .select("id,name")
    .eq("slug", slug)
    .single();
  if (workspaceError) throw workspaceError;

  const { data: board, error: boardError } = await client
    .from("boards")
    .insert({ workspace_id: workspace.id, name: "Product roadmap" })
    .select("id,name")
    .single();
  if (boardError) throw boardError;

  const columns = [
    { name: "Backlog", color: "#8b5cf6", position: 0 },
    { name: "Todo", color: "#38bdf8", position: 1 },
    { name: "In progress", color: "#f59e0b", position: 2 },
    { name: "Done", color: "#22c55e", position: 3 },
  ];
  const { data: columnRows, error: columnsError } = await client
    .from("columns")
    .insert(columns.map((column) => ({ ...column, board_id: board.id })))
    .select("id,name,color,position")
    .order("position");
  if (columnsError) throw columnsError;

  return {
    workspaceName: workspace.name,
    workspaceId: workspace.id,
    activeBoardId: board.id,
    boards: [{ id: board.id, name: board.name, columns: columnRows.map((column) => ({ id: column.id, name: column.name, color: column.color })), tasks: [] }],
  };
}

export async function createRemoteBoard(client: OrbitClient, name: string): Promise<Board> {
  const { data: membership, error: membershipError } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", (await client.auth.getUser()).data.user?.id ?? "")
    .limit(1)
    .single();
  if (membershipError) throw membershipError;

  const { data: board, error: boardError } = await client
    .from("boards")
    .insert({ workspace_id: membership.workspace_id, name })
    .select("id,name")
    .single();
  if (boardError) throw boardError;

  const columns = [
    { name: "Backlog", color: "#8b5cf6", position: 0 },
    { name: "Todo", color: "#38bdf8", position: 1 },
    { name: "In progress", color: "#f59e0b", position: 2 },
    { name: "Done", color: "#22c55e", position: 3 },
  ];
  const { data: columnRows, error: columnsError } = await client
    .from("columns")
    .insert(columns.map((column) => ({ ...column, board_id: board.id })))
    .select("id,name,color,position")
    .order("position");
  if (columnsError) throw columnsError;
  return { id: board.id, name: board.name, columns: columnRows.map((column) => ({ id: column.id, name: column.name, color: column.color })), tasks: [] };
}

export async function createRemoteTask(client: OrbitClient, boardId: string, task: Omit<Task, "id" | "createdAt">): Promise<Task> {
  const { data, error } = await client
    .from("tasks")
    .insert({ board_id: boardId, column_id: task.status, title: task.title, description: task.description, priority: task.priority, assigned_to: task.assignedTo ?? null })
    .select("id,title,description,priority,column_id,assigned_to,created_at,updated_at")
    .single();
  if (error) throw error;
  return { id: data.id, title: data.title, description: data.description, priority: data.priority as TaskPriority, status: data.column_id, assignedTo: data.assigned_to, createdAt: data.created_at, updatedAt: data.updated_at };
}

export async function updateRemoteTask(client: OrbitClient, task: Task): Promise<void> {
  let query = client
    .from("tasks")
    .update({ column_id: task.status, title: task.title, description: task.description, priority: task.priority, assigned_to: task.assignedTo ?? null })
    .eq("id", task.id);
  if (task.updatedAt) query = query.eq("updated_at", task.updatedAt);
  const { data, error } = await query.select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This task changed elsewhere. Refresh the board and try again.");
}

export async function deleteRemoteTask(client: OrbitClient, taskId: string): Promise<void> {
  const { error } = await client.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function loadWorkspaceMembers(client: OrbitClient, workspaceId?: string): Promise<WorkspaceMember[]> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userResult.user) return [];

  const { data: membership, error: membershipError } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userResult.user.id)
    .limit(1)
    .single();
  if (membershipError && !workspaceId) throw membershipError;
  const targetWorkspaceId = workspaceId ?? membership?.workspace_id;
  if (!targetWorkspaceId) return [];

  const { data, error } = await client
    .from("workspace_members")
    .select("user_id,role")
    .eq("workspace_id", targetWorkspaceId)
    .order("created_at");
  if (error) throw error;

  const userIds = (data ?? []).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = userIds.length
    ? await client.from("profiles").select("id,email,display_name").in("id", userIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return (data ?? []).map((member) => {
    const profile = profilesById.get(member.user_id);
    return {
      userId: member.user_id,
      email: profile?.email ?? "Unknown email",
      displayName: profile?.display_name ?? "Workspace member",
      role: member.role,
    };
  });
}

export async function inviteWorkspaceMember(
  client: OrbitClient,
  email: string,
  role: "admin" | "member",
): Promise<void> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userResult.user) throw new Error("You must sign in before inviting a member.");

  const { data: membership, error: membershipError } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userResult.user.id)
    .limit(1)
    .single();
  if (membershipError) throw membershipError;

  const { error } = await client.from("workspace_invitations").insert({
    workspace_id: membership.workspace_id,
    email: email.toLowerCase(),
    role,
    invited_by: userResult.user.id,
  });
  if (error) throw error;
}

async function getCurrentWorkspaceId(client: OrbitClient): Promise<string> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userResult.user) throw new Error("You must sign in first.");
  const { data, error } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userResult.user.id)
    .limit(1)
    .single();
  if (error) throw error;
  return data.workspace_id;
}

export async function loadWorkspaceInvitations(client: OrbitClient, requestedWorkspaceId?: string): Promise<WorkspaceInvitation[]> {
  const workspaceId = requestedWorkspaceId ?? await getCurrentWorkspaceId(client);
  const { data, error } = await client
    .from("workspace_invitations")
    .select("id,email,role,status,created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    createdAt: invitation.created_at,
  }));
}

export async function loadMyWorkspaceInvitations(client: OrbitClient): Promise<WorkspaceInvitation[]> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const email = userResult.user?.email?.toLowerCase();
  if (!email) return [];

  const { data, error } = await client
    .from("workspace_invitations")
    .select("id,email,role,status,created_at")
    .ilike("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    createdAt: invitation.created_at,
  }));
}

export async function revokeWorkspaceInvitation(client: OrbitClient, invitationId: string): Promise<void> {
  const { error } = await client
    .from("workspace_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function removeWorkspaceMember(client: OrbitClient, workspaceId: string, userId: string): Promise<void> {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();
  if (profileError) throw profileError;

  const { error: membershipError } = await client
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (membershipError) throw membershipError;

  const { error: invitationError } = await client
    .from("workspace_invitations")
    .update({ status: "revoked" })
    .eq("workspace_id", workspaceId)
    .ilike("email", profile.email)
    .in("status", ["pending", "accepted"]);
  if (invitationError) throw invitationError;
}

export async function acceptWorkspaceInvitation(client: OrbitClient, invitationId: string): Promise<string> {
  const { data, error } = await client.rpc("accept_workspace_invitation", { target_invitation_id: invitationId });
  if (error) throw error;
  return data;
}

export async function loadTaskActivity(client: OrbitClient, taskId: string): Promise<TaskActivity[]> {
  const { data, error } = await client
    .from("task_activity")
    .select("id,action,actor_id,created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  const actorIds = [...new Set((data ?? []).map((item) => item.actor_id))];
  const { data: profiles, error: profilesError } = actorIds.length
    ? await client.from("profiles").select("id,display_name").in("id", actorIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));

  return (data ?? []).map((item) => ({
    id: item.id,
    action: item.action,
    actorName: names.get(item.actor_id) ?? "Workspace member",
    createdAt: item.created_at,
  }));
}
