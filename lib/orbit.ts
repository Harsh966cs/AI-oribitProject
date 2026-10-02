export type TaskPriority = "No priority" | "Urgent" | "High" | "Medium" | "Low";

export type Task = {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: string;
  createdAt: string;
  assignedTo?: string | null;
  updatedAt?: string;
};

export type WorkspaceMember = {
  userId: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "member";
};

export type WorkspaceInvitation = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
};

export type TaskActivity = {
  id: string;
  action: "created" | "updated" | "moved" | "assigned" | "deleted";
  actorName: string;
  createdAt: string;
};

export type BoardColumn = {
  id: string;
  name: string;
  color: string;
};

export type Board = {
  id: string;
  name: string;
  columns: BoardColumn[];
  tasks: Task[];
};

export type OrbitState = {
  workspaceName: string;
  workspaceId?: string;
  boards: Board[];
  activeBoardId: string;
};

export const defaultColumns: BoardColumn[] = [
  { id: "backlog", name: "Backlog", color: "#8b5cf6" },
  { id: "todo", name: "Todo", color: "#38bdf8" },
  { id: "in-progress", name: "In progress", color: "#f59e0b" },
  { id: "done", name: "Done", color: "#22c55e" },
];

const initialTasks: Task[] = [
  {
    id: "task-design-system",
    title: "Define the Orbit design system",
    description: "Capture the visual language, spacing, and reusable patterns for the product.",
    priority: "High",
    status: "in-progress",
    createdAt: "2026-09-20T08:00:00.000Z",
    assignedTo: null,
  },
  {
    id: "task-invite-team",
    title: "Invite the product team",
    description: "Bring the first collaborators into the workspace once onboarding is ready.",
    priority: "Medium",
    status: "todo",
    createdAt: "2026-09-21T08:00:00.000Z",
    assignedTo: null,
  },
  {
    id: "task-map-workflow",
    title: "Map the onboarding workflow",
    description: "Sketch the steps from creating a workspace to shipping the first task.",
    priority: "No priority",
    status: "backlog",
    createdAt: "2026-09-22T08:00:00.000Z",
    assignedTo: null,
  },
];

export const createInitialState = (): OrbitState => ({
  workspaceName: "Acme Inc.",
  boards: [
    {
      id: "board-product",
      name: "Product roadmap",
      columns: defaultColumns,
      tasks: initialTasks,
    },
  ],
  activeBoardId: "board-product",
});

export const storageKey = "orbit-local-mvp-v1";

export function isOrbitState(value: unknown): value is OrbitState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<OrbitState>;
  return (
    typeof state.workspaceName === "string" &&
    typeof state.activeBoardId === "string" &&
    Array.isArray(state.boards) &&
    state.boards.every(
      (board) =>
        typeof board.id === "string" &&
        typeof board.name === "string" &&
        Array.isArray(board.columns) &&
        Array.isArray(board.tasks),
    )
  );
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
