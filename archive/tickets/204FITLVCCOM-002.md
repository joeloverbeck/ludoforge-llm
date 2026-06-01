# 204FITLVCCOM-002: P0b — Agitation action-tag investigation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — investigation only
**Deps**: `specs/204-fitl-vc-completion.md`

## Problem

Spec 204 §4.1 proposes a `vc.agitationPrep` plan template whose `root.actionTags` is unresolved: VC Agitation is a Coup-phase action in FITL rules, not a card-phase Operation, so the engine may publish no Agitation action tag during card-phase preparation. The template can only be authored if such a tag exists; otherwise the doctrine routes entirely through `vc.rallyTax` / `vc.marchSpread` / `vc.terrorTax`-rebinding under the `vc.agitationReadiness` strategy module's `enablesPlanTemplates`.

Without resolving this, ticket 004 (P1 plan templates) cannot author `vc.agitationPrep`. Spec §5 and §6 P0b both flag this as the blocking decision.

## Assumption Reassessment (2026-06-01)

1. Spec 204 §4.1 (lines 168-178) authors `vc.agitationPrep` with `root.actionTags: [<P0b-resolved>]` and notes "P0b decides the action tag." Investigation must reach a binary outcome: tag exists (author the template) OR tag doesn't exist (drop the template + update §4.3's `vc.agitationReadiness.enablesPlanTemplates`).
2. The Coup phase in FITL is modeled in the kernel as a distinct phase resolution — investigate whether any card-phase action tag corresponds to "preparing for Agitation" or whether the Agitation operation is purely emitted from Coup-phase resolution.
3. Existing FITL action tags include `rally`, `march`, `terror`, `tax`, `subvert`, `attack`, `ambush-vc`, `ambush-nva`, `train`, `patrol`, `sweep`, `assault`, `transport`, `govern`, `raid`, `advise`, `air-strike`, `air-lift`, `infiltrate`, `bombard`, `event-play` (per existing authored templates in `data/games/fire-in-the-lake/92-agents.md`). `agitation` is NOT in this list — confirm via grep before recording the negative finding.

## Architecture Check

1. **F1 (Engine Agnosticism)** — the action-tag inventory is GameSpecDoc-authored; the engine reads tags from compiled GameDef without hardcoded faction knowledge. The investigation queries existing authored data, not engine internals.
2. **F2 (Evolution-First)** — if the tag doesn't exist today, this ticket does NOT propose adding one. Either a tag is already authored (in which case the spec author missed it) or the deliverable collapses to existing tags (rally/tax/march) under the doctrine module. Adding a new tag would be a separate FITL data-authoring spec.
3. **F15 (Architectural Completeness)** — close the spec's open question with a binary decision; document the resolution path so future readers see why `vc.agitationPrep` was (or wasn't) authored.
4. **No backwards-compatibility shims** — if the tag doesn't exist, the spec §4.1 and §4.3 are corrected to drop the template; no placeholder template is left in the spec.

## What to Change

### 1. Investigate the FITL action-tag inventory

Grep `data/games/fire-in-the-lake/` for `agitation` (case-insensitive) and adjacent variants (`agitate`, `agitating`, `coupPrep`, etc.). Cross-check the FITL rules documentation under `data/games/fire-in-the-lake/` (e.g., `91-rules.md` or similar) for whether Agitation is published as a separate Operation tag at any phase boundary.

```bash
grep -rni 'agitat' data/games/fire-in-the-lake/
grep -rni 'agitat' packages/engine/src/  # sanity-check engine doesn't hardcode it
```

### 2. Decide and record

Two outcomes:

**Outcome A — Agitation tag exists**: record the tag name in spec §11. Ticket 004 authors `vc.agitationPrep` with `root.actionTags: [<resolved-tag>]`. Spec §4.3 `vc.agitationReadiness.enablesPlanTemplates` includes `vc.agitationPrep` (no change from current spec).

**Outcome B — Agitation is purely Coup-phase resolution, no card-phase tag**: record the negative finding in spec §11. Update spec §4.1 to remove the `vc.agitationPrep` stanza. Update spec §4.3's `vc.agitationReadiness.enablesPlanTemplates` to drop `vc.agitationPrep` (the remaining entries `vc.rallyTax` and `vc.marchSpread` carry the doctrine). Update spec §1 goal list and §6 P1 acceptance to reflect the drop.

### 3. Cross-section spec updates (if Outcome B)

Per the spec's cascading-corrections discipline: `vc.agitationPrep` is referenced in spec §1 (goal list), §4.1 (stanza), §4.3 (`vc.agitationReadiness.enablesPlanTemplates`), §4.4 (posture attachment list mentions it), §4.6 (bindings comment), §6 P1 (acceptance criterion), §7 (witness `vc-agitation-prep-before-coup.test.ts` should mention "or the remaining two if dropped"), §11 (open question). Grep the spec for `vc.agitationPrep` and update every occurrence under Outcome B.

## Files to Touch

- `specs/204-fitl-vc-completion.md` (modify — §11 records the decision; if Outcome B, also §1, §4.1, §4.3, §4.4, §4.6, §6, §7).

Read-only references for the investigation:
- `data/games/fire-in-the-lake/91-rules.md` (or equivalent FITL rules file — locate via `ls data/games/fire-in-the-lake/`)
- `data/games/fire-in-the-lake/92-agents.md` (action-tag inventory in existing templates)
- `packages/engine/src/` (engine-side action-tag handling; sanity-check)

## Out of Scope

- No YAML authoring — outcome may shrink ticket 004's scope, but no `92-agents.md` edits land here.
- No new action tag introduction — if Outcome B, adding a new `agitation` tag would be a separate FITL data-authoring spec.
- No changes to ticket 001's audit table (P0a vocab resolution is independent).
- **Same-file collision with ticket 001**: both modify `specs/204-fitl-vc-completion.md` §11. Recommend serializing — 001 first, then 002.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` succeeds (sanity).
2. `pnpm run check:ticket-deps` succeeds.

### Invariants

1. The outcome (A or B) is recorded explicitly in spec §11 with a citation to the grep evidence.
2. Under Outcome B, every `vc.agitationPrep` reference in the spec is either removed or annotated as "dropped per 204FITLVCCOM-002 (YYYY-MM-DD)". A grep for `vc.agitationPrep` after this ticket lands returns either zero matches (clean removal) or only annotated historical references.
3. Spec §4.3's `vc.agitationReadiness.enablesPlanTemplates` list remains non-empty under either outcome (other templates carry the doctrine).

## Test Plan

### New/Modified Tests

- None — investigation ticket.

### Commands

1. `grep -rni 'agitat' data/games/fire-in-the-lake/` — locate any existing Agitation tag.
2. `grep -nF 'vc.agitationPrep' specs/204-fitl-vc-completion.md` — enumerate occurrences for cascading updates under Outcome B.
3. `pnpm run check:ticket-deps` — validates this ticket's Deps field.
4. `pnpm -F @ludoforge/engine build` — sanity.

## Outcome

**Completed**: 2026-06-01

**What changed**:
- Recorded Outcome A in `specs/204-fitl-vc-completion.md` §11: the resolved action tag is `agitate`.
- Updated Spec 204's `vc.agitationPrep` examples and acceptance prose to use `root.actionTags: [agitate]` and step `actionTag: agitate`.
- Clarified that `agitate` is published by the authored `coupAgitateVC` action during `phase: [coupSupport]`; card-phase preparation remains encoded by `vc.rallyTax`, `vc.marchSpread`, and `vc.terrorTax` under the future `vc.agitationReadiness` doctrine.
- Post-review cleanup clarified `archive/tickets/204FITLVCCOM-004.md` so its template instructions consume the resolved `agitate` tag directly instead of treating `vc.agitationPrep` as conditional.

**Evidence**:
- `rg -n -i 'agitat|agitate|coupPrep|coup prep|prepare.*coup|coup.*prepare' data/games/fire-in-the-lake packages/engine/src` found `data/games/fire-in-the-lake/30-rules-actions.md` `coupAgitateVC` with `tags: [agitate]` and `phase: [coupSupport]`.
- `rg -n "actionTags: \\[(agitate|coupAgitateVC)|specialTags: \\[(agitate|coupAgitateVC)|actionTag: (agitate|coupAgitateVC)|tags: \\[(agitate|coupAgitateVC)" data/games/fire-in-the-lake/92-agents.md data/games/fire-in-the-lake/30-rules-actions.md` found only the authored `tags: [agitate]` action and no existing agent template binding.
- The same grep over `packages/engine/src` found no engine-side hardcoded Agitation tag.

**Deviations from plan**:
- The ticket expected a likely negative case, but live data proved a valid authored `agitate` tag exists. Outcome B cleanup was not applied.

**Verification**:
- `pnpm run check:ticket-deps` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `git diff --check -- specs/204-fitl-vc-completion.md` — passed.
- `rg -n "<P0b|pending P0b|conditionally included|if P0b drops|when authored" specs/204-fitl-vc-completion.md` — no matches.

**Terminal closeout**:
- Ticket graph/status integrity: `pnpm run check:ticket-deps` passed before terminal status.
- Source-size decision: not triggered; markdown-only edit.
- Untracked/touched-file hygiene: worktree contained only `specs/204-fitl-vc-completion.md` before this Outcome edit; whitespace check passed for the spec edit.
- Proof lane classification: required lanes green; no red or substituted lanes.
- Terminal status allowed: the Outcome A decision is recorded with grep evidence, and Outcome B-only `vc.agitationPrep` removal was not triggered.
