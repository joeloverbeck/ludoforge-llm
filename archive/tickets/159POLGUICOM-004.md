# 159POLGUICOM-004: Cookbook update for `policyGuided` and fallback diagnostics

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — docs only
**Deps**: `archive/tickets/159POLGUICOM-002.md`

## Problem

After tickets 001-002 land, the engine surfaces `policyGuided` as the named completion policy and emits new trace fields (`completionPolicy: 'fallback'`, `previewUsage.completionPolicyFallbackCount`) that operators can use to diagnose "is policyGuided actually firing on my profile?". The cookbook (`docs/agent-dsl-cookbook.md`) still references `agentGuided` at line 193 and does not document the `fallbackCompletionPolicy` knob or the new diagnostic surfaces. This ticket updates the cookbook to match the post-Phase-A engine state — operator-facing documentation must lead, not lag, the schema.

## Assumption Reassessment (2026-05-06)

1. `docs/agent-dsl-cookbook.md` line 193 currently reads (within a table):
   `| `completionPolicy` | Completion policy used by the drive, currently `greedy` or `agentGuided`. |`
   After this ticket, it reads `greedy` or `policyGuided` (or `fallback` for the runtime trace value, when documenting the trace surface). Verified during reassessment of spec 159.
2. The cookbook does not yet document `fallbackCompletionPolicy` (the new config field added by ticket 002) or `completionPolicyFallbackCount` (the new aggregate added by ticket 002). Both are operator-visible diagnostics that warrant cookbook coverage.
3. The cookbook's existing "preview" section is the natural home for the fallback-config documentation; the trace-table surface is the natural home for `completionPolicyFallbackCount`.
4. No engine code is touched by this ticket — pure documentation. The Engine Changes field reads `None — docs only`.
5. Tickets 001-002 must land before this one — the cookbook documents fields that exist post-002.

## Architecture Check

1. **Why this approach is cleaner than alternatives.** Documenting the new policy name and diagnostic surfaces in the cookbook closes the operator-facing half of the F#15 architectural completeness goal — the runtime contract is correct after 001-002, but the cookbook is the canonical operator entry point. Lagging documentation undermines F#15 even when runtime is sound.
2. **GameSpecDoc vs runtime boundary.** Pure docs change. No engine code is modified.
3. **No backwards-compatibility shims.** The cookbook is updated wholesale to match the post-Phase-A surface — no "during the transition" disclaimers, no "formerly known as" references. F#14 strict.

## What to Change

### 1. Rename `agentGuided` references — `docs/agent-dsl-cookbook.md`

Line 193 (the trace-table cell) and any other prose references to `agentGuided` are updated to `policyGuided`. Run `grep -n agentGuided docs/agent-dsl-cookbook.md` during implementation to enumerate every occurrence; expect line 193 plus any prose elsewhere.

### 2. Document `policyGuided` semantics in the preview section

In the cookbook's "preview" section (locate during implementation), add or refresh the description of the two policy values:
- `greedy`: fast, non-discriminating (alphabetical-by-canonical-key); useful as a baseline or fallback. Deterministic but adversarial.
- `policyGuided`: scores synthetic options at each inner microturn using the same policy considerations that score real decisions. Requires at least one consideration with `scopes: [microturn]` on the profile (otherwise the build emits a warning per ticket 003 and runtime always falls back).

### 3. Document `fallbackCompletionPolicy` config

Add a new sub-section (or extend the existing preview section) describing the operator-authorable knob:
- `fallbackCompletionPolicy: 'greedy'` (default): when `policyGuided`'s evaluator returns undefined for an inner microturn, fall back to greedy. The fallback firing is recorded in the trace.
- `fallbackCompletionPolicy: 'fail'`: when `policyGuided`'s evaluator returns undefined, abort the preview drive with `previewOutcome: noPreviewDecision`. Useful for diagnostic profiles that want a loud failure.
- The field is meaningful only when `completion === 'policyGuided'`; the compiler rejects it set under `greedy`.

### 4. Document the trace diagnostics

Update the synthetic-decision and `previewUsage` trace tables to document:
- `completionPolicy` value `'fallback'` (when the fallback path fired) — the third value alongside `'greedy'` and `'policyGuided'`.
- `selectionReason: 'fallback'` — the synthetic-decision-entry value that flags a fallback firing.
- `previewUsage.completionPolicyFallbackCount: integer` — the aggregate count of fallback firings across all candidates in the decision. Document the diagnostic question this answers: "is policyGuided actually firing on my profile?" — non-zero counts indicate the evaluator could not decide and the configured fallback fired.

### 5. Verify after edits

After applying the edits:
- `grep -n agentGuided docs/agent-dsl-cookbook.md` returns zero matches.
- `grep -n policyGuided docs/agent-dsl-cookbook.md` returns at least the locations updated above.
- `grep -n completionPolicyFallbackCount docs/agent-dsl-cookbook.md` returns at least one match (the trace-table documentation).
- `grep -n fallbackCompletionPolicy docs/agent-dsl-cookbook.md` returns at least one match (the config documentation).

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify — rename `agentGuided` → `policyGuided`; document `fallbackCompletionPolicy` config; document `completionPolicyFallbackCount` and `selectionReason: 'fallback'` trace surfaces)

## Out of Scope

- Engine code or test changes — this ticket is documentation-only.
- Documenting the compile-time warning from ticket 003 — that's an authoring-time signal, distinct from the cookbook's runtime/diagnostic focus. The warning's text is self-explanatory at the diagnostic site; cookbook coverage is not required for it. (Reconsider during implementation if the user prefers an explicit cookbook callout for the warning — this can be a follow-up edit.)
- Reassessing the cookbook's broader structure or other unrelated content.

## Acceptance Criteria

### Tests That Must Pass

1. `grep -n agentGuided docs/agent-dsl-cookbook.md` returns zero matches.
2. `grep -n policyGuided docs/agent-dsl-cookbook.md` returns matches in the preview section and the trace table.
3. `grep -n completionPolicyFallbackCount docs/agent-dsl-cookbook.md` returns at least one match.
4. `grep -n fallbackCompletionPolicy docs/agent-dsl-cookbook.md` returns at least one match.
5. Existing engine and runner suites are unaffected (no code changes): `pnpm turbo lint typecheck test`.

### Invariants

1. (architectural-invariant) The cookbook's `completionPolicy` documentation enumerates `greedy`, `policyGuided`, and `fallback` (the third for trace surfaces only) — not `agentGuided`.

## Test Plan

### New/Modified Tests

1. None — pure documentation change. Verification via the `grep` assertions in Acceptance Criteria.

### Commands

1. `grep -n agentGuided docs/agent-dsl-cookbook.md` (expect zero matches)
2. `grep -n -E 'policyGuided|fallbackCompletionPolicy|completionPolicyFallbackCount' docs/agent-dsl-cookbook.md` (expect matches in updated locations)
3. `pnpm turbo lint typecheck test` (sanity — no code changes, suite should still pass)

## Outcome

Completed: 2026-05-06.

- Updated `docs/agent-dsl-cookbook.md` to replace the stale `agentGuided` trace-table wording with the live `policyGuided` / `fallback` trace contract.
- Documented `fallbackCompletionPolicy: greedy` and `fallbackCompletionPolicy: fail` in the preview profile configuration section, including the compiler restriction that the field is meaningful only with `completion: policyGuided`.
- Documented `previewUsage.completionPolicyFallbackCount` as the aggregate diagnostic for whether policy-guided completion is actually selecting inner microturns or falling back.
- No engine, schema, fixture, or generated artifacts changed; archived tickets 001-003 already own the runtime, schema, and compile-time-warning surfaces.

Verification:

- `rg -n '\bagentGuided\b' docs/agent-dsl-cookbook.md` — passed; zero matches. `rg` returned exit code 1, which is the expected empty-result pass condition.
- `rg -n 'policyGuided|fallbackCompletionPolicy|completionPolicyFallbackCount' docs/agent-dsl-cookbook.md` — passed; matches appeared in the aggregate diagnostic, synthetic-decision trace table, gap diagnosis map, and preview config guidance.
- `pnpm turbo lint typecheck test` — passed; 9/9 tasks successful.
- `pnpm run check:ticket-deps` — passed; ticket dependency integrity check passed for 1 active ticket and 2256 archived tickets.

Late-edit proof validity: after final proof, ticket edits only set terminal status and transcribed the exact proof/dependency-check results. They did not change documentation scope, acceptance criteria, command semantics, touched-file ownership, follow-up ownership, engine behavior, generated artifacts, or dependency edges, so the proof lanes remain valid.
