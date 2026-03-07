# Archival Workflow

Use this as the canonical, single-source archival policy for tickets, specs, brainstorming docs, and reports.

## Required Steps

1. Edit the document to mark final status at the top:
   - `**Status**: ✅ COMPLETED` or `**Status**: COMPLETED`
   - `**Status**: ❌ REJECTED` or `**Status**: REJECTED`
   - `**Status**: ⏸️ DEFERRED` or `**Status**: DEFERRED`
   - `**Status**: 🚫 NOT IMPLEMENTED` or `**Status**: NOT IMPLEMENTED`
2. For completed items, add an `Outcome` section at the bottom with:
   - completion date
   - what actually changed
   - deviations from original plan
   - verification results
3. If implementation is refined after archival and the archived `Outcome` becomes stale, amend the archived document before merge/finalization so ownership, behavior, and verification facts remain accurate.
   - Add `Outcome amended: YYYY-MM-DD` inside `## Outcome` for each post-completion refinement update.
   - Policy effective date: `2026-03-05` (forward-only enforcement; no mandatory historical backfill before this date).
4. Ensure destination archive directory exists:
   - `archive/tickets/`
   - `archive/specs/`
   - `archive/brainstorming/`
   - `archive/reports/`
5. Move with the collision-safe command (never raw `mv`):
   - `node scripts/archive-ticket.mjs <source> <archive-destination>`
   - The script also rewrites matching moved-path references across active `tickets/*.md` (including `**Deps**` and other markdown references) from old path to new path.
   - **Note**: The script rewrites references in active tickets only. Archived tickets (`archive/tickets/`) with stale deps pointing at the moved file must be fixed manually when discovered.
6. If there is a filename collision, pass an explicit non-colliding destination filename.
7. Confirm the original path no longer exists in its source folder (`tickets/`, `specs/`, `brainstorming/`, or `reports/`).
8. Run `pnpm run check:ticket-deps` to verify:
   - active ticket dependency/reference integrity remains valid
   - archived ticket `Outcome` sections have no explicit contradictory path claims (for example path marked unchanged and changed in the same Outcome)
   - archived tickets completed on/after `2026-03-05` include `Outcome amended: YYYY-MM-DD` when git history indicates post-completion edits to the archived ticket file

## Examples

- `node scripts/archive-ticket.mjs tickets/ENGINEARCH-080.md archive/tickets/`
- `node scripts/archive-ticket.mjs tickets/FITLGOLT4-006.md archive/tickets/FITLGOLT4-006-turn4-golden-coverage.md`
- `node scripts/archive-ticket.mjs specs/48-fitl-section5-rules-gaps.md archive/specs/`
