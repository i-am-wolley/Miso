# Miso Design System — sync notes

This repo (`Pantry-OS-App`) has no buildable component package — it's a single
`index.html` app. The "Miso Design System" project in claude.ai/design
(`7901307e-8140-4a72-82b4-3654d76d0886`) is hand-authored to match it: there is
no local source package the automated `package-build.mjs` converter can run
against, so components are written as real JSX, then hand-compiled with a
small local esbuild transform script (not committed — recreate ad hoc) into
the exact `_ds_bundle.js` format the project already used (esbuild classic
JSX transform, one IIFE per component, `@ds-bundle` header with
`format`/`namespace`/`components`/`sourceHashes`).

## What the 2026-08-02 refresh did

Audited ~70 commits since the design system's last build (2026-06-22) via
`git log` and an Explore pass over `index.html`, then added/updated:

- **New**: `DayCard`, `TrackerCard`, `ActivityRow`, `Legend` (data group),
  `Toast` (feedback group) — closing the biggest gap: no 5th tab existed.
- **Updated**: `TabBar` (5 tabs: + Activity), `Icon` (+`activityTab`,
  `dineOut`, `sun`, `ban` — 34 → 38 glyphs), `ItemTile` (+`processed` tint).
- **Tokens**: `--tracker-*` (5-step day-status scale), `--toast-bg-*`,
  `--teal-*` (Dishes "Next week" swatch), `--surface-processed`,
  `--accent-wash`, `--daycard-*`.
- **UI kit**: `ui_kits/miso-app/app.jsx` gained an Activity tab (Logs +
  Metrics toggle) using the new components.
- **Docs**: `readme.md`, `SKILL.md`, `Modal.prompt.md` (added the Dine
  Out/Vacation Mode/Skipped swap-modal pattern), new
  `guidelines/colors-status.html`.

Verified every changed/new preview by serving `ds-bundle/` locally
(`node server.js` on :8842) and rendering in a real Chrome tab via the
claude-in-chrome tools — no console errors, all previews styled/complete.
Did NOT run the automated `package-validate.mjs` render-check pipeline (no
real npm package/dist to point it at); this hand-verification is the
substitute for this repo's shape.

Uploaded as a **scoped write** (only changed/new paths — see the finalize_plan
diff), not the base skill's usual "always full writes," because there is no
deterministic full rebuild to re-emit from; the changed set was tracked by
hand. `deletes: []` — nothing was removed.

## Known gaps / deferred

- **Onboarding intro screen** (new "Plan your week. Not your evening."
  tagline + 4-feature-row intro, Google sign-in step) was NOT added as a
  ui_kit screen or component — only the tagline copy made it into
  `readme.md`. Worth a dedicated pass if the user wants it.
- **AI Usage card** (Settings → Account cost panel) and the **shopping-list
  dish-count badge** ("×3") were documented as compositions of existing
  `Card`/`SectionLabel`/`Badge`, not built as dedicated components — lower
  priority, cheap to add later if requested.
- No `_ds_sync.json` anchor was written (the project never had one before
  this run either) — a future sync will re-verify everything from scratch,
  which is the safe/expected behavior for an un-anchored project.

## Re-sync risks

- The hand-compile step (esbuild classic-JSX transform + manual IIFE
  wrapping) is NOT scripted/committed anywhere — a future session must
  redo it from scratch reading this file and the live bundle's structure
  for the exact wrapper format. Consider formalizing this into a real
  committed build script if Miso gets synced again.
- `sourceHashes` in the bundle header are a simple 12-hex sha256 truncation
  computed ad hoc (see the old script's `sha12()`), not the project's
  original hashing recipe — cosmetic/informational only, harmless since no
  `_ds_sync.json` anchor depends on them.
- App UI surface moves fast (~70 commits between the last two syncs) —
  budget a similar audit-and-catch-up pass next time rather than assuming
  only a couple of components drifted.
