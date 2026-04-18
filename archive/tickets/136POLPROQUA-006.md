# 136POLPROQUA-006: Docs — FOUNDATIONS note + `campaigns/README.md`

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: No — documentation only
**Deps**: `specs/136-policy-profile-quality-corpus.md`

## Problem

Spec 136 Implementation Direction → Ownership prescribes two documentation additions:

1. "`docs/FOUNDATIONS.md` gets a note distinguishing engine-level determinism proofs from profile-level quality witnesses."
2. "`campaigns/` README notes where policy-profile regressions are tracked."

These are contractual outputs of the spec. Without them, future contributors rediscovering the corpus will have to re-derive the determinism/quality distinction from tickets and spec history — the anti-pattern Spec 136 exists to prevent.

Currently `campaigns/` has no top-level `README.md` (verified 2026-04-18); individual campaign directories under `campaigns/` each have their own `program.md` and `musings.md` but there is no umbrella doc. This ticket creates the umbrella README and extends FOUNDATIONS.

## Assumption Reassessment (2026-04-18)

1. `docs/FOUNDATIONS.md` exists (verified; 109 lines). It has 17 numbered principles. A new note should be appended either under Foundation #8 (Determinism Is Sacred) as a clarification, or as a standalone section at the end titled "Determinism Proofs vs. Profile-Quality Witnesses" — the latter preserves the numbered-principle structure and avoids shifting downstream cross-references.
2. No `campaigns/README.md` exists. Creating it is net-new. The README's audience is (a) a contributor looking at `campaigns/` for the first time who wants to understand what each subdirectory is, and (b) a policy-profile maintainer who needs to know where regressions surface (answer: the non-blocking `policy-profile-quality` lane plus the current warning/comment reporting surface from Ticket 005).
3. Ticket 002 authors the corpus files, Ticket 005 authors the annotation script. This ticket's docs reference both — but authorable from the spec alone since the spec fixes the file names and behaviors. The value-dependency on Tickets 002 and 005 is noted for session ordering but does not block ticket authorship.
4. `docs/archival-workflow.md` exists as precedent for how FOUNDATIONS references sibling docs (`[…] governed by docs/FOUNDATIONS.md`). The new note can follow the same voice.
5. Spec 136 is in `specs/` (DRAFT); once all tickets complete, the spec archives per repo archival policy. Docs must reference the archived path once that happens — but this ticket lands while the spec is still DRAFT, so references use `specs/136-policy-profile-quality-corpus.md`. An archival follow-up is out of scope here.
6. Live repo correction: Ticket 005 did not ship baseline-delta comparison against main; it shipped current-run warning + sticky-comment reporting, and baseline-delta follow-up ownership now lives in `tickets/136POLPROQUA-007.md`. This ticket's docs must describe the live contract, not the still-open follow-up.

## Architecture Check

1. **Documentation reinforces architecture**. The FOUNDATIONS note makes the determinism/quality distinction first-class in the architectural commandments, so future specs reading FOUNDATIONS see the distinction without needing to read Spec 136. Aligns with FOUNDATIONS #15 (Architectural Completeness — no tribal knowledge).
2. **Single source of truth for campaigns entry point**. `campaigns/README.md` becomes the canonical landing for campaign-related navigation: what each subdirectory contains, how the profile-quality corpus relates to the campaign pipeline, where regressions surface.
3. **FOUNDATIONS #14 respected**. No aliased, no `docs/CAMPAIGNS_README.md` shim, no duplication. If content in `campaigns/<name>/program.md` already exists for a specific campaign, the new README links to it rather than duplicating.
4. **No rule-authoritative data**. Both docs are descriptive-only. They MUST NOT redeclare profile IDs, seed sets, or other content that lives in YAML (`data/games/fire-in-the-lake/92-agents.md`) or test files (`FITL_1964_CANARY_SEEDS`). They reference those locations.

## What to Change

### 1. Append a note to `docs/FOUNDATIONS.md`

After Foundation #17 ("Strongly Typed Domain Identifiers"), add a new section:

```markdown
---

## Appendix: Determinism Proofs vs. Profile-Quality Witnesses

The determinism commandment (#8) is proven by the `packages/engine/test/determinism/` corpus: every test there asserts only that identical inputs produce identical outputs (replay identity) and that games terminate within bounded moves (set-membership on `{terminal, maxTurns, noLegalMoves}`). Failures in that corpus are always engine bugs and always block CI.

Convergence claims tied to a specific policy-profile variant — e.g., "the `arvn-evolved` quartet converges on seed 2046 within 300 moves" — are NOT engine invariants. They are quality signals for the profile maintainer. Such claims live in `packages/engine/test/policy-profile-quality/`, not in `determinism/`. Failures there emit `POLICY_PROFILE_QUALITY_REGRESSION` annotations but do not block CI.

The distinction is architectural, not rhetorical: mixing the two into one corpus reintroduces the dual-duty anti-pattern Spec 136 exists to prevent.
```

Do not renumber existing principles.

### 2. Create `campaigns/README.md`

New file covering:

- **Purpose**: what `campaigns/` contains (agent-evolution runs, perf-optimization traces, per-campaign harness scripts).
- **Directory layout**: brief description of each current subdirectory (`fitl-arvn-agent-evolution/`, `fitl-vc-agent-evolution/`, `fitl-perf-optimization/`, `texas-agent-evolution/`, `texas-perf-optimization/`). One line per subdirectory pointing to its `program.md`.
- **Where policy-profile regressions surface** (the core Spec 136 deliverable): reference the `packages/engine/test/policy-profile-quality/` corpus, the `pnpm -F @ludoforge/engine test:policy-profile-quality` lane, and the GitHub Actions PR comment mechanism (the `policy-profile-quality` job in `.github/workflows/engine-determinism.yml` plus the `emit-policy-profile-quality-report.mjs` script). Readers who discover a profile regression during a campaign know where the CI counterpart lives.
- **Profile lifecycle** (brief, per Spec 136 Implementation Direction → Profile lifecycle): evolved profiles are temporary; when one replaces its baseline, the corresponding `fitl-variant-<id>-convergence.test.ts` is renamed in the same change (FOUNDATIONS #14). Link to Spec 136 for the full protocol.
- **Related docs**: link to `docs/FOUNDATIONS.md` (for the determinism/quality distinction), `docs/archival-workflow.md`, and the relevant campaign `program.md` files.

Length target: ~60–100 lines. Descriptive, not prescriptive — leave implementation details to the code and spec.

## Files to Touch

- `docs/FOUNDATIONS.md` (modify — append appendix section)
- `campaigns/README.md` (new)

## Out of Scope

- Editing any individual campaign's `program.md` or `musings.md`.
- Creating documentation inside `packages/engine/` (that belongs in the engine's own README or test infrastructure).
- Updating `docs/architecture.md` or `docs/project-structure.md` — their current entries for `packages/engine/test/` already cover `determinism/`; the new `policy-profile-quality/` directory is descriptive parallel that can be added in a future doc pass if needed. Not required by Spec 136.
- Archiving Spec 136 (happens after all tickets complete, per repo archival policy).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — no regressions (docs changes should be invisible to the build).
2. Manual: read `docs/FOUNDATIONS.md`'s new appendix and confirm the determinism/quality distinction is clearly stated without contradicting existing Foundations #8 or #16.
3. Manual: read `campaigns/README.md` and confirm each subdirectory listed matches what's actually present in `campaigns/`; all referenced paths and commands resolve.
4. `pnpm run check:ticket-deps` — dependency integrity.

### Invariants

1. The new FOUNDATIONS appendix does not renumber or remove any existing numbered principle.
2. `campaigns/README.md` does not duplicate rule-authoritative game data — profile IDs and seed sets are referenced, not redeclared.
3. All file/path references in both documents resolve against the current repo state (no stale paths).

## Test Plan

### New/Modified Tests

No automated tests — documentation only. Accuracy is verified manually against the codebase at review time.

### Commands

1. Verify FOUNDATIONS.md section count unchanged before/after: `grep -c '^## ' docs/FOUNDATIONS.md` (should increase by 1 for the new "Appendix: ..." heading; no other heading changes).
2. Verify all referenced paths in `campaigns/README.md` exist: manually, or via a one-shot markdown-target probe such as `rg -o '/home/joeloverbeck/projects/ludoforge-llm/[^)]+' campaigns/README.md | while read -r path; do [ -e "$path" ] && echo OK "$path" || echo MISS "$path"; done`.
3. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test` — sanity.
4. `pnpm run check:ticket-deps` — dependency integrity.

## Outcome

- Completion date: 2026-04-18
- `ticket corrections applied`: `Ticket 005 already posts variant deltas against main` -> `Ticket 005 posts current-run warning/comment reporting only; baseline-delta comparison is deferred to tickets/136POLPROQUA-007.md`
- Added a FOUNDATIONS appendix distinguishing blocking determinism proofs from non-blocking policy-profile-quality witnesses.
- Added `campaigns/README.md` as the top-level campaign navigation and policy-profile regression entry point, linking contributors to the witness lane, workflow, and reporting script without duplicating rule-authoritative data.
- verification set: `grep -c '^## ' docs/FOUNDATIONS.md`, `rg -o '/home/joeloverbeck/projects/ludoforge-llm/[^)]+' campaigns/README.md | while read -r path; do [ -e "$path" ] && echo OK "$path" || echo MISS "$path"; done`, `pnpm turbo test`, `pnpm turbo typecheck`, `pnpm turbo lint`, `pnpm run check:ticket-deps`
- proof gaps: none
