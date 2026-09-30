
## Customer Purchase History Tracker — Frontend Build Plan

A modern, premium, light-mode dashboard inspired by Stripe/Linear/Notion. Frontend only, mock data via local React state, structured so a backend can be wired in later without UI rework.

### Design System

- Typography: Inter Tight (display) + Inter (body), loaded via `<link>` in `__root.tsx`.
- Palette (light mode, OKLCH tokens in `src/styles.css`):
  - Background `#FAFAF9`, surface white, foreground near-black
  - Primary: deep indigo `#4F46E5` with subtle gradient accent
  - Muted greys for borders/secondary text
  - Status: success green, warning amber, danger red for badges
- Radius scale 12–16px, soft layered shadows (`shadow-elegant` token), generous spacing.
- Dark mode tokens scaffolded but not toggled (structure ready).
- All colors via semantic tokens — no hardcoded Tailwind colors in components.

### Routes (TanStack Start, file-based)

```
src/routes/
  __root.tsx              shell + fonts + meta
  login.tsx               standalone (no sidebar)
  _app.tsx                layout: Sidebar + Header + <Outlet/>
  _app.index.tsx          Dashboard (/)
  _app.purchases.add.tsx  Add Purchase
  _app.history.tsx        Purchase History (search by phone)
  _app.customers.tsx      Customer List
  _app.settings.tsx       Settings (placeholder)
```

Sidebar Logout is a link back to `/login`. No real auth.

### Pages

1. **Login** — centered card, logo, welcome text, email/password inputs, primary login button (navigates to `/`), forgot-password link. Fully responsive.
2. **Dashboard** — 4 stat cards (Total Customers, Total Purchases, Today's, This Month's) with trend hints and icons; Recent Purchases table below with search bar, columns per spec, View action opens Purchase Details modal.
3. **Add Purchase** — Customer info card + dynamic product rows (name, qty, price, auto total). Add/Remove row buttons. Live Grand Total. Save (toast + navigate) / Cancel.
4. **Purchase History** — Hero search section (phone input + Search button). On match: Customer Info card with stats + vertical timeline of purchase cards (date, item bullets, total, status badge). Empty state when no match.
5. **Customer List** — Table with search input, sortable column headers (mock sort), pagination controls (mock), View History button routes to `/history?phone=...`.

### Shared Components (`src/components/`)

- Layout: `AppShell`, `Sidebar` (collapsible via shadcn sidebar pattern, mobile sheet), `Header` (page title, search, notification icon, avatar)
- UI primitives reused from shadcn: button, input, card, table, dialog, badge, skeleton
- Custom: `StatCard`, `PurchaseTable`, `TimelineCard`, `PurchaseDetailsModal`, `SearchBar`, `Pagination`, `EmptyState` (with illustration SVG), `LoadingSkeleton`
- Hover/transition utilities applied consistently

### Mock Data

`src/lib/mock-data.ts` exports `customers[]`, `purchases[]` (with realistic Indian names, phone numbers, products, ₹ amounts, dates spanning recent months). Helper selectors: `getCustomerStats`, `findByPhone`, `getRecentPurchases`. Data lives in a `PurchasesProvider` (React context) so Add Purchase appends in-memory and reflects across pages during the session.

### UX Details

- Sticky sidebar and sticky table headers
- Skeleton loaders on initial page mounts (simulated 400ms)
- Empty states with friendly SVG illustration
- Smooth transitions (Tailwind `transition-*`), subtle hover lifts on cards
- Toast notifications via existing sonner for Save/Cancel feedback
- Responsive: sidebar collapses to icons on tablet, drawer on mobile; tables become horizontally scrollable; stat cards stack

### Technical Notes

- TanStack Router file conventions; underscore `_app` layout groups authenticated-feel pages with shell.
- React state + context only; no server functions, no Supabase.
- Modular folder layout (`components/`, `components/ui/`, `lib/`, `routes/`) ready for later Cloud integration.
- Replace placeholder index, update root `<head>` title/description to "Purchase Tracker".

### Out of Scope

- Real authentication, persistence, API calls, dark mode toggle UI, real pagination/sort logic, real notifications.
