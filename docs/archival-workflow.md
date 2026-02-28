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
3. Ensure destination archive directory exists:
   - `archive/tickets/`
   - `archive/specs/`
   - `archive/brainstorming/`
   - `archive/reports/`
4. Move with the collision-safe command (never raw `mv`):
   - `node scripts/archive-ticket.mjs <source> <archive-destination>`
   - The script also rewrites matching `**Deps**` references in active `tickets/*.md` from old path to new path.
5. If there is a filename collision, pass an explicit non-colliding destination filename.
6. Confirm the original path no longer exists in its source folder (`tickets/`, `specs/`, `brainstorming/`, or `reports/`).
7. Run `pnpm run check:ticket-deps` to verify active ticket dependency integrity remains valid.

## Examples

- `node scripts/archive-ticket.mjs tickets/ENGINEARCH-080.md archive/tickets/`
- `node scripts/archive-ticket.mjs tickets/FITLGOLT4-006.md archive/tickets/FITLGOLT4-006-turn4-golden-coverage.md`
- `node scripts/archive-ticket.mjs specs/48-fitl-section5-rules-gaps.md archive/specs/`
