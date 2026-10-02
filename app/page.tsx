"use client";

import { FormEvent, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  Board,
  BoardColumn,
  createId,
  createInitialState,
  isOrbitState,
  OrbitState,
  storageKey,
  Task,
  TaskPriority,
  TaskActivity,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceSubscription,
} from "@/lib/orbit";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  createRemoteBoard,
  createRemoteTask,
  createWorkspaceWithBoard,
  deleteRemoteTask,
  inviteWorkspaceMember,
  acceptWorkspaceInvitation,
  loadWorkspaceInvitations,
  loadMyWorkspaceInvitations,
  loadRemoteState,
  loadTaskActivity,
  loadWorkspaceMembers,
  loadWorkspaceSubscription,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
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
  const router = useRouter();
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
  const [remoteStatus, setRemoteStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([
    { userId: "local-owner", email: "local workspace", displayName: "Local workspace", role: "owner" },
  ]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitation[]>([]);
  const [isTeamOpen, setIsTeamOpen] = useState(false);
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<"overview" | "issues" | "inbox">("overview");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "All">("All");
  const [sortMode, setSortMode] = useState<"created" | "title">("created");
  const [actionNotice, setActionNotice] = useState("");

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
          setRequiresAuth(true);
          setAuthChecked(true);
          router.replace("/login");
          return;
        }
        if (!data.user) {
          setRequiresAuth(true);
          setAuthChecked(true);
          router.replace("/login");
          return;
        }
        setCurrentUserId(data.user.id);
        setCurrentUserEmail(data.user.email ?? "");
        setRemoteMode(true);
        setRemoteStatus("loading");
        const emailNoticeKey = `orbit-email-notice-${data.user.id}`;
        if (data.user.email && window.localStorage.getItem(emailNoticeKey) !== "shown") {
          window.alert("Your account is ready. We will send your Orbit email after email delivery is enabled.");
          window.localStorage.setItem(emailNoticeKey, "shown");
        }
        try {
          setPendingInvitations(await loadMyWorkspaceInvitations(client));
          const remoteState = await loadRemoteState(client);
          if (remoteState) {
            if (!remoteState.workspaceId) throw new Error("The remote workspace has no identifier.");
            setState(remoteState);
            setMembers(await loadWorkspaceMembers(client, remoteState.workspaceId));
            setInvitations(await loadWorkspaceInvitations(client, remoteState.workspaceId));
            setSubscription(await loadWorkspaceSubscription(client, remoteState.workspaceId));
          } else {
            setState({ workspaceName: "", boards: [], activeBoardId: "" });
            setNeedsOnboarding(true);
          }
          setRemoteStatus("ready");
        } catch (caughtError) {
          setState({ workspaceName: "", boards: [], activeBoardId: "" });
          setRemoteStatus("error");
          setStorageError(caughtError instanceof Error ? caughtError.message : "Remote workspace could not be loaded.");
        } finally {
          setAuthChecked(true);
        }
      }).catch((caughtError: unknown) => {
        setRemoteStatus("error");
        setStorageError(caughtError instanceof Error ? caughtError.message : "Authentication could not be checked.");
        setRequiresAuth(true);
        setAuthChecked(true);
        router.replace("/login");
      });
    } catch {
      timers.push(window.setTimeout(() => setAuthChecked(true), 0));
    }
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [router]);

  useEffect(() => {
    if (!isReady || remoteMode) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      window.setTimeout(() => setStorageError("Local storage is unavailable. Remote changes are unaffected."), 0);
    }
  }, [isReady, remoteMode, state]);

  useEffect(() => {
    if (!remoteMode || !supabase || !state.workspaceId) return;
    let cancelled = false;
    const refreshWorkspace = async () => {
      try {
        const currentWorkspace = await loadRemoteState(supabase, state.workspaceId);
        const remoteState = currentWorkspace ?? await loadRemoteState(supabase);
        if (cancelled) return;
        if (!remoteState) {
          setState({ workspaceName: "", boards: [], activeBoardId: "" });
          setMembers([]);
          setInvitations([]);
          setNeedsOnboarding(true);
          return;
        }
        if (!remoteState.workspaceId) throw new Error("The remote workspace has no identifier.");
        setState(remoteState);
        setMembers(await loadWorkspaceMembers(supabase, remoteState.workspaceId));
        setInvitations(await loadWorkspaceInvitations(supabase, remoteState.workspaceId));
        setSubscription(await loadWorkspaceSubscription(supabase, remoteState.workspaceId));
        setNeedsOnboarding(false);
      } catch (caughtError) {
        if (!cancelled) setStorageError(caughtError instanceof Error ? caughtError.message : "Workspace could not be refreshed.");
      }
    };
    const handleFocus = () => void refreshWorkspace();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [remoteMode, supabase, state.workspaceId]);

  useEffect(() => {
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
    if (isReady) window.localStorage.setItem("orbit-theme", isLight ? "light" : "dark");
  }, [isLight, isReady]);

  const activeBoard = state.boards.find((board) => board.id === state.activeBoardId) ?? state.boards[0];
  const currentMember = members.find((member) => member.userId === currentUserId);
  const profileName = currentMember?.displayName || currentUserEmail.split("@")[0] || "You";
  const profileInitial = profileName.slice(0, 1).toUpperCase();
  const selectedTask = activeBoard?.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const boardTasks = activeBoard?.tasks ?? [];
  const totalTasks = boardTasks.length;
  const completedTasks = boardTasks.filter((task) => task.status === "done").length;
  const completionPercent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const visibleTasks = [...boardTasks]
    .filter((task) => priorityFilter === "All" || task.priority === priorityFilter)
    .filter((task) => activeNav !== "issues" || task.assignedTo === currentUserId)
    .filter((task) => !search.trim() || `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase()))
    .sort((left, right) => sortMode === "title"
      ? left.title.localeCompare(right.title)
      : left.createdAt.localeCompare(right.createdAt));
  const updateState = (update: (current: OrbitState) => OrbitState) => setState((current) => update(current));
  const showActionNotice = (message: string) => {
    setActionNotice(message);
    window.setTimeout(() => setActionNotice((current) => current === message ? "" : current), 3000);
  };

  const addBoard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newBoardName.trim();
    if (!name || !activeBoard) return;
    try {
      const workspaceId = state.workspaceId;
      if (remoteMode && !workspaceId) throw new Error("The active workspace could not be identified.");
      let board: Board;
      if (remoteMode) {
        if (!supabase || !workspaceId) throw new Error("The active workspace could not be identified.");
        board = await createRemoteBoard(supabase, workspaceId, name);
      } else {
        board = { id: createId("board"), name, columns: activeBoard.columns, tasks: [] };
      }
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
    const previousTask = activeBoard.tasks.find((item) => item.id === task.id);
    updateState((current) => ({
      ...current,
      boards: current.boards.map((board) => board.id === activeBoard.id ? { ...board, tasks: board.tasks.map((item) => item.id === task.id ? task : item) } : board),
    }));
    try {
      const savedTask = remoteMode && supabase
        ? await updateRemoteTask(supabase, task)
        : task;
      updateState((current) => ({
        ...current,
        boards: current.boards.map((board) => board.id === activeBoard.id
          ? { ...board, tasks: board.tasks.map((item) => item.id === task.id ? savedTask : item) }
          : board),
      }));
    } catch (caughtError) {
      if (previousTask) updateState((current) => ({
        ...current,
        boards: current.boards.map((board) => board.id === activeBoard.id ? { ...board, tasks: board.tasks.map((item) => item.id === task.id ? previousTask : item) } : board),
      }));
      setStorageError(caughtError instanceof Error ? caughtError.message : "Task could not be updated.");
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!activeBoard) return;
    const previousTask = activeBoard.tasks.find((task) => task.id === taskId);
    updateState((current) => ({
      ...current,
      boards: current.boards.map((board) => board.id === activeBoard.id ? { ...board, tasks: board.tasks.filter((task) => task.id !== taskId) } : board),
    }));
    try {
      if (remoteMode && supabase) await deleteRemoteTask(supabase, taskId);
      setSelectedTaskId(null);
    } catch (caughtError) {
      if (previousTask) updateState((current) => ({
        ...current,
        boards: current.boards.map((board) => board.id === activeBoard.id ? { ...board, tasks: [...board.tasks, previousTask] } : board),
      }));
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
      if (!remoteState.workspaceId) throw new Error("The created workspace has no identifier.");
      setState(remoteState);
      setMembers(await loadWorkspaceMembers(supabase, remoteState.workspaceId));
      setInvitations(await loadWorkspaceInvitations(supabase, remoteState.workspaceId));
      setSubscription(await loadWorkspaceSubscription(supabase, remoteState.workspaceId));
      setNeedsOnboarding(false);
      setRemoteMode(true);
      setRemoteStatus("ready");
    } catch (caughtError) {
      setStorageError(caughtError instanceof Error ? caughtError.message : "Workspace could not be created.");
    }
  };

  const inviteMember = async (email: string, role: "admin" | "member") => {
    if (!remoteMode || !supabase) {
      setMembers((current) => [...current, { userId: createId("local-member"), email, displayName: email.split("@")[0], role }]);
      return;
    }
    if (!state.workspaceId) throw new Error("The active workspace could not be identified.");
    const message = await inviteWorkspaceMember(supabase, state.workspaceId, email, role);
    setInvitations(await loadWorkspaceInvitations(supabase, state.workspaceId));
    showActionNotice(message);
  };

  const revokeInvitation = async (invitationId: string) => {
    if (!remoteMode || !supabase) {
      setInvitations((current) => current.map((invitation) => invitation.id === invitationId ? { ...invitation, status: "revoked" } : invitation));
      return;
    }
    await revokeWorkspaceInvitation(supabase, invitationId);
    setInvitations(await loadWorkspaceInvitations(supabase, state.workspaceId));
  };

  const removeMember = async (userId: string) => {
    if (userId === currentUserId) return;
    if (!remoteMode || !supabase) {
      setMembers((current) => current.filter((member) => member.userId !== userId));
      return;
    }
    if (!state.workspaceId) throw new Error("The active workspace could not be identified.");
    await removeWorkspaceMember(supabase, state.workspaceId, userId);
    setMembers(await loadWorkspaceMembers(supabase, state.workspaceId));
    setInvitations(await loadWorkspaceInvitations(supabase, state.workspaceId));
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const acceptInvitation = async (invitationId: string) => {
    if (!supabase) return;
    try {
      const workspaceId = await acceptWorkspaceInvitation(supabase, invitationId);
      const remoteState = await loadRemoteState(supabase, workspaceId);
      if (!remoteState) throw new Error("Invitation was accepted, but the workspace could not be loaded.");
      setState(remoteState);
      setMembers(await loadWorkspaceMembers(supabase, remoteState.workspaceId));
      setInvitations(await loadWorkspaceInvitations(supabase, remoteState.workspaceId));
      setPendingInvitations([]);
      setNeedsOnboarding(false);
    } catch (caughtError) {
      setStorageError(caughtError instanceof Error ? caughtError.message : "Invitation could not be accepted.");
    }
  };

  if (!activeBoard && needsOnboarding) {
    return <main className="auth-page">{pendingInvitations.length > 0
      ? <InvitationInbox invitations={pendingInvitations} onAccept={acceptInvitation} onCreateWorkspace={() => setPendingInvitations([])} />
      : <WorkspaceOnboarding onCreate={completeOnboarding} />}</main>;
  }
  if (!isReady || !authChecked || remoteStatus === "loading") {
    return <main className="auth-page"><div className="loading-state">Loading your workspace…</div></main>;
  }
  if (requiresAuth) return <main className="auth-page"><div className="loading-state">Redirecting to sign in…</div></main>;
  if (remoteStatus === "error") {
    return <main className="auth-page"><div className="auth-card"><span className="eyebrow">WORKSPACE UNAVAILABLE</span><h1>We could not load your workspace</h1><p className="auth-copy">{storageError || "Refresh the page and try again."}</p><button className="primary-button" onClick={() => window.location.reload()}>Retry</button></div></main>;
  }
  if (!activeBoard) return null;

  return (
    <div className={`app-shell${isSidebarCollapsed ? " sidebar-is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark">O</div><span>Orbit</span><button className="icon-button sidebar-collapse" aria-label="Collapse sidebar" onClick={() => setIsSidebarCollapsed((value) => !value)}>{isSidebarCollapsed ? "→" : "←"}</button></div>
        <div className="workspace-switcher"><div className="workspace-avatar">A</div><div><strong>{state.workspaceName}</strong><span>Workspace</span></div><span className="chevron">⌄</span></div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={`nav-item${activeNav === "overview" ? " active" : ""}`} onClick={() => { setActiveNav("overview"); setPriorityFilter("All"); }}><span>⌂</span> Overview <kbd>G O</kbd></button>
          <button className={`nav-item${activeNav === "issues" ? " active" : ""}`} onClick={() => { setActiveNav("issues"); setViewMode("list"); showActionNotice("Showing tasks assigned to you."); }}><span>◷</span> My issues <kbd>G M</kbd></button>
          <button className={`nav-item${activeNav === "inbox" ? " active" : ""}`} onClick={() => { setActiveNav("inbox"); setIsTeamOpen(true); }}><span>✦</span> Inbox <span className="nav-count">{pendingInvitations.length}</span></button>
        </nav>
        <div className="sidebar-section"><div className="section-heading"><span>Workspace</span><button className="icon-button" onClick={() => showActionNotice("Create a board with the + button beside Boards.")}>＋</button></div><button className="nav-item" onClick={() => showActionNotice("Saved views are not available yet.")}><span>▦</span> Views</button><button className="nav-item" onClick={() => showActionNotice("Projects are not available yet.")}><span>⌁</span> Projects</button><button className="nav-item" onClick={() => setIsTeamOpen(true)}><span>♙</span> Team <span className="nav-count">{members.length + pendingInvitations.length}</span></button></div>
        <div className="sidebar-section boards-section">
          <div className="section-heading"><span>Boards</span><button className="icon-button" onClick={() => setIsAddingBoard(true)}>＋</button></div>
          {state.boards.map((board) => <button key={board.id} className={`nav-item board-link ${board.id === activeBoard.id ? "active" : ""}`} onClick={() => updateState((current) => ({ ...current, activeBoardId: board.id }))}><span className="board-dot" /> {board.name}</button>)}
          {isAddingBoard && <form className="inline-form" onSubmit={addBoard}><input autoFocus value={newBoardName} onChange={(event) => setNewBoardName(event.target.value)} placeholder="Board name" /></form>}
        </div>
        <div className="sidebar-footer"><button className="nav-item" onClick={() => setIsBillingOpen(true)}><span>⚙</span> Settings</button><button className="nav-item" onClick={() => showActionNotice("Use Team for members and Settings for billing.")}><span>?</span> Help & support</button><button className="profile-row profile-trigger" onClick={() => setIsProfileOpen(true)} aria-label="Open your profile"><div className="profile-avatar">{profileInitial}</div><div><strong>{profileName}</strong><span>{currentMember?.role ?? "Local workspace"}</span></div><span className="more" aria-hidden="true">›</span></button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>Boards</span><span>/</span><strong>{activeBoard.name}</strong></div><div className="topbar-actions"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" /><kbd>⌘ K</kbd></label><button className="icon-button theme-button" onClick={() => setIsLight((value) => !value)} aria-label="Toggle color theme">{isLight ? "☀" : "☾"}</button><button className="avatar-button" title={currentUserEmail || profileName} onClick={() => setIsProfileOpen(true)} aria-label="Open your profile">{profileInitial}</button></div></header>
        {storageError && <div className="storage-banner" role="alert">{storageError}</div>}
        {actionNotice && <div className="storage-banner" role="status">{actionNotice}</div>}
        {authMessage && <div className="storage-banner" role="alert">Supabase auth is unavailable: {authMessage}</div>}
        {pendingInvitations.length > 0 && <div className="invitation-banner" role="status">You have {pendingInvitations.length} pending workspace invitation{pendingInvitations.length === 1 ? "" : "s"}. <button className="banner-action" onClick={() => setIsTeamOpen(true)}>Review invitations</button></div>}
        <div className="content-wrap">
          <div className="page-heading"><div><div className="eyebrow"><span className="board-dot" /> BOARD</div><h1>{activeBoard.name}</h1><p>Plan, prioritize, and ship great work together.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => showActionNotice("Board actions are available from the task and board controls.")}>⋯</button><button className="primary-button" onClick={() => setIsAddingTask(true)}>＋ Add task</button></div></div>
          <div className="board-toolbar"><div className="view-tabs"><button className={`view-tab${viewMode === "board" ? " active" : ""}`} onClick={() => setViewMode("board")}>▦ Board</button><button className={`view-tab${viewMode === "list" ? " active" : ""}`} onClick={() => setViewMode("list")}>☷ List</button></div><div className="toolbar-actions"><button className="toolbar-button" onClick={() => setPriorityFilter((value) => value === "All" ? "High" : value === "High" ? "Urgent" : "All")}>↕ Filter{priorityFilter !== "All" ? `: ${priorityFilter}` : ""}</button><button className="toolbar-button" onClick={() => setSortMode((value) => value === "created" ? "title" : "created")}>⇅ Sort: {sortMode === "created" ? "Recent" : "Title"}</button><button className="toolbar-button" onClick={() => showActionNotice("Board settings are available from the workspace settings.")}>⚙</button></div></div>
          {!isReady ? <div className="loading-state">Loading your workspace…</div> : viewMode === "list" ? <div className="task-list-view">{visibleTasks.length === 0 ? <div className="loading-state">No matching tasks.</div> : visibleTasks.map((task) => <button key={task.id} className="task-list-row" onClick={() => setSelectedTaskId(task.id)}><strong>{task.title}</strong><span>{task.status} · {task.priority}</span></button>)}</div> : <div className="kanban-board">{activeBoard.columns.map((column) => {
            const tasks = visibleTasks.filter((task) => task.status === column.id);
            return <KanbanColumn key={column.id} column={column} tasks={tasks} members={members} onDrop={moveTask} onSelect={setSelectedTaskId} onAdd={() => setIsAddingTask(true)} />;
          })}</div>}
        </div>
        <footer className="workspace-status-bar" aria-label="Workspace progress">
          <div className="workspace-status-copy">
           <span className="workspace-status-label">Workspace progress</span>
           <span className="workspace-status-count">{completedTasks} of {totalTasks} tasks complete</span>
          </div>
          <div className="workspace-progress-track" role="progressbar" aria-label="Tasks completed" aria-valuemin={0} aria-valuemax={totalTasks || 1} aria-valuenow={completedTasks}>
           <span className="workspace-progress-fill" style={{ width: `${completionPercent}%` }} />
          </div>
          <strong className="workspace-status-percent">{completionPercent}%</strong>
        </footer>
      </main>
      {(isAddingTask || selectedTask) && <TaskDialog key={selectedTask?.id ?? "new-task"} task={selectedTask} members={members} remoteMode={remoteMode} supabase={supabase} defaultStatus={activeBoard.columns[0]?.id ?? "backlog"} onClose={() => { setIsAddingTask(false); setSelectedTaskId(null); }} onCreate={addTask} onSave={updateTask} onDelete={deleteTask} />}
      {isTeamOpen && <TeamDialog members={members} invitations={invitations} pendingInvitations={pendingInvitations} canManage={members.find((member) => member.userId === currentUserId)?.role === "owner" || members.find((member) => member.userId === currentUserId)?.role === "admin" || !remoteMode} onInvite={inviteMember} onRevoke={revokeInvitation} onRemove={removeMember} onAccept={acceptInvitation} onClose={() => setIsTeamOpen(false)} />}
      {isBillingOpen && <BillingDialog workspaceId={state.workspaceId} subscription={subscription} canManage={!remoteMode || currentMember?.role === "owner" || currentMember?.role === "admin"} onClose={() => setIsBillingOpen(false)} onError={setStorageError} />}
      {isProfileOpen && <ProfileDialog name={profileName} email={currentUserEmail || "Local workspace"} role={currentMember?.role ?? "owner"} onSignOut={signOut} onClose={() => setIsProfileOpen(false)} />}
      {needsOnboarding && <WorkspaceOnboarding onCreate={completeOnboarding} />}
    </div>
  );
}

function KanbanColumn({ column, tasks, members, onDrop, onSelect, onAdd }: { column: BoardColumn; tasks: Task[]; members: WorkspaceMember[]; onDrop: (taskId: string, status: string) => void; onSelect: (id: string) => void; onAdd: () => void }) {
  return <section className="kanban-column" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData("text/plain"); if (taskId) onDrop(taskId, column.id); }}>
    <div className="column-header"><div><span className="status-dot" style={{ backgroundColor: column.color }} /> <strong>{column.name}</strong><span className="task-count">{tasks.length}</span></div><button className="icon-button" onClick={onAdd}>＋</button></div>
    <div className="task-list">{tasks.map((task) => <TaskCard key={task.id} task={task} members={members} onSelect={onSelect} />)}{tasks.length === 0 && <div className="empty-column">Drop tasks here</div>}</div>
    <button className="add-task-link" onClick={onAdd}>＋ Add task</button>
  </section>;
}

function TaskCard({ task, members, onSelect }: { task: Task; members: WorkspaceMember[]; onSelect: (id: string) => void }) {
  const assignee = members.find((member) => member.userId === task.assignedTo);
  return <article className="task-card" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)} onClick={() => onSelect(task.id)}>
    <div className="task-card-top"><span className={`priority ${priorityStyles[task.priority]}`} title={task.priority}>◆</span><span className="task-id">{task.id.replace("task-", "OR-").slice(0, 9).toUpperCase()}</span><button className="card-more" aria-label={`Open AI suggestions for ${task.title}`} title="Open AI suggestions" onClick={(event) => { event.stopPropagation(); onSelect(task.id); }}>AI</button></div>
    <h3>{task.title}</h3>{task.description && <p>{task.description}</p>}
    <div className="task-card-footer"><span className={`priority-label ${priorityStyles[task.priority]}`}>{task.priority}</span><span className="mini-avatar" title={assignee?.displayName ?? "Unassigned"}>{assignee?.displayName.slice(0, 1).toUpperCase() ?? "—"}</span></div>
  </article>;
}

function BillingDialog({ workspaceId, subscription, canManage, onClose, onError }: { workspaceId?: string; subscription: WorkspaceSubscription | null; canManage: boolean; onClose: () => void; onError: (message: string) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const plan = subscription?.plan ?? "lite";
  const isPro = plan === "pro" && subscription?.status !== "canceled";
  const requestBillingUrl = async (path: string) => {
    if (!workspaceId) {
      onError("Billing is available after you create an authenticated workspace.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Billing action could not be started.");
      window.location.assign(result.url);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Billing action could not be started.");
    } finally {
      setIsLoading(false);
    }
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="task-dialog billing-dialog" role="dialog" aria-modal="true" aria-labelledby="billing-title">
      <div className="dialog-header"><div><span className="eyebrow">ACCOUNT</span><h2 id="billing-title">Billing and plan</h2></div><button className="icon-button" onClick={onClose} aria-label="Close billing settings">×</button></div>
      <div className="billing-plan-card"><div><strong>{isPro ? "Pro plan" : "Lite plan"}</strong><span>{isPro ? "Unlimited members and boards" : "Up to 5 members and 3 boards"}</span></div><span className={`billing-status ${isPro ? "billing-status-pro" : ""}`}>{subscription?.status ?? "local"}</span></div>
      {!isPro && <p className="auth-copy">Upgrade to Pro when your team needs more than 5 members or 3 boards.</p>}
      {subscription?.currentPeriodEnd && <p className="billing-renewal">Current period ends {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.</p>}
      {canManage ? <div className="dialog-footer"><span />{isPro ? <button className="primary-button" disabled={isLoading} onClick={() => void requestBillingUrl("/api/stripe/portal")}>{isLoading ? "Opening…" : "Manage subscription"}</button> : <button className="primary-button" disabled={isLoading} onClick={() => void requestBillingUrl("/api/stripe/checkout")}>{isLoading ? "Opening…" : "Upgrade to Pro"}</button>}</div> : <p className="auth-copy">Only workspace owners and admins can manage billing.</p>}
    </section>
  </div>;
}

function ProfileDialog({ name, email, role, onSignOut, onClose }: { name: string; email: string; role: string; onSignOut: () => Promise<void>; onClose: () => void }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const signOut = async () => {
    setIsSigningOut(true);
    await onSignOut();
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="task-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div className="dialog-header"><div><span className="eyebrow">ACCOUNT</span><h2 id="profile-title">Your profile</h2></div><button className="icon-button" onClick={onClose} aria-label="Close profile">×</button></div>
      <div className="profile-summary"><div className="profile-large-avatar">{name.slice(0, 1).toUpperCase()}</div><div><strong>{name}</strong><span>{email}</span></div></div>
      <div className="profile-details"><div><span>Workspace role</span><strong>{role}</strong></div><div><span>Account</span><strong>{email === "Local workspace" ? "Local workspace" : "Supabase account"}</strong></div></div>
      <div className="dialog-footer"><span /><button className="danger-outline-button" disabled={isSigningOut} onClick={() => void signOut()}>{isSigningOut ? "Signing out…" : "Log out"}</button></div>
    </section>
  </div>;
}

function TaskDialog({ task, members, remoteMode, supabase, defaultStatus, onClose, onCreate, onSave, onDelete }: { task: Task | null; members: WorkspaceMember[]; remoteMode: boolean; supabase: SupabaseClient | null; defaultStatus: string; onClose: () => void; onCreate: (task: Omit<Task, "id" | "createdAt">) => void; onSave: (task: Task) => void; onDelete: (id: string) => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "No priority");
  const [status, setStatus] = useState(task?.status ?? defaultStatus);
  const [assignedTo, setAssignedTo] = useState(task?.assignedTo ?? "");
  const [error, setError] = useState("");
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [activityError, setActivityError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [suggestionProvider, setSuggestionProvider] = useState<"mock" | "ollama" | null>(null);
  const [suggestionError, setSuggestionError] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  useEffect(() => {
    if (!task || !remoteMode || !supabase) return;
    loadTaskActivity(supabase, task.id).then(setActivity).catch((caughtError: unknown) => {
      setActivityError(caughtError instanceof Error ? caughtError.message : "Activity could not be loaded.");
    });
  }, [remoteMode, supabase, task]);
  const generateSuggestions = async () => {
    if (!task) return;
    setIsSuggesting(true);
    setSuggestionError("");
    try {
      const response = await fetch("/api/ai/subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      const result = await response.json() as { provider?: "mock" | "ollama"; suggestions?: Array<{ title?: string }>; error?: string };
      if (!response.ok || !result.suggestions) throw new Error(result.error ?? "Suggestions could not be generated.");
      const nextSuggestions = result.suggestions.map((item) => item.title ?? "").filter(Boolean);
      setSuggestions(nextSuggestions);
      setSelectedSuggestions(nextSuggestions);
      setSuggestionProvider(result.provider ?? "mock");
    } catch (caughtError) {
      setSuggestionError(caughtError instanceof Error ? caughtError.message : "Suggestions could not be generated.");
    } finally {
      setIsSuggesting(false);
    }
  };
  const applySuggestions = () => {
    if (!task || selectedSuggestions.length === 0) return;
    const suggestionText = `Suggested subtasks:\n${selectedSuggestions.map((suggestion) => `- ${suggestion}`).join("\n")}`;
    onSave({ ...task, description: description.trim() ? `${description.trim()}\n\n${suggestionText}` : suggestionText });
    onClose();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) { setError("A task title is required."); return; }
    const values = { title: title.trim(), description: description.trim(), priority, status, assignedTo: assignedTo || null };
    if (task) onSave({ ...task, ...values }); else onCreate(values);
    onClose();
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="task-dialog" onSubmit={submit}><div className="dialog-header"><div><span className="eyebrow">{task ? "EDIT TASK" : "NEW TASK"}</span><h2>{task ? "Edit task" : "Create a task"}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
      <label>Title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" /></label>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context for your team…" rows={4} /></label>
      <div className="form-grid"><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{priorityOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="backlog">Backlog</option><option value="todo">Todo</option><option value="in-progress">In progress</option><option value="done">Done</option></select></label></div>
      <label>Assignee<select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName} · {member.role}</option>)}</select></label>
      {error && <p className="form-error">{error}</p>}
      {task && <div className="ai-panel"><div className="ai-panel-header"><div><span className="eyebrow">{suggestionProvider === "ollama" ? "LOCAL AI" : "DEMO MODE"}</span><strong>Suggest subtasks</strong></div><button type="button" className="secondary-button" disabled={isSuggesting} onClick={() => void generateSuggestions()}>{isSuggesting ? "Thinking…" : "Generate"}</button></div><p className="ai-help">{suggestionProvider === "ollama" ? "Generated by your local Ollama model." : "Demo suggestions are free and need no API key. Set AI_PROVIDER=ollama for real local model output."}</p>{suggestionError && <p className="form-error">{suggestionError}</p>}{suggestions.length > 0 && <div className="suggestion-list">{suggestions.map((suggestion) => <label key={suggestion}><input type="checkbox" checked={selectedSuggestions.includes(suggestion)} onChange={(event) => setSelectedSuggestions((current) => event.target.checked ? [...current, suggestion] : current.filter((item) => item !== suggestion))} />{suggestion}</label>)}<div className="suggestion-actions"><button type="button" className="secondary-button" onClick={() => { setSuggestions([]); setSelectedSuggestions([]); }}>Cancel</button><button type="button" className="primary-button" disabled={selectedSuggestions.length === 0} onClick={applySuggestions}>Apply suggestions</button></div></div>}</div>}
      <div className="dialog-footer">{task && <button type="button" className="danger-button" onClick={() => onDelete(task.id)}>Delete task</button>}<span /><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">{task ? "Save changes" : "Create task"}</button></div>
      {task && remoteMode && <div className="activity-panel"><span className="eyebrow">RECENT ACTIVITY</span>{activityError && <p className="form-error">{activityError}</p>}{activity.length === 0 && !activityError && <p className="activity-empty">No activity recorded yet.</p>}{activity.map((item) => <div className="activity-row" key={item.id}><strong>{item.actorName}</strong><span>{item.action}</span><time>{new Date(item.createdAt).toLocaleString()}</time></div>)}</div>}
    </form>
  </div>;
}

function TeamDialog({ members, invitations, pendingInvitations, canManage, onInvite, onRevoke, onRemove, onAccept, onClose }: { members: WorkspaceMember[]; invitations: WorkspaceInvitation[]; pendingInvitations: WorkspaceInvitation[]; canManage: boolean; onInvite: (email: string, role: "admin" | "member") => Promise<void>; onRevoke: (id: string) => Promise<void>; onRemove: (id: string) => Promise<void>; onAccept: (id: string) => Promise<void>; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="task-dialog team-dialog">
      <div className="dialog-header"><div><span className="eyebrow">WORKSPACE</span><h2>Team members</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
      <div className="member-list">{members.map((member) => <div className="member-row" key={member.userId}><div className="mini-avatar">{member.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{member.displayName}</strong><span>{member.email}</span></div><em>{member.role}</em>{canManage && member.role !== "owner" && <button className="icon-button" onClick={async () => { setError(""); try { await onRemove(member.userId); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Member could not be removed."); } }} aria-label={`Remove ${member.email} from workspace`}>×</button>}</div>)}</div>
      {error && <p className="form-error">{error}</p>}
      {pendingInvitations.length > 0 && <><span className="eyebrow">YOUR INVITATIONS</span><div className="member-list">{pendingInvitations.map((invitation) => <div className="member-row" key={invitation.id}><div className="mini-avatar">O</div><div><strong>Workspace invitation</strong><span>{invitation.email} · {invitation.role}</span></div><button className="primary-button" onClick={() => void onAccept(invitation.id)}>Accept</button></div>)}</div></>}
      {invitations.length > 0 && <><span className="eyebrow">INVITATIONS</span><div className="member-list invitation-list">{invitations.map((invitation) => <div className="member-row" key={invitation.id}><div className="mini-avatar">✉</div><div><strong>{invitation.email}</strong><span>{invitation.role} · {invitation.status}</span></div>{canManage && invitation.status === "pending" && <button className="icon-button" onClick={() => void onRevoke(invitation.id)} aria-label={`Revoke invitation for ${invitation.email}`}>×</button>}</div>)}</div></>}
      {canManage ? <form onSubmit={async (event) => { event.preventDefault(); if (!email.includes("@")) { setError("Enter a valid email address."); return; } setIsSaving(true); setError(""); try { await onInvite(email.trim(), role); setEmail(""); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Invitation could not be created."); } finally { setIsSaving(false); } }}>
        <label>Invite by email<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" /></label>
        <label>Role<select value={role} onChange={(event) => setRole(event.target.value as "admin" | "member")}><option value="member">Member</option><option value="admin">Admin</option></select></label>
        {error && <p className="form-error">{error}</p>}<button className="primary-button auth-submit" disabled={isSaving}>{isSaving ? "Sending…" : "Create invitation"}</button>
      </form> : <p className="auth-copy">Only workspace owners and admins can invite teammates.</p>}
    </div>
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

function InvitationInbox({ invitations, onAccept, onCreateWorkspace }: { invitations: WorkspaceInvitation[]; onAccept: (id: string) => Promise<void>; onCreateWorkspace: () => void }) {
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  return <div className="auth-card">
    <div className="brand-row"><div className="brand-mark">O</div><span>Orbit</span></div>
    <span className="eyebrow">TEAM INVITATION</span>
    <h1>Join a workspace</h1>
    <p className="auth-copy">You have been invited to collaborate in the following workspace.</p>
    <div className="member-list">{invitations.map((invitation) => <div className="member-row" key={invitation.id}><div className="mini-avatar">O</div><div><strong>Orbit workspace</strong><span>{invitation.email} · {invitation.role}</span></div><button className="primary-button" disabled={acceptingId !== null} onClick={async () => { setAcceptingId(invitation.id); await onAccept(invitation.id); setAcceptingId(null); }}>{acceptingId === invitation.id ? "Joining…" : "Accept"}</button></div>)}</div>
    <button className="auth-switch" onClick={onCreateWorkspace}>Create a new workspace instead</button>
  </div>;
}
