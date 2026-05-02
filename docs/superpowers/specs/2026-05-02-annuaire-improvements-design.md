# Design Spec: Annuaire Improvements & New Features

**Date:** 2026-05-02  
**Status:** Approved  

---

## Overview

Five features to improve the JuMP Oracle web app:
1. Full-page scroll + server-side pagination in the annuaire
2. Fix list & tags creation and the bulk add feature
3. Share a prospect list with other members (view + add rights)
4. Clickable profiles in the list detail view
5. New Members page

---

## 1. Annuaire — Full-Page Scroll + Server-Side Pagination

### Problem
The table is locked inside a `maxHeight: calc(100vh - 300px)` div. All 20K rows load at once with no pagination.

### Changes

**`DirectoryPage.jsx`**
- Remove fixed-height container; let the page scroll naturally via the Layout wrapper.
- Add `page` (default: 1) and `pageSize` (50) state.
- Searching resets `page` to 1.
- The search bar and bulk action bar are `position: sticky; top: 0` so they stay visible while scrolling.
- Render a pagination bar at the bottom: `« Previous | 1 2 3 … | Next »`. Show current page and total page count. Ellipsis collapses runs of middle pages.

**`useContacts.js`**
- New signature: `useContacts({ page, pageSize, query })`.
- Uses Supabase `.range(from, to)` for offset-based pagination.
- Separate `count` query: `.select('*', { count: 'exact', head: true })` to get the total row count for rendering the pagination bar.
- Search moves server-side: `.ilike('nom', '%query%').or('prenom.ilike.%query%,entreprise_actuelle.ilike.%query%,ville.ilike.%query%')`. Replaces the current client-side `.includes()` filter.
- Returns `{ contacts, total, loading, error }`.

### Constraints
- Page size fixed at 50. Not configurable for now.
- Pagination bar shows at most 7 page buttons (first, last, current ±2, with ellipsis).

---

## 2. Fix List & Tags Creation + Bulk Add Feature

### Problem
- Bulk "Create list" has no name prompt — broken.
- Bulk "Add to list" renders but has no handler.
- "Tag" button renders but tags don't exist in the DB.

### Changes

**Database migration**
- Add `tags text[] DEFAULT '{}'` column to `contacts` table.

**Bulk "Create list" flow**
- Clicking "Create list" opens a small modal with a single text input ("Nom de la liste").
- On confirm: `createList(name)` → batch-insert all selected contact IDs into `prospecting_list_contacts` (single `insert` call with array) → navigate to `/annuaire/listes/{newListId}`.
- Uses `ON CONFLICT DO NOTHING` (or `.upsert()`) to avoid duplicate junction rows.

**Bulk "Add to list" flow**
- Clicking "Add to list" opens a dropdown listing the user's existing lists.
- Selecting a list batch-inserts selected contact IDs into that list (same upsert pattern).
- Shows a transient success toast ("X contacts ajoutés à [list name]").

**Tags on contacts**
- "Tag" button in the bulk action bar opens a small popover: free-text input for a tag name, then "Appliquer".
- Saves tag to `contacts.tags` array for each selected contact via `UPDATE contacts SET tags = array_append(tags, $tag) WHERE id = ANY($ids)`.
- Tag color is **deterministic** — derived from a hash of the tag string modulo 6 preset colors (same palette as list colors). No color is stored in the DB; same tag name always produces the same color.
- `ContactDrawer` displays existing tags as small colored pills below the contact's name. Clicking a pill removes that tag from the contact.
- Tags are also displayed as pills in the `DirectoryPage` table row (truncated to 2 visible, +N if more).

---

## 3. Share Prospect List

### Database migration
New table:
```sql
CREATE TABLE list_shares (
  list_id    UUID REFERENCES prospecting_lists(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by  UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (list_id, shared_with)
);
```

**RLS on `list_shares`:**
- Authenticated users can SELECT rows where `shared_with = auth.uid()` OR `shared_by = auth.uid()`.
- Authenticated users can INSERT/DELETE rows where `shared_by = auth.uid()`.

**RLS on `prospecting_lists`:** Add a new SELECT policy so users can also read lists shared with them:
```sql
USING (created_by = auth.uid() OR id IN (
  SELECT list_id FROM list_shares WHERE shared_with = auth.uid()
))
```

**RLS on `prospecting_list_contacts`:** 
- List owners (via `prospecting_lists.created_by = auth.uid()`): full SELECT, INSERT, DELETE.
- Recipients (shared_with via `list_shares`): SELECT and INSERT only — cannot remove contacts from a shared list they don't own.

### UI Changes

**`ListsPage.jsx` — list detail header**
- "Share" button (people+ icon) next to Export CSV.
- Opens a modal: search members by name/email (fetches from `profiles`), select them, click "Share".
- Selected members shown as chips. Owner can remove a chip to revoke access (deletes the share row).

**`ListsPage.jsx` — sidebar**
- "Partagées avec moi" section below the user's own lists.
- Each shared list shows a people icon instead of a color dot, plus the owner's name in smaller text below the list name.

**`useProspectingLists.js`**
- `fetchLists()` query joins `list_shares` to return both owned and shared lists.
- New `shareList(listId, userIds[])` function: batch-inserts into `list_shares`.
- New `revokeShare(listId, userId)` function: deletes the share row.

---

## 4. Clickable Profiles in List View

### Problem
Contact rows in `ListsPage` have no click handler — only a trash icon.

### Changes

**`ListsPage.jsx`**
- Add `selectedContact` and `drawerOpen` state.
- Clicking a contact row sets `selectedContact` and opens the drawer.
- Import and render `ContactDrawer` at the bottom of the page, same as in `DirectoryPage`.
- The trash icon calls `e.stopPropagation()` so it doesn't trigger the drawer.

No changes needed to `ContactDrawer` itself.

---

## 5. Members Page

### Database migration
Add RLS policy on `profiles`:
```sql
CREATE POLICY "Members can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);
```
(Existing "Users can view own profile" policy remains for backward compatibility — Supabase uses OR across policies.)

### New files
- `src/features/members/pages/MembersPage.jsx`
- `src/features/members/hooks/useMembers.js`

### `useMembers.js`
```
supabase.from('profiles').select('id, prenom, nom, role').order('nom')
```
Returns `{ members, loading, error }`.

### `MembersPage.jsx`
- Table matching annuaire style (same header, same row height).
- Columns: Avatar (initials circle, role-colored: blue for admin, grey for membre), Name (`prenom + nom`), Email (fetched from `auth.users` via a view or stored on profile), Role badge.
- No pagination (teams are small).
- Read-only — no edit/delete actions.

> **Note on email:** The `profiles` table does not currently store email. Two options:
> - Option A: Add `email` column to `profiles`, populated on sign-up via the existing trigger.
> - Option B: Fetch email from `auth.users` via a Supabase admin view (requires service role key — not suitable for client).
> **Decision: Option A** — add `email text` to `profiles` and update the sign-up trigger to populate it.

### Routing & Nav
- `App.jsx`: Add `/membres` route → `<MembersPage />` (protected).
- `Sidebar.jsx`: Add "Membres" nav item under "Prospection" section with a `fa-users` icon.

---

## Data Flow Summary

| Feature | DB Change | Hook Change | Page Change |
|---|---|---|---|
| Pagination | None | `useContacts` signature + `.range()` | `DirectoryPage` state + pagination bar |
| Full-page scroll | None | None | Remove fixed-height container |
| Tags | `contacts.tags text[]` | `useContacts.updateTags()` | `DirectoryPage` bulk "Tag" popover + `ContactDrawer` pills |
| Fix create list | None | `createListFromContacts()` | Bulk action modal |
| Fix add to list | None | `addContactsToList()` | Bulk action dropdown |
| Share list | `list_shares` table + RLS | `shareList()`, `revokeShare()` | Share modal + sidebar section |
| Clickable profiles | None | None | `ListsPage` drawer state |
| Members page | `profiles.email` + RLS | `useMembers.js` | `MembersPage.jsx` + route + sidebar |

---

## Out of Scope

- Contact edit from within the list detail (drawer is read-only for now).
- List sharing notifications / email alerts.
- Tagging multiple values in a single bulk action popover (one tag at a time).
- Removing tags from the bulk action bar (only from the drawer).
