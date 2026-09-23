"use client";

import { FormEvent, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BoardColumn,
  createId,
  createInitialState,
  isOrbitState,
  OrbitState,
  storageKey,
  Task,
  TaskPriority,
} from "@/lib/orbit";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  createRemoteBoard,
  createRemoteTask,
  createWorkspaceWithBoard,
  deleteRemoteTask,
  loadRemoteState,
  updateRemoteTask,
} from "@/lib/supabase/orbit-data";

const priorityStyles: Record<TaskPriority, string> = {
  Urgent: "priority-urgent",
  High: "priority-high",
  Medium: "priority-medium",
  Low: "priority-low",
  "No priority": "priority-none",
};
const priorityOptions: TaskPriority[] = ["No priority", "Urgent", "High", "Medium", "Low"];

function isMissingAuthSession(error: { code?: string; message?: string } | null) {
  return error?.code === "session_not_found" || error?.message === "Auth session missing!";
}

export default function Home() {
  const [state, setState] = useState<OrbitState>(createInitialState);
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isLight, setIsLight] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingBoard, setIsAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [search, setSearch] = useState("");
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [remoteMode, setRemoteMode] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    const timers: number[] = [];
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored);
        if (isOrbitState(parsed)) timers.push(window.setTimeout(() => setState(parsed), 0));
      } catch {
        timers.push(window.setTimeout(() => setStorageError("Local workspace data is invalid and was not loaded."), 0));
      }
    }
    const savedTheme = window.localStorage.getItem("orbit-theme") === "light";
    timers.push(window.setTimeout(() => setIsLight(savedTheme), 0));
    timers.push(window.setTimeout(() => setIsReady(true), 0));
    try {
      const client = createSupabaseBrowserClient();
      timers.push(window.setTimeout(() => setSupabase(client), 0));
      client.auth.getUser().then(async ({ data, error }) => {
        if (error) {
          if (!isMissingAuthSession(error)) setAuthMessage(error.message);
          return;
        }
        if (!data.user) return;
        setRemoteMode(true);
        try {
          const remoteState = await loadRemoteState(client);
          if (remoteState) {
            setState(remoteState);
          } else {
            setState({ workspaceName: "", boards: [], activeBoardId: "" });
            setNeedsOnboarding(true);
          }
        } catch (caughtError) {
          setStorageError(caughtError instanceof Error ? caughtError.message : "Remote workspace could not be loaded.");
        }
      }).catch((caughtError: unknown) => {
        setStorageError(caughtError instanceof Error ? caughtError.message : "Authentication could not be checked.");
      });
    } catch {
      // Supabase is optional while running the local-first MVP.
    }
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!isReady || remoteMode) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      window.setTimeout(() => setStorageError("Local storage is unavailable. Remote changes are unaffected."), 0);
    }
  }, [isReady, remoteMode, state]);

  useEffect(() => {
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
    if (isReady) window.localStorage.setItem("orbit-theme", isLight ? "light" : "dark");
  }, [isLight, isReady]);

  const activeBoard = state.boards.find((board) => board.id === state.activeBoardId) ?? state.boards[0];
  const selectedTask = activeBoard?.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const updateState = (update: (current: OrbitState) => OrbitState) => setState((current) => update(current));

  const addBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newBoardName.trim();
    if (!name || !activeBoard) return;
    try {
      const board = remoteMode && supabase
        ? await createRemoteBoard(supabase, name)
        : { id: createId("board"), name, columns: activeBoard.columns, tasks: [] };
      updateState((current) => ({ ...current, boards: [...current.boards, board], activeBoardId: board.id }));
      setNewBoardName("");
      setIsAddingBoard(false);
    } catch (caughtError) {
      setStorageError(caughtError instanceof Error ? caughtError.message : "Board could not be created.");
    }
  };

  const addTask = async (task: Omit<Task, "id" | "createdAt">) => {
    if (!activeBoard) return;
    try {
      const nextTask = remoteMode && supabase
        ? await createRemoteTask(supabase, activeBoard.id, task)
        : { ...task, id: createId("task"), createdAt: new Date().toISOString() };
      updateState((current) => ({
        ...current,
        boards: current.boards.map((board) => board.id === activeBoard.id ? { ...board, tasks: [...board.tasks, nextTask] } : board),
      }));
      setIsAddingTask(false);
    } catch (caughtError) {
      setStorageError(caughtError instanceof Error ? caughtError.message : "Task could not be created.");
    }
  };

  const updateTask = async (task: Task) => {
    if (!activeBoard) return;
    try {
      if (remoteMode && supabase) await updateRemoteTask(supabase, task);
      updateState((current) => ({
        ...current,
        boards: current.boards.map((board) => board.id === activeBoard.id ? { ...board, tasks: board.tasks.map((item) => item.id === task.id ? task : item) } : board),
      }));
    } catch (caughtError) {
      setStorageError(caughtError instanceof Error ? caughtError.message : "Task could not be updated.");
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!activeBoard) return;
    try {
      if (remoteMode && supabase) await deleteRemoteTask(supabase, taskId);
      updateState((current) => ({
        ...current,
        boards: current.boards.map((board) => board.id === activeBoard.id ? { ...board, tasks: board.tasks.filter((task) => task.id !== taskId) } : board),
      }));
      setSelectedTaskId(null);
    } catch (caughtError) {
      setStorageError(caughtError instanceof Error ? caughtError.message : "Task could not be deleted.");
    }
  };

  const moveTask = (taskId: string, status: string) => {
    const task = activeBoard?.tasks.find((item) => item.id === taskId);
    if (task && task.status !== status) void updateTask({ ...task, status });
  };

  const completeOnboarding = async (name: string) => {
    if (!supabase) return;
    try {
      const remoteState = await createWorkspaceWithBoard(supabase, name);
      setState(remoteState);
      setNeedsOnboarding(false);
      setRemoteMode(true);
    } catch (caughtError) {
      setStorageError(caughtError instanceof Error ? caughtError.message : "Workspace could not be created.");
    }
  };

  if (!activeBoard && needsOnboarding) {
    return <main className="auth-page"><WorkspaceOnboarding onCreate={completeOnboarding} /></main>;
  }
  if (!activeBoard) return null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark">O</div><span>Orbit</span><button className="icon-button sidebar-collapse" aria-label="Collapse sidebar">←</button></div>
        <div className="workspace-switcher"><div className="workspace-avatar">A</div><div><strong>{state.workspaceName}</strong><span>Workspace</span></div><span className="chevron">⌄</span></div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button className="nav-item active"><span>⌂</span> Overview <kbd>G O</kbd></button>
          <button className="nav-item"><span>◷</span> My issues <kbd>G M</kbd></button>
          <button className="nav-item"><span>✦</span> Inbox <span className="nav-count">3</span></button>
        </nav>
        <div className="sidebar-section"><div className="section-heading"><span>Workspace</span><button className="icon-button">＋</button></div><button className="nav-item"><span>▦</span> Views</button><button className="nav-item"><span>⌁</span> Projects</button></div>
        <div className="sidebar-section boards-section">
          <div className="section-heading"><span>Boards</span><button className="icon-button" onClick={() => setIsAddingBoard(true)}>＋</button></div>
          {state.boards.map((board) => <button key={board.id} className={`nav-item board-link ${board.id === activeBoard.id ? "active" : ""}`} onClick={() => updateState((current) => ({ ...current, activeBoardId: board.id }))}><span className="board-dot" /> {board.name}</button>)}
          {isAddingBoard && <form className="inline-form" onSubmit={addBoard}><input autoFocus value={newBoardName} onChange={(event) => setNewBoardName(event.target.value)} placeholder="Board name" /></form>}
        </div>
        <div className="sidebar-footer"><button className="nav-item"><span>⚙</span> Settings</button><button className="nav-item"><span>?</span> Help & support</button><div className="profile-row"><div className="profile-avatar">H</div><div><strong>Harsh</strong><span>Free plan</span></div><span className="more">•••</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>Boards</span><span>/</span><strong>{activeBoard.name}</strong></div><div className="topbar-actions"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" /><kbd>⌘ K</kbd></label><button className="icon-button theme-button" onClick={() => setIsLight((value) => !value)} aria-label="Toggle color theme">{isLight ? "☀" : "☾"}</button><button className="avatar-button">H</button></div></header>
        {storageError && <div className="storage-banner" role="alert">{storageError}</div>}
        {authMessage && <div className="storage-banner" role="alert">Supabase auth is unavailable: {authMessage}</div>}
        <div className="content-wrap">
          <div className="page-heading"><div><div className="eyebrow"><span className="board-dot" /> BOARD</div><h1>{activeBoard.name}</h1><p>Plan, prioritize, and ship great work together.</p></div><div className="heading-actions"><button className="secondary-button">⋯</button><button className="primary-button" onClick={() => setIsAddingTask(true)}>＋ Add task</button></div></div>
          <div className="board-toolbar"><div className="view-tabs"><button className="view-tab active">▦ Board</button><button className="view-tab">☷ List</button></div><div className="toolbar-actions"><button className="toolbar-button">↕ Filter</button><button className="toolbar-button">⇅ Sort</button><button className="toolbar-button">⚙</button></div></div>
          {!isReady ? <div className="loading-state">Loading your workspace…</div> : <div className="kanban-board">{activeBoard.columns.map((column) => {
            const tasks = activeBoard.tasks.filter((task) => task.status === column.id && (!search.trim() || `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase())));
            return <KanbanColumn key={column.id} column={column} tasks={tasks} onDrop={moveTask} onSelect={setSelectedTaskId} onAdd={() => setIsAddingTask(true)} />;
          })}</div>}
        </div>
      </main>
      {(isAddingTask || selectedTask) && <TaskDialog task={selectedTask} defaultStatus={activeBoard.columns[0]?.id ?? "backlog"} onClose={() => { setIsAddingTask(false); setSelectedTaskId(null); }} onCreate={addTask} onSave={updateTask} onDelete={deleteTask} />}
      {needsOnboarding && <WorkspaceOnboarding onCreate={completeOnboarding} />}
    </div>
  );
}

function KanbanColumn({ column, tasks, onDrop, onSelect, onAdd }: { column: BoardColumn; tasks: Task[]; onDrop: (taskId: string, status: string) => void; onSelect: (id: string) => void; onAdd: () => void }) {
  return <section className="kanban-column" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData("text/plain"); if (taskId) onDrop(taskId, column.id); }}>
    <div className="column-header"><div><span className="status-dot" style={{ backgroundColor: column.color }} /> <strong>{column.name}</strong><span className="task-count">{tasks.length}</span></div><button className="icon-button" onClick={onAdd}>＋</button></div>
    <div className="task-list">{tasks.map((task) => <TaskCard key={task.id} task={task} onSelect={onSelect} />)}{tasks.length === 0 && <div className="empty-column">Drop tasks here</div>}</div>
    <button className="add-task-link" onClick={onAdd}>＋ Add task</button>
  </section>;
}

function TaskCard({ task, onSelect }: { task: Task; onSelect: (id: string) => void }) {
  return <article className="task-card" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)} onClick={() => onSelect(task.id)}>
    <div className="task-card-top"><span className={`priority ${priorityStyles[task.priority]}`} title={task.priority}>◆</span><span className="task-id">{task.id.replace("task-", "OR-").slice(0, 9).toUpperCase()}</span><button className="card-more" onClick={(event) => event.stopPropagation()}>•••</button></div>
    <h3>{task.title}</h3>{task.description && <p>{task.description}</p>}
    <div className="task-card-footer"><span className={`priority-label ${priorityStyles[task.priority]}`}>{task.priority}</span><span className="mini-avatar">H</span></div>
  </article>;
}

function TaskDialog({ task, defaultStatus, onClose, onCreate, onSave, onDelete }: { task: Task | null; defaultStatus: string; onClose: () => void; onCreate: (task: Omit<Task, "id" | "createdAt">) => void; onSave: (task: Task) => void; onDelete: (id: string) => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "No priority");
  const [status, setStatus] = useState(task?.status ?? defaultStatus);
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) { setError("A task title is required."); return; }
    const values = { title: title.trim(), description: description.trim(), priority, status };
    if (task) onSave({ ...task, ...values }); else onCreate(values);
    onClose();
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="task-dialog" onSubmit={submit}><div className="dialog-header"><div><span className="eyebrow">{task ? "EDIT TASK" : "NEW TASK"}</span><h2>{task ? "Edit task" : "Create a task"}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
      <label>Title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" /></label>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context for your team…" rows={4} /></label>
      <div className="form-grid"><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{priorityOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="backlog">Backlog</option><option value="todo">Todo</option><option value="in-progress">In progress</option><option value="done">Done</option></select></label></div>
      {error && <p className="form-error">{error}</p>}<div className="dialog-footer">{task && <button type="button" className="danger-button" onClick={() => onDelete(task.id)}>Delete task</button>}<span /><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">{task ? "Save changes" : "Create task"}</button></div>
    </form>
  </div>;
}

function WorkspaceOnboarding({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return <div className="dialog-backdrop">
    <form className="task-dialog" onSubmit={(event) => {
      event.preventDefault();
      if (!name.trim()) {
        setError("Enter a workspace name.");
        return;
      }
      onCreate(name.trim());
    }}>
      <span className="eyebrow">WELCOME TO ORBIT</span>
      <h2>Create your workspace</h2>
      <p className="auth-copy">Your workspace is private by default. You can invite teammates after it is created.</p>
      <label>Workspace name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Inc." /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button auth-submit">Create workspace</button>
    </form>
  </div>;
}
