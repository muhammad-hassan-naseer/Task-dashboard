
// ============================================================
// Real-Time Task Dashboard — React 18 + TypeScript patterns
// All TS types are annotated via JSDoc for artifact compatibility
// Demonstrates: useState, useEffect, useReducer, useCallback,
//   useMemo, useRef, useContext, custom hooks, optimistic updates
// ============================================================

import { useState, useEffect, useReducer, useCallback, useMemo, useRef, useContext, createContext } from "react";

// ─────────────────────────────────────────────
// TYPES  (TypeScript interfaces as JSDoc)
// ─────────────────────────────────────────────
/**
 * @typedef {'todo'|'in-progress'|'done'} TaskStatus
 * @typedef {'low'|'medium'|'high'} Priority
 * @typedef {{ id: string; title: string; description: string; status: TaskStatus; priority: Priority; assignee: string; createdAt: string; updatedAt: string; }} Task
 * @typedef {{ tasks: Task[]; past: Task[][]; future: Task[][]; }} TaskState
 * @typedef {{ type: string; payload?: any }} TaskAction
 * @typedef {{ theme: 'dark'|'light'; user: string }} AppContext
 */

// ─────────────────────────────────────────────
// MOCK DATA — simulates REST API responses
// ─────────────────────────────────────────────
const MOCK_TASKS = [
  { id: "1", title: "Implement auth middleware", description: "JWT validation and refresh token rotation for all protected routes.", status: "done", priority: "high", assignee: "Farida K.", createdAt: "2026-03-10T08:00:00Z", updatedAt: "2026-03-14T10:00:00Z" },
  { id: "2", title: "Design system token audit", description: "Reconcile Figma tokens with CSS variables. Remove deprecated colour stops.", status: "in-progress", priority: "medium", assignee: "Omar S.", createdAt: "2026-03-12T09:00:00Z", updatedAt: "2026-03-17T14:30:00Z" },
  { id: "3", title: "Write E2E tests for checkout", description: "Playwright suite covering happy path, card decline, and session timeout.", status: "todo", priority: "high", assignee: "Priya L.", createdAt: "2026-03-13T11:00:00Z", updatedAt: "2026-03-13T11:00:00Z" },
  { id: "4", title: "Migrate to Vite 6", description: "Update build config, resolve CJS/ESM conflicts, benchmark bundle sizes.", status: "todo", priority: "medium", assignee: "Farida K.", createdAt: "2026-03-14T08:00:00Z", updatedAt: "2026-03-14T08:00:00Z" },
  { id: "5", title: "Accessibility pass — forms", description: "WCAG 2.2 AA audit on all form components. Fix label associations and focus rings.", status: "in-progress", priority: "high", assignee: "Omar S.", createdAt: "2026-03-15T10:00:00Z", updatedAt: "2026-03-17T16:00:00Z" },
  { id: "6", title: "Redis cache for search", description: "Cache full-text search results with a 60-second TTL. Instrument hit/miss ratio.", status: "todo", priority: "low", assignee: "Priya L.", createdAt: "2026-03-16T09:00:00Z", updatedAt: "2026-03-16T09:00:00Z" },
  { id: "7", title: "OpenAPI spec cleanup", description: "Remove deprecated v1 endpoints, add missing response schemas for v2.", status: "done", priority: "low", assignee: "Omar S.", createdAt: "2026-03-11T08:00:00Z", updatedAt: "2026-03-15T12:00:00Z" },
  { id: "8", title: "Perf profiling — dashboard", description: "Identify and fix render bottlenecks using React DevTools profiler.", status: "todo", priority: "medium", assignee: "Farida K.", createdAt: "2026-03-17T08:00:00Z", updatedAt: "2026-03-17T08:00:00Z" },
];

// ─────────────────────────────────────────────
// MOCK API  (simulates network latency)
// ─────────────────────────────────────────────
const mockApi = {
  fetchTasks: () =>
    new Promise((resolve) =>
      setTimeout(() => resolve([...MOCK_TASKS]), 600)
    ),
  updateTask: (task) =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ ...task, updatedAt: new Date().toISOString() }), 400)
    ),
  createTask: (task) =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ ...task, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }), 400)
    ),
  deleteTask: (id) =>
    new Promise((resolve) => setTimeout(() => resolve({ id }), 300)),
};

// ─────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────
const AppCtx = createContext(null);
function useAppCtx() { return useContext(AppCtx); }

// ─────────────────────────────────────────────
// REDUCER  (undo/redo history)
// ─────────────────────────────────────────────
const initialTaskState = { tasks: [], past: [], future: [] };

function taskReducer(state, action) {
  switch (action.type) {
    case "SET_TASKS":
      return { ...state, tasks: action.payload, past: [], future: [] };
    case "UPDATE_TASK": {
      const snapshot = state.tasks;
      return {
        tasks: state.tasks.map((t) => t.id === action.payload.id ? action.payload : t),
        past: [...state.past, snapshot],
        future: [],
      };
    }
    case "ADD_TASK": {
      const snapshot = state.tasks;
      return { tasks: [...state.tasks, action.payload], past: [...state.past, snapshot], future: [] };
    }
    case "DELETE_TASK": {
      const snapshot = state.tasks;
      return { tasks: state.tasks.filter((t) => t.id !== action.payload), past: [...state.past, snapshot], future: [] };
    }
    case "UNDO":
      if (state.past.length === 0) return state;
      return { tasks: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.tasks, ...state.future] };
    case "REDO":
      if (state.future.length === 0) return state;
      return { tasks: state.future[0], past: [...state.past, state.tasks], future: state.future.slice(1) };
    default:
      return state;
  }
}

// ─────────────────────────────────────────────
// CUSTOM HOOK: useFetch
// Encapsulates loading/error/data + AbortController cleanup
// ─────────────────────────────────────────────
function useFetch(fetcher) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const execute = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher(controller.signal);
      if (!controller.signal.aborted) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message || "Fetch failed");
        setLoading(false);
      }
    }
  }, [fetcher]);

  useEffect(() => {
    execute();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [execute]);

  return { data, loading, error, refetch: execute };
}

// ─────────────────────────────────────────────
// CUSTOM HOOK: usePolling
// Runs a callback on interval; stable via useRef
// ─────────────────────────────────────────────
function usePolling(callback, interval, active = true) {
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; }, [callback]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => callbackRef.current(), interval);
    return () => clearInterval(id);
  }, [interval, active]);
}

// ─────────────────────────────────────────────
// CUSTOM HOOK: useLocalStorage
// Syncs state to localStorage; SSR-safe
// ─────────────────────────────────────────────
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch { return initialValue; }
  });

  const setStoredValue = useCallback((val) => {
    const newVal = typeof val === "function" ? val(value) : val;
    setValue(newVal);
    try { window.localStorage.setItem(key, JSON.stringify(newVal)); } catch {}
  }, [key, value]);

  return [value, setStoredValue];
}

// ─────────────────────────────────────────────
// CUSTOM HOOK: useOptimisticUpdate
// Write locally first, reconcile or rollback on server response
// ─────────────────────────────────────────────
function useOptimisticUpdate(dispatch) {
  const update = useCallback(async (optimisticAction, apiFn, rollbackAction) => {
    dispatch(optimisticAction);
    try {
      const result = await apiFn();
      if (result && optimisticAction.type === "UPDATE_TASK") {
        dispatch({ type: "UPDATE_TASK", payload: result });
      }
    } catch {
      dispatch(rollbackAction);
    }
  }, [dispatch]);
  return update;
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
const PRIORITY_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
const STATUS_LABELS = { todo: "To Do", "in-progress": "In Progress", done: "Done" };
const STATUS_COLS = ["todo", "in-progress", "done"];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function initials(name) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

// ─────────────────────────────────────────────
// COMPONENT: Avatar
// ─────────────────────────────────────────────
function Avatar({ name, size = 28 }) {
  const colors = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ec4899"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%",
      background: color + "22", border: `1.5px solid ${color}44`,
      fontSize: size * 0.38, fontWeight: 600, color, fontFamily: "inherit", flexShrink: 0,
    }}>
      {initials(name)}
    </span>
  );
}

// ─────────────────────────────────────────────
// COMPONENT: PriorityBadge
// ─────────────────────────────────────────────
function PriorityBadge({ priority }) {
  const c = PRIORITY_COLOR[priority];
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
      color: c, background: c + "18", border: `1px solid ${c}33`,
      borderRadius: 4, padding: "2px 7px",
    }}>
      {priority}
    </span>
  );
}

// ─────────────────────────────────────────────
// COMPONENT: TaskCard
// ─────────────────────────────────────────────
function TaskCard({ task, onEdit, onDelete, onStatusChange }) {
  const [hovered, setHovered] = useState(false);
  const { theme } = useAppCtx();
  const isDark = theme === "dark";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isDark ? (hovered ? "#1e2130" : "#181c27") : (hovered ? "#f8f9ff" : "#fff"),
        border: `1px solid ${isDark ? "#2a2f40" : "#e5e7ef"}`,
        borderRadius: 10, padding: "14px 16px", marginBottom: 8,
        transition: "all 0.18s ease", cursor: "pointer",
        boxShadow: hovered ? (isDark ? "0 4px 20px #0006" : "0 4px 16px #0000000d") : "none",
        transform: hovered ? "translateY(-1px)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: isDark ? "#e2e6f0" : "#1a1d2e", marginBottom: 4, lineHeight: 1.4 }}>
            {task.title}
          </div>
          <div style={{ fontSize: 12, color: isDark ? "#6b7280" : "#9ca3af", lineHeight: 1.5, marginBottom: 10 }}>
            {task.description}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <PriorityBadge priority={task.priority} />
            <Avatar name={task.assignee} size={22} />
            <span style={{ fontSize: 11, color: isDark ? "#4b5563" : "#9ca3af" }}>{task.assignee}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: isDark ? "#374151" : "#d1d5db" }}>
              {formatDate(task.updatedAt)}
            </span>
          </div>
        </div>
        {hovered && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button onClick={(e) => { e.stopPropagation(); onEdit(task); }} style={btnStyle(isDark, "#6366f1")}>Edit</button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} style={btnStyle(isDark, "#ef4444")}>Del</button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${isDark ? "#2a2f40" : "#f0f1f5"}` }}>
        {STATUS_COLS.map((s) => (
          <button key={s} onClick={() => onStatusChange(task, s)}
            style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer",
              fontWeight: task.status === s ? 700 : 400, fontFamily: "inherit",
              background: task.status === s ? (isDark ? "#2a2f45" : "#e8eaf6") : "transparent",
              color: task.status === s ? (isDark ? "#a5b4fc" : "#4f46e5") : (isDark ? "#4b5563" : "#9ca3af"),
              transition: "all 0.15s",
            }}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

function btnStyle(isDark, accentColor) {
  return {
    fontSize: 11, padding: "3px 9px", borderRadius: 5, border: `1px solid ${accentColor}44`,
    background: accentColor + "12", color: accentColor, cursor: "pointer", fontWeight: 600,
    fontFamily: "inherit", transition: "all 0.15s",
  };
}

// ─────────────────────────────────────────────
// COMPONENT: KanbanColumn
// ─────────────────────────────────────────────
function KanbanColumn({ status, tasks, onEdit, onDelete, onStatusChange }) {
  const { theme } = useAppCtx();
  const isDark = theme === "dark";
  const accent = { todo: "#6366f1", "in-progress": "#f59e0b", done: "#10b981" }[status];

  return (
    <div style={{
      flex: "1 1 0", minWidth: 0,
      background: isDark ? "#12151f" : "#f5f6fa",
      borderRadius: 12, padding: "16px 14px",
      border: `1px solid ${isDark ? "#1e2130" : "#e8eaf2"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: isDark ? "#6b7280" : "#9ca3af" }}>
          {STATUS_LABELS[status]}
        </span>
        <span style={{
          marginLeft: "auto", fontSize: 11, fontWeight: 600, minWidth: 20, height: 20,
          display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 99,
          background: accent + "22", color: accent,
        }}>
          {tasks.length}
        </span>
      </div>
      <div style={{ minHeight: 60 }}>
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
        ))}
        {tasks.length === 0 && (
          <div style={{ textAlign: "center", color: isDark ? "#2a2f40" : "#d1d5db", fontSize: 12, paddingTop: 24 }}>
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENT: TaskModal  (create / edit)
// ─────────────────────────────────────────────
const EMPTY_FORM = { title: "", description: "", status: "todo", priority: "medium", assignee: "" };

function TaskModal({ task, onSave, onClose }) {
  const [form, setForm] = useState(task ? { title: task.title, description: task.description, status: task.status, priority: task.priority, assignee: task.assignee } : EMPTY_FORM);
  const { theme } = useAppCtx();
  const isDark = theme === "dark";
  const firstRef = useRef(null);

  // Focus trap on open (useEffect for DOM side-effect)
  useEffect(() => { firstRef.current?.focus(); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13,
    border: `1px solid ${isDark ? "#2a2f40" : "#d1d5db"}`,
    background: isDark ? "#1a1e2c" : "#f9fafb", color: isDark ? "#e2e6f0" : "#1a1d2e",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: isDark ? "#6b7280" : "#6b7280", marginBottom: 5, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: isDark ? "#181c27" : "#fff", borderRadius: 14, padding: "28px 28px 24px",
        width: "100%", maxWidth: 480, border: `1px solid ${isDark ? "#2a2f40" : "#e5e7ef"}`,
        boxShadow: "0 24px 60px #00000033",
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: isDark ? "#e2e6f0" : "#1a1d2e", marginBottom: 20 }}>
          {task ? "Edit task" : "New task"}
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input ref={firstRef} style={inputStyle} value={form.title} onChange={set("title")} placeholder="Task title" />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} value={form.description} onChange={set("description")} placeholder="Optional detail…" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status} onChange={set("status")}>
                {STATUS_COLS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select style={inputStyle} value={form.priority} onChange={set("priority")}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Assignee</label>
            <input style={inputStyle} value={form.assignee} onChange={set("assignee")} placeholder="Name" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...btnStyle(isDark, "#6b7280"), padding: "8px 18px", fontSize: 13 }}>Cancel</button>
          <button
            disabled={!form.title.trim()}
            onClick={() => onSave({ ...(task || {}), ...form })}
            style={{ ...btnStyle(isDark, "#6366f1"), padding: "8px 20px", fontSize: 13, opacity: form.title.trim() ? 1 : 0.4 }}>
            {task ? "Save changes" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENT: Toolbar
// ─────────────────────────────────────────────
function Toolbar({ filter, setFilter, search, setSearch, onNew, onUndo, onRedo, canUndo, canRedo, polling, setPolling, theme, setTheme, lastSync }) {
  const isDark = theme === "dark";
  const inputBase = {
    padding: "7px 12px", borderRadius: 8, border: `1px solid ${isDark ? "#2a2f40" : "#e5e7ef"}`,
    background: isDark ? "#1a1e2c" : "#f5f6fa", color: isDark ? "#e2e6f0" : "#1a1d2e",
    fontSize: 12, fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 20 }}>
      <input style={{ ...inputBase, width: 200 }} placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select style={inputBase} value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
        <option value="">All statuses</option>
        {STATUS_COLS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>
      <select style={inputBase} value={filter.priority} onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value }))}>
        <option value="">All priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select style={inputBase} value={filter.assignee} onChange={(e) => setFilter((f) => ({ ...f, assignee: e.target.value }))}>
        <option value="">All assignees</option>
        {["Farida K.", "Omar S.", "Priya L."].map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
        <button onClick={onUndo} disabled={!canUndo} title="Undo" style={{ ...iconBtn(isDark), opacity: canUndo ? 1 : 0.3 }}>↩</button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo" style={{ ...iconBtn(isDark), opacity: canRedo ? 1 : 0.3 }}>↪</button>
        <button onClick={() => setPolling((p) => !p)} title={polling ? "Pause polling" : "Resume polling"}
          style={{ ...iconBtn(isDark), color: polling ? "#10b981" : "#6b7280" }}>{polling ? "⏸" : "▶"}</button>
        <button onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")} style={iconBtn(isDark)} title="Toggle theme">
          {isDark ? "☀" : "🌙"}
        </button>
        <button onClick={onNew} style={{
          padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
          background: "#6366f1", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
        }}>+ New task</button>
      </div>
      {lastSync && (
        <div style={{ width: "100%", fontSize: 11, color: isDark ? "#374151" : "#c4c6d0" }}>
          Last sync: {lastSync}
        </div>
      )}
    </div>
  );
}

function iconBtn(isDark) {
  return {
    width: 32, height: 32, borderRadius: 8, border: `1px solid ${isDark ? "#2a2f40" : "#e5e7ef"}`,
    background: isDark ? "#1a1e2c" : "#f5f6fa", cursor: "pointer", fontSize: 15,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}

// ─────────────────────────────────────────────
// COMPONENT: StatsBar
// ─────────────────────────────────────────────
function StatsBar({ tasks }) {
  const { theme } = useAppCtx();
  const isDark = theme === "dark";

  const stats = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    highPriority: tasks.filter((t) => t.priority === "high").length,
  }), [tasks]);

  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const items = [
    { label: "Total", value: stats.total, color: "#6366f1" },
    { label: "In progress", value: stats.inProgress, color: "#f59e0b" },
    { label: "Done", value: stats.done, color: "#10b981" },
    { label: "High priority", value: stats.highPriority, color: "#ef4444" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr) 2fr", gap: 10, marginBottom: 20 }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{
          background: isDark ? "#12151f" : "#f5f6fa",
          border: `1px solid ${isDark ? "#1e2130" : "#e8eaf2"}`,
          borderRadius: 10, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 11, color: isDark ? "#4b5563" : "#9ca3af", marginTop: 4 }}>{label}</div>
        </div>
      ))}
      <div style={{
        background: isDark ? "#12151f" : "#f5f6fa",
        border: `1px solid ${isDark ? "#1e2130" : "#e8eaf2"}`,
        borderRadius: 10, padding: "14px 16px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: isDark ? "#4b5563" : "#9ca3af" }}>Completion</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: isDark ? "#1e2130" : "#e5e7ef" }}>
          <div style={{ height: 6, borderRadius: 99, background: "#10b981", width: `${pct}%`, transition: "width 0.5s ease" }} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENT: LoadingScreen
// ─────────────────────────────────────────────
function LoadingScreen({ isDark }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 16 }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        border: `3px solid ${isDark ? "#2a2f40" : "#e5e7ef"}`,
        borderTopColor: "#6366f1",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 13, color: isDark ? "#4b5563" : "#9ca3af" }}>Loading tasks…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT APP COMPONENT
// ─────────────────────────────────────────────
export default function App() {
  // ── Theme (useLocalStorage custom hook) ──
  const [theme, setTheme] = useLocalStorage("task-dash-theme", "dark");
  const isDark = theme === "dark";

  // ── Task state (useReducer for undo/redo) ──
  const [taskState, dispatch] = useReducer(taskReducer, initialTaskState);
  const optimisticUpdate = useOptimisticUpdate(dispatch);

  // ── UI state ──
  const [filter, setFilter] = useState({ status: "", priority: "", assignee: "" });
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | { mode: 'create' | 'edit', task?: Task }
  const [polling, setPolling] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  // ── Initial load (useFetch custom hook) ──
  const fetcher = useCallback(() => mockApi.fetchTasks(), []);
  const { data: initialTasks, loading } = useFetch(fetcher);

  useEffect(() => {
    if (initialTasks) {
      dispatch({ type: "SET_TASKS", payload: initialTasks });
      setLastSync(new Date().toLocaleTimeString());
    }
  }, [initialTasks]);

  // ── Polling (usePolling custom hook) ──
  const syncTasks = useCallback(async () => {
    try {
      const fresh = await mockApi.fetchTasks();
      // Merge: preserve local status changes, refresh from server otherwise
      dispatch({ type: "SET_TASKS", payload: fresh });
      setLastSync(new Date().toLocaleTimeString());
    } catch {}
  }, []);
  usePolling(syncTasks, 15000, polling);

  // ── Document title side-effect (useEffect) ──
  useEffect(() => {
    const inProgress = taskState.tasks.filter((t) => t.status === "in-progress").length;
    document.title = inProgress > 0 ? `(${inProgress}) Task Dashboard` : "Task Dashboard";
    return () => { document.title = "Task Dashboard"; };
  }, [taskState.tasks]);

  // ── Derived / filtered task list (useMemo) ──
  const filteredTasks = useMemo(() => {
    return taskState.tasks.filter((t) => {
      if (filter.status && t.status !== filter.status) return false;
      if (filter.priority && t.priority !== filter.priority) return false;
      if (filter.assignee && t.assignee !== filter.assignee) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
          !t.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [taskState.tasks, filter, search]);

  // ── Per-column task lists (useMemo) ──
  const tasksByStatus = useMemo(() =>
    STATUS_COLS.reduce((acc, s) => ({ ...acc, [s]: filteredTasks.filter((t) => t.status === s) }), {}),
    [filteredTasks]
  );

  // ── Handlers (useCallback to stabilise references) ──
  const handleStatusChange = useCallback((task, newStatus) => {
    const updated = { ...task, status: newStatus };
    optimisticUpdate(
      { type: "UPDATE_TASK", payload: updated },
      () => mockApi.updateTask(updated),
      { type: "UPDATE_TASK", payload: task }
    );
  }, [optimisticUpdate]);

  const handleSave = useCallback((formData) => {
    if (formData.id) {
      const updated = { ...formData, updatedAt: new Date().toISOString() };
      optimisticUpdate(
        { type: "UPDATE_TASK", payload: updated },
        () => mockApi.updateTask(updated),
        { type: "UPDATE_TASK", payload: taskState.tasks.find((t) => t.id === formData.id) }
      );
    } else {
      const temp = { ...formData, id: "temp-" + Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      optimisticUpdate(
        { type: "ADD_TASK", payload: temp },
        () => mockApi.createTask(formData),
        { type: "DELETE_TASK", payload: temp.id }
      );
    }
    setModal(null);
  }, [optimisticUpdate, taskState.tasks]);

  const handleDelete = useCallback((id) => {
    const task = taskState.tasks.find((t) => t.id === id);
    optimisticUpdate(
      { type: "DELETE_TASK", payload: id },
      () => mockApi.deleteTask(id),
      { type: "ADD_TASK", payload: task }
    );
  }, [optimisticUpdate, taskState.tasks]);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <AppCtx.Provider value={{ theme, user: "You" }}>
      <div style={{
        minHeight: "100vh", fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        background: isDark ? "#0e1118" : "#f0f2f8",
        color: isDark ? "#e2e6f0" : "#1a1d2e",
        padding: "28px 24px",
      }}>
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 22 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: isDark ? "#e2e6f0" : "#1a1d2e" }}>
            Task Dashboard
          </div>
          <div style={{ fontSize: 12, color: isDark ? "#4b5563" : "#9ca3af", fontWeight: 400 }}>
            — React 18 · Hooks · TypeScript patterns
          </div>
          <div style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, color: polling ? "#10b981" : "#6b7280",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: polling ? "#10b981" : "#6b7280",
              animation: polling ? "pulse 2s ease infinite" : "none",
            }} />
            {polling ? "Live" : "Paused"}
          </div>
        </div>

        {/* ── Stats ── */}
        {!loading && <StatsBar tasks={taskState.tasks} />}

        {/* ── Toolbar ── */}
        <Toolbar
          filter={filter} setFilter={setFilter}
          search={search} setSearch={setSearch}
          onNew={() => setModal({ mode: "create" })}
          onUndo={() => dispatch({ type: "UNDO" })}
          onRedo={() => dispatch({ type: "REDO" })}
          canUndo={taskState.past.length > 0}
          canRedo={taskState.future.length > 0}
          polling={polling} setPolling={setPolling}
          theme={theme} setTheme={setTheme}
          lastSync={lastSync}
        />

        {/* ── Kanban Board ── */}
        {loading ? (
          <LoadingScreen isDark={isDark} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {STATUS_COLS.map((s) => (
              <KanbanColumn
                key={s} status={s}
                tasks={tasksByStatus[s] || []}
                onEdit={(t) => setModal({ mode: "edit", task: t })}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}

        {/* ── Modal ── */}
        {modal && (
          <TaskModal
            task={modal.mode === "edit" ? modal.task : null}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        )}

        <style>{`
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
          * { box-sizing: border-box; }
          input, select, textarea, button { font-family: inherit; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #2a2f40; border-radius: 3px; }
        `}</style>
      </div>
    </AppCtx.Provider>
  );
}
