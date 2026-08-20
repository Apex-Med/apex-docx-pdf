## Design 
**IMPORTANT**
- Ensure all ui implentations follow conventions in the interface-details skill. Use this skill when making changes to the ui or implementing new features.
- Ensure that the ui is professional and clean -- without unecessary backend explanations in the ui.

## State & Data Flow (TanStack Start)

Do not fetch or derive app state in `useEffect`. Reserve effects for real external side-effects (DOM, subscriptions, analytics).

- **Fetching:** load data in TanStack Router loaders (SSR + streaming). Seed TanStack Query with `queryClient.ensureQueryData(queryOptions(...))`, then read via `useSuspenseQuery`.
- **Mutations:** do server work in Server Functions (`createServerFn(...).handler(...)`); after mutating, call `router.invalidate()` and/or `queryClient.invalidateQueries()`.
- **Page/UI state:** keep in the URL with typed search params (`validateSearch` → `Route.useSearch` → `navigate({ search })`).
- **Derived state:** compute during render (`useMemo` only when expensive).
- **External stores:** read with `useSyncExternalStore`.
- **React 19:** `useActionState` for form pending/error/result (pairs with Server Functions / TanStack Form); `use()` to suspend on promises.

"If your effect was doing X → use Y": fetch on mount → loader; submit/mutate → Server Function + invalidate; sync UI to querystring → search params; subscribe to a store → `useSyncExternalStore`; only DOM/non-React widgets → small `useEffect`/`useLayoutEffect`.

**Zustand specifics:** create a per-request store instance (avoid SSR leaks); inject via Router context; dehydrate/hydrate with `router.dehydrate`/`router.hydrate` so snapshots stream with the page. Clear transient UI on `router.subscribe('onResolved', ...)`. After a mutation, optionally update the store optimistically, then `router.invalidate` to reconcile with loader data. Use `persist` only for client/session state (never touch storage during SSR). Use atomic selectors (`useStore(s => slice)`) + equality helpers to limit re-renders.

## Time in queries

- Never use `Date.now()` / `new Date()` inside Convex **queries** (breaks caching/reactivity). Pass `now` / `today` from the client.

### TanStack Router links

- Sidebar/nav items: `SidebarMenuButton render={<Link to={…} />}` (Base UI `render` prop).
- Dropdown nav items: `<DropdownMenuItem asChild><Link to={…}>…</Link></DropdownMenuItem>` — do not nest `<Link>` inside a non-asChild menu item.

---
description: Base UI Select must pass items so SelectValue shows labels, not raw values
globs: **/*.{tsx,ts}
alwaysApply: false
---

# Base UI Select labels

When using `@base-ui/react` Select (including `@workspace/ui` `Select` / `SimpleSelect`):

- Always pass an `items` prop on `Select` / `Select.Root` whenever the option **value** differs from the visible **label** (enums, Convex IDs, slugs, etc.).
- Prefer `SimpleSelect` with `{ value, label }` options — it already wires `items`.
- For raw `Select`, pass either:
  - `items={{ valueKey: "Label" }}`, or
  - `items={options.map((o) => ({ value: o.id, label: o.name }))}`
- Never assume `SelectValue` will mirror `SelectItem` children. Without `items`, the trigger shows the raw value (e.g. `j57...` IDs, `veterinary_nurse`).
- Safe to skip `items` only when value === label (e.g. `"09"` / `"09"`).

## Bad

```tsx
<Select value={practiceId} onValueChange={...}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    {practices.map((p) => (
      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

## Good

```tsx
<Select
  value={practiceId}
  items={practices.map((p) => ({ value: p.id, label: p.name }))}
  onValueChange={...}
>
  <SelectTrigger><SelectValue placeholder="Choose practice" /></SelectTrigger>
  <SelectContent>
    {practices.map((p) => (
      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```