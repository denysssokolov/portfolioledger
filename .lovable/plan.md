# Plan

Twelve related changes grouped into five workstreams. I'll ship them in this order so the data/auth foundation is in place before UI features stack on top.

## 1. Registration codes (replaces the start-up code gate)

- Add `access_mode` (`'demo' | 'full'`) column on `profiles`.
- Sign-up form gets a required **Access code** field. `1234` → demo, `0912` → full, anything else → inline "Invalid access code" error.
- The code is sent as `options.data.access_mode` on signup; the existing `handle_new_user` trigger copies it into `profiles.access_mode`.
- Remove the launch-time `AccessGate` prompt. Mode is now read from the signed-in profile via a `useAccessMode()` hook.

## 2. Demo lock everywhere

- The existing supabase write-guard stays (covers DB mutations) but the message becomes: **"This feature is locked. Enter an unlock code in Settings → Investment portfolio."**
- A small `useLockedAction()` helper lets client-only "features" (toggles, sliders, equity edits, close-position, etc.) early-return with the same toast in demo mode.
- Gated surfaces: equity / account-size editing, safety toggle, snapshot edits, add-trade, close-position, "close all of ticker", any settings toggle.

## 3. Unlock card in Settings (demo only)

- Under Investment portfolio, render an "Unlock full access" card **only when `access_mode === 'demo'`**.
- Submitting `0912` updates `profiles.access_mode = 'full'`, invalidates the profile query, shows success toast; the card disappears.
- Wrong code → inline error, no DB write.

## 4. Notifications system

- Toasts auto-dismiss after **5s by default**; PnL morning toast and snapshot reminder pass `duration: Infinity` and keep the close button.
- A small `notify()` wrapper sets the right duration and pushes the entry into a Zustand store persisted in `localStorage` (~50 entries).
- New **bell button** in the header opens a right-side `Sheet` listing past notifications, newest first, with **Clear all**.
- When 2+ toasts are visible, a floating **Clear all** action appears above the bottom toast.

## 5. Swing trades UX

- **Add trade dialog**: when a position on the same ticker exists, the "use existing stop loss" suggestion gets a **checkbox**. Stop-loss only auto-fills once it's ticked.
- **Open / Closed tabs** below the search bar; URL state `?view=open|closed`. Closed trades move out of the main list into the Closed tab.
- **Close position dialog**:
  - New **"Use current price"** checkbox, ticked by default; price input is disabled and shows the live quote.
  - Typing in the price input auto-unticks the box and uses the typed price.
  - **"Close all open positions on TICKER"** button when >1 open trade exists on that ticker.
- **PnL by day**: new chart on the PnL page (recharts, cumulative line with subtle area fill) summing realised PnL grouped by `exit_date`.

## 6. Onboarding cash account + password autofill

- During onboarding (and account creation), when account type is `cash` the **Cash portion** input is disabled and shows "= Amount now"; on submit we send `cash_portion = amount_now`.
- Password-save popup on the second account field: caused by inputs being treated as a credential form. Fix with `autoComplete="off"` on the wrapping form, non-credential `name` attributes on the numeric inputs, and a hidden dummy username/password pair (standard browser workaround). Same fix applied to the Settings equity field.

## Technical notes

- Migration: `ALTER TABLE public.profiles ADD COLUMN access_mode text NOT NULL DEFAULT 'full' CHECK (access_mode IN ('demo','full'));` plus update `handle_new_user` to read `NEW.raw_user_meta_data->>'access_mode'`.
- New files: `src/lib/notifications.ts`, `src/components/NotificationCenter.tsx`, `src/components/ClearAllToasts.tsx`, `src/hooks/useLockedAction.ts`, `src/components/UnlockFullAccessCard.tsx`.
- `AccessGate` shrinks to a mode provider (no more launch-time prompt).
- All styling via existing tokens.

## Open questions

1. **Existing accounts** (created before this migration) — default to `full` so no one locks themselves out? I'll do that unless you say otherwise.
2. **PnL-by-day chart** — cumulative line (default) or daily bars?

Approve and I'll ship in the order above: migration → registration code → demo helper → Settings unlock card → notifications → swing-trade UX → onboarding fixes.
