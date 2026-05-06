# 156PREVOBSUTMET-006: Cookbook documentation for preview observability fields

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — documentation only
**Deps**: `archive/tickets/156PREVOBSUTMET-002.md`, `archive/tickets/156PREVOBSUTMET-003.md`, `archive/tickets/156PREVOBSUTMET-004.md`, `archive/tickets/156PREVOBSUTMET-005.md`

## Problem

Spec 156 introduces five new diagnostic surfaces that operators authoring agent profiles need to read when tuning preview behavior: `previewUsage.readyRefStats`, `previewUsage.utility`, per-candidate `selectionReason`, the verbose-tier `syntheticDecisions[]` array, and inner-frontier `scoreContributions[]`. Without cookbook coverage these fields are discoverable only by reading source. This ticket adds a "Reading the Preview Trace" section to `docs/agent-dsl-cookbook.md` covering what each field means, what values to expect under healthy and degenerate conditions, and how to use them to diagnose Gap 1–6 from `reports/microturn-preview-architectural-gaps-2026-05-06.md`.

The ticket is gated on the four substantive tickets (002–005) so the worked examples reference fields that actually emit in production.

## Assumption Reassessment (2026-05-06)

1. `docs/agent-dsl-cookbook.md` is the canonical operator-facing documentation for agent profile authoring (path confirmed). It already documents preview refs (lines 100–125) and consideration scopes (lines 127–144). The new section sits naturally after the existing preview-refs section.
2. The four substantive tickets (002–005) populate the fields with real values; this ticket documents the populated semantics. Confirming via `Deps` constraint at ticket-decompose time.
3. No code changes — pure documentation. `pnpm turbo lint typecheck test` is unaffected; the only verification is human-readable cookbook accuracy.

## Architecture Check

1. Cookbook coverage of every diagnostic surface is the F#9 (Replay, Telemetry, Auditability) close: telemetry is only useful when consumers know how to read it. Spec 156's value to evolution campaigns and operator tuning depends on this section landing.
2. No game-specific content: documentation describes engine-generic field semantics. Worked examples cite FITL because FITL is the canonical example game in the cookbook, but the field semantics described apply universally.
3. No backwards-compatibility shims (N/A — documentation).

## What to Change

### 1. New section in `docs/agent-dsl-cookbook.md`

Title: "Reading the Preview Trace". Place after the existing "Preview Refs" section (currently around lines 100–125) and before "Retired For New Production Profiles" (which Spec 158 will delete anyway).

Cover:
- **`previewUsage.readyRefStats`** — per-ref distribution of ready candidates' resolved values. Fields: `readyCount`, `distinctValueCount`, `min`, `max`, `range`, `allReadyValuesEqual`. What healthy looks like (`distinctValueCount > 1` for at least one ref). What degenerate looks like (`allReadyValuesEqual: true` on every ref despite high `readyCount`).
- **`previewUsage.utility`** — decision-level classifier with four values. Table mapping each value to "what it means for policy quality":
  - `none`: no candidate ready — preview not contributing.
  - `constant`: every ready candidate projects to identical values for every ref — preview is firing but adding no signal. Common cause: greedy completion picking state-neutral inner options (Gap 3).
  - `lowInformation`: some refs differentiate, others don't — partial signal.
  - `differentiating`: at least one ref's `distinctValueCount > 1` — preview is doing real work.
- **`candidate.selectionReason`** — per-candidate enum with six values. Table: `'gated'` means excluded by the preview budget allocator; `'prior'` is the placeholder pre-Spec-157; the other four are populated by Specs 157 and 159. Cross-link forward.
- **`previewDrive.syntheticDecisions[]`** (verbose-tier) — array of inner-microturn records the driver took. Fields: `depth`, `microturnKind`, `decisionKey`, `selectedOptionStableKey`, `selectionReason`, `score`, `scoreContributions`, `completionPolicy`. Reading worked example: a govern-mode `chooseOne` showing `selectedOptionStableKey: 'aid'` and `selectionReason: 'greedyAlphabetical'` is the smoking gun for Gap 3.
- **Inner-frontier `scoreContributions[]`** — chooseOne / chooseNStep candidate-level breakdown of which considerations matched and contributed how much. Worked example using the existing FITL `preferPatronageMode` consideration.

### 2. Cross-link from existing sections

Add a sentence to "Preview Refs" pointing at the new section: "When tuning preview, read `previewUsage.utility` and `readyRefStats` to confirm the refs are differentiating." Add a sentence to "Considerations" pointing at inner-frontier `scoreContributions` for chooseOne / chooseNStep authoring.

### 3. No examples that contradict deprecation

The new section MUST NOT use `scopes: [completion]` or `option.value` in worked examples — those are deprecated and Spec 158 will remove them. Use the existing `scopes: [move]` examples for action-selection diagnostics; for inner-frontier examples, reference the existing FITL `preferPatronageMode` (still completion-scope today) but mark it explicitly as "completion-scope; Spec 158 will rename to microturn-scope" so future readers aren't misled.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify — new section + cross-links)

## Out of Scope

- Code changes. (Tickets 001–005.)
- Documenting Specs 157, 158, 159, 160 surfaces. (Each spec's own documentation ticket.)
- Migration guidance for retired surfaces. (Spec 158.)

## Acceptance Criteria

### Tests That Must Pass

1. Manual review: cookbook section reads coherently end-to-end; field references match emitted JSON shape from tickets 001–005.
2. Existing engine suite (no regression possible — no code changes): `pnpm -F @ludoforge/engine test`.
3. Existing lint/typecheck (Markdown is not lint-checked but ensure no broken file): `pnpm turbo lint typecheck`.

### Invariants

1. (architectural-invariant) Every field name documented in the new section exists in `Trace.schema.json` (mechanical grep check; can be added to a lint-style test if helpful).
2. (architectural-invariant) No documented worked example references a surface Spec 158 will delete (`scopes: [completion]` standalone usage, `option.value`, `decision.*`, `candidate.param.*`, `preview.phase1`).

## Test Plan

### New/Modified Tests

None (documentation-only). Manual reviewer verifies field coverage against the schema.

### Commands

1. `pnpm turbo lint typecheck`
2. `grep -E "readyRefStats|previewUsage\\.utility|selectionReason|syntheticDecisions" docs/agent-dsl-cookbook.md` — verifies all five fields are mentioned.

## Outcome (2026-05-06)

Owned slice landed in `docs/agent-dsl-cookbook.md`:

- Added "Reading the Preview Trace" after "Preview Refs".
- Documented `previewUsage.readyRefStats`, `previewUsage.utility`, action-selection candidate `selectionReason`, verbose `candidate.previewDrive.syntheticDecisions[]`, and inner-frontier `scoreContributions[]`.
- Added the requested preview-ref cross-link and a considerations-section note pointing trace readers to inner-frontier `scoreContributions[]`.
- Kept examples prose-only and did not add new production YAML using `scopes: [completion]`, `option.value`, `decision.*`, `candidate.param.*`, or `preview.phase1`.

Ticket corrections applied:

- Command reconciliation: the draft shorthand `pnpm turbo lint typecheck` is executed as the repo-valid split lanes `pnpm turbo lint` and `pnpm turbo typecheck`.
- Live trace wording: the current Spec 156 schema uses `completionPolicy: 'greedy' | 'agentGuided'`; later `policyGuided` / fallback semantics remain explicitly forward-looking and out of scope.
- Schema/artifact fallout: documentation-only; `Trace.schema.json` was inspected for the documented field names and no schema artifact regeneration is owned.

Final proof:

1. `grep -E "readyRefStats|previewUsage\\.utility|selectionReason|syntheticDecisions|scoreContributions" docs/agent-dsl-cookbook.md` — passed; all five documented surfaces are present.
2. `grep -E "scopes: \\[completion\\]|option\\.value|decision\\.\\*|candidate\\.param\\.\\*|preview\\.phase1" docs/agent-dsl-cookbook.md` — reviewed; hits are the existing retired-surface warnings plus the new "do not copy" prose note, not new worked YAML examples.
3. `git diff --check -- docs/agent-dsl-cookbook.md tickets/156PREVOBSUTMET-006.md` — passed.
4. `wc -l docs/agent-dsl-cookbook.md` — 636 lines, under repo guidance.
5. `pnpm turbo lint` — passed.
6. `pnpm turbo typecheck` — passed.
7. `pnpm -F @ludoforge/engine test` — passed; default lane summary reported 64/64 files passed.

Late-edit proof validity: after the final proof lanes, this ticket edit only set the already-proven terminal status and transcribed exact proof results. It did not change scope, commands, acceptance criteria, touched files, or documentation content, so the proof lanes above are not invalidated.
