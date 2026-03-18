# Task Dashboard

A production-grade **React 18** single-page application built to showcase idiomatic hook composition, derived state management, async side-effect handling, and component lifecycle control — written to the standard expected of a senior software engineer.

> **Stack:** React 18 · Hooks · Context API · useReducer · Custom Hooks · Optimistic Updates · Vanilla CSS-in-JS  
> **No build step required** — runs directly in the browser via Babel Standalone + React UMD

---

## Table of Contents

- [Live Preview](#live-preview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Hook Responsibilities](#hook-responsibilities)
- [Custom Hooks](#custom-hooks)
- [Data Flow](#data-flow)
- [Component Tree](#component-tree)
- [State Management](#state-management)
- [Optimistic Updates](#optimistic-updates)
- [Getting Started](#getting-started)
- [Technical Decisions](#technical-decisions)
- [Future Improvements](#future-improvements)

---

## Live Preview

Open `index.html` directly in any modern browser — no install, no bundler, no CLI needed.

```bash
# macOS
open index.html

# Windows
start index.html

# Or serve locally (recommended for development)
npx serve .
```

---

## Features

| Feature | Implementation |
|---|---|
| Kanban board | Three-column layout: To Do · In Progress · Done |
| Live polling | Syncs with mock API every 15 seconds via `usePolling` |
| Optimistic updates | Local state writes immediately; rolls back on API failure |
| Undo / Redo | Full multi-level history stack powered by `useReducer` |
| Search & filters | Filter by status, priority, and assignee — derived via `useMemo` |
| Create / Edit tasks | Modal form with focus trap and controlled inputs |
| Dark / Light theme | Persisted to `localStorage` via `useLocalStorage` custom hook |
| Animated splash screen | Dismissed by React's own `useEffect` after first paint |
| Document title sync | Reflects in-progress task count via `useEffect` |
| AbortController cleanup | All fetches cancel cleanly on unmount or dependency change |

---

## Project Structure

```
task-dashboard/
├── index.html          # Entry point — React UMD + Babel Standalone + full app
└── README.md           # This file
```

The entire application is self-contained in `index.html`. This is intentional for the demonstration context — in a production Vite/CRA project each section below would be its own file.

---

## Architecture Overview

```
index.html
│
├── UMD Scripts (loaded first)
│   ├── react@18          → window.React
│   ├── react-dom@18      → window.ReactDOM
│   └── @babel/standalone → transpiles JSX at runtime
│
└── <script type="text/babel">
    │
    ├── MOCK DATA & MOCK API
    │
    ├── CONTEXT             (AppCtx — theme + user)
    │
    ├── REDUCER             (taskReducer — undo/redo history)
    │
    ├── CUSTOM HOOKS
    │   ├── useFetch
    │   ├── usePolling
    │   ├── useLocalStorage
    │   └── useOptimisticUpdate
    │
    ├── COMPONENTS
    │   ├── App              ← root, owns all state
    │   ├── StatsBar
    │   ├── Toolbar
    │   ├── KanbanColumn
    │   ├── TaskCard
    │   ├── TaskModal
    │   ├── Avatar
    │   ├── PriorityBadge
    │   └── LoadingScreen
    │
    └── ReactDOM.createRoot → mount
```

---

## Hook Responsibilities

Every hook in this project has a deliberate, single responsibility. No hook does double duty.

| Hook | Responsibility in this project |
|---|---|
| `useState` | Task list, filter selection, modal open state, form field values, loading/error flags |
| `useEffect` | Polling interval setup & cleanup, focus trap on modal open, document title sync, AbortController teardown |
| `useReducer` | Undo/redo history — action-based mutations keep state transitions predictable and testable |
| `useCallback` | Stabilises event handlers passed to child components to prevent wasteful re-renders |
| `useMemo` | Filtered + sorted task list derived from raw state — recomputes only when dependencies change |
| `useRef` | Stores the latest polling interval ID and AbortController without triggering re-renders |
| `useContext` | Theme and user data consumed deep in the tree without prop-drilling |
| `createContext` | Creates the `AppCtx` context object shared across the component tree |

---

## Custom Hooks

### `useFetch(fetcher)`

Encapsulates loading, error, and data state with automatic `AbortController` cleanup on dependency change or unmount.

```js
function useFetch(fetcher) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const abortRef              = useRef(null);

  const execute = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();   // cancel previous
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // ...fetch logic with ctrl.signal.aborted guard
  }, [fetcher]);

  useEffect(() => {
    execute();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [execute]);

  return { data, loading, error, refetch: execute };
}
```

**Why it matters:** Without the abort guard, a slow response can set state on an unmounted component, causing memory leaks and "Can't perform a React state update on an unmounted component" warnings.

---

### `usePolling(callback, interval, active)`

Runs a callback on a configurable interval using `useRef` to hold the latest callback reference — the canonical fix for the stale-closure bug.

```js
function usePolling(callback, interval, active = true) {
  const cbRef = useRef(callback);
  useEffect(() => { cbRef.current = callback; }, [callback]);   // always up-to-date

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => cbRef.current(), interval);    // calls latest version
    return () => clearInterval(id);
  }, [interval, active]);
}
```

**Why it matters:** If you put `callback` directly in the `setInterval` closure, the interval captures the version of the callback from the first render and never updates. The `useRef` pattern ensures the interval always calls the current callback without needing to re-register the interval.

---

### `useLocalStorage(key, initialValue)`

Bidirectional sync between `useState` and `localStorage`. SSR-safe (guards on `typeof window`).

```js
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const s = window.localStorage.getItem(key);
      return s !== null ? JSON.parse(s) : initialValue;
    } catch { return initialValue; }
  });

  const setStored = useCallback((val) => {
    const v = typeof val === "function" ? val(value) : val;
    setValue(v);
    try { window.localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key, value]);

  return [value, setStored];
}
```

**Used for:** Persisting the dark/light theme preference across sessions.

---

### `useOptimisticUpdate(dispatch)`

Writes to local state immediately, calls the API, then either reconciles the server response or dispatches a rollback action on failure.

```js
function useOptimisticUpdate(dispatch) {
  return useCallback(async (optimisticAction, apiFn, rollbackAction) => {
    dispatch(optimisticAction);       // immediate local write
    try {
      const result = await apiFn();   // async API call
      if (result && optimisticAction.type === "UPDATE_TASK")
        dispatch({ type: "UPDATE_TASK", payload: result }); // reconcile
    } catch {
      dispatch(rollbackAction);       // roll back on failure
    }
  }, [dispatch]);
}
```

**Usage pattern:**

```js
optimisticUpdate(
  { type: "UPDATE_TASK", payload: updated },   // optimistic
  () => mockApi.updateTask(updated),           // async API
  { type: "UPDATE_TASK", payload: original }  // rollback
);
```

---

## Data Flow

All data flows in a single direction through the application.

```
API (mockApi.fetchTasks)
        │
        ▼
  SET_TASKS action
        │
        ▼
  useReducer (taskState.tasks)     ← single source of truth
        │
        ▼
  useMemo (filteredTasks)          ← derived, never duplicated
        │
        ▼
  useMemo (tasksByStatus)          ← split by column, derived
        │
        ▼
  KanbanColumn × 3 (pure render)
        │
        ▼
  TaskCard (reads context for theme)
```

Mutations follow the inverse path: user action → `useOptimisticUpdate` → local dispatch + async API → reconcile or rollback.

---

## Component Tree

```
App
├── AppCtx.Provider  (theme, user)
│   ├── StatsBar
│   │   └── [metric cards + progress bar]
│   │
│   ├── Toolbar
│   │   ├── [search input]
│   │   ├── [filter selects]
│   │   └── [undo / redo / polling / theme / new task buttons]
│   │
│   ├── LoadingScreen          (shown while useFetch is pending)
│   │
│   ├── KanbanColumn × 3       (todo / in-progress / done)
│   │   └── TaskCard × n
│   │       ├── PriorityBadge
│   │       └── Avatar
│   │
│   └── TaskModal              (create or edit, conditionally rendered)
```

---

## State Management

State is split by concern and co-located as close to usage as possible.

### Global state — `useReducer` + Context

The task list and its undo/redo history live in a `useReducer` at the `App` root. Every mutation is expressed as a named action, making the state machine easy to test in isolation.

```js
// Action types
SET_TASKS    → replaces full list, clears history
UPDATE_TASK  → updates one task, saves snapshot to `past`
ADD_TASK     → appends task, saves snapshot
DELETE_TASK  → removes task, saves snapshot
UNDO         → pops from `past`, pushes to `future`
REDO         → pops from `future`, pushes to `past`
```

State shape:

```js
{
  tasks:   Task[],   // current working list
  past:    Task[][], // undo snapshots (stack)
  future:  Task[][], // redo snapshots (stack)
}
```

### UI state — local `useState`

| State | Location | Why local |
|---|---|---|
| `filter` | `App` | Affects derived list, owned by root |
| `search` | `App` | Same — drives `useMemo` |
| `modal` | `App` | Controls conditional render |
| `polling` | `App` | Controls `usePolling` active flag |
| `hovered` | `TaskCard` | Pure visual, no parent needs it |
| `form` | `TaskModal` | Controlled inputs, scoped to modal lifecycle |

### Persisted state — `useLocalStorage`

| Key | Value | Default |
|---|---|---|
| `task-dash-theme` | `"dark"` \| `"light"` | `"dark"` |

---

## Optimistic Updates

Every mutation (status change, edit, delete, create) follows this three-step pattern:

1. **Dispatch immediately** — the UI updates in the same frame as the user action, with no loading spinner
2. **Fire the API call** — runs in the background
3. **Reconcile or rollback** — on success, apply the server's response (e.g. updated `updatedAt`); on failure, dispatch the rollback action to restore the previous state

This gives the application a snappy, native-app feel while remaining consistent with the server.

---

## Getting Started

### Prerequisites

- Any modern browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- No Node.js, no npm, no build tools required

### Running locally

```bash
# Clone the repo
git clone https://github.com/your-username/task-dashboard.git
cd task-dashboard

# Open directly (macOS / Linux)
open index.html

# Or serve with a local HTTP server
npx serve .
# → http://localhost:3000
```

### Optional: Vite migration

To move to a proper build setup:

```bash
npm create vite@latest task-dashboard -- --template react
# Copy the <script type="text/babel"> contents into src/App.jsx
# Replace `const { useState, ... } = React` with proper ES imports
# Run: npm install && npm run dev
```

---

## Technical Decisions

**Why no external state library?**
The application demonstrates that `useReducer` + Context + custom hooks covers the majority of real-world state requirements without adding a dependency. The undo/redo history, optimistic updates, and polling logic are all implemented from first principles.

**Why Babel Standalone instead of a bundler?**
The goal is zero friction for reviewers — clone and open. Babel Standalone compiles JSX at runtime with no tooling. For production, swap to Vite: the code is structured identically, only the delivery mechanism changes.

**Why `useRef` for the polling callback?**
Putting the callback directly in `setInterval` captures a stale closure from the first render. The ref pattern updates silently without triggering a re-render or re-registering the interval — the correct approach described in the React docs.

**Why `useMemo` for filtered tasks instead of a separate state array?**
Keeping a filtered copy in state creates a synchronisation problem: every mutation must update both arrays. Deriving the filtered list from a single source of truth via `useMemo` eliminates that class of bug entirely.

**Why `useCallback` on all handlers?**
Child components that receive handlers as props will re-render whenever the reference changes. `useCallback` memoises the function reference so child components only re-render when their actual dependencies change.

---

## Future Improvements

- **Drag-and-drop** between kanban columns using the HTML5 Drag and Drop API or `@dnd-kit/core`
- **Real API integration** — replace `mockApi` with `fetch` calls to a REST or GraphQL endpoint
- **React Query / SWR** — replace `useFetch` + `usePolling` with a dedicated data-fetching library for more sophisticated caching and background sync
- **Vitest + React Testing Library** — unit tests for each custom hook and integration tests for the optimistic update flows
- **TypeScript migration** — convert JSDoc typedefs to full `.ts`/`.tsx` files with strict mode enabled
- **Virtualized list** — `react-window` for performance with large task lists
- **Keyboard navigation** — full WCAG 2.2 AA compliance including focus management within the kanban board

---

## Licence

MIT — free to use, modify, and distribute.

---

*Built as a practical demonstration of React 18 functional components, hooks, and production-grade state management patterns.*
