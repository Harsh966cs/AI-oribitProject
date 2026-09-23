import type { SupabaseClient } from "@supabase/supabase-js";
import type { Board, BoardColumn, OrbitState, Task, TaskPriority } from "@/lib/orbit";
import type { Database } from "./database.types";

type OrbitClient = SupabaseClient<Database>;

export async function loadRemoteState(client: OrbitClient): Promise<OrbitState | null> {
  const { data: userResult, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userResult.user) return null;

  const { data: memberships, error: membershipError } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userResult.user.id)
    .limit(1);
  if (membershipError) throw membershipError;
  const workspaceId = memberships[0]?.workspace_id;
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
      client.from("tasks").select("id,title,description,priority,column_id,created_at").eq("board_id", board.id).order("created_at"),
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
        createdAt: task.created_at,
      })),
    } satisfies Board;
  }));

  return { workspaceName: workspace.name, boards: boardRows, activeBoardId: boardRows[0].id };
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
    .insert({ board_id: boardId, column_id: task.status, title: task.title, description: task.description, priority: task.priority })
    .select("id,title,description,priority,column_id,created_at")
    .single();
  if (error) throw error;
  return { id: data.id, title: data.title, description: data.description, priority: data.priority as TaskPriority, status: data.column_id, createdAt: data.created_at };
}

export async function updateRemoteTask(client: OrbitClient, task: Task): Promise<void> {
  const { error } = await client
    .from("tasks")
    .update({ column_id: task.status, title: task.title, description: task.description, priority: task.priority })
    .eq("id", task.id);
  if (error) throw error;
}

export async function deleteRemoteTask(client: OrbitClient, taskId: string): Promise<void> {
  const { error } = await client.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}
