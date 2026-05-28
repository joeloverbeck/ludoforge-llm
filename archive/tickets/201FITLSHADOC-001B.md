# 201FITLSHADOC-001B: Generic preview relationship refs and candidate-feature fallback

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic agent policy compiler/runtime preview surfaces
**Deps**: `archive/tickets/201FITLSHADOC-001.md`

## Problem

Spec 201's shared ally-rival and preview-derived feature design requires two generic engine surfaces that the live code does not provide today:

1. candidate-feature-level `previewFallback.onUnavailable`, so preview-derived candidate features can be explicit Foundation #20 carriers rather than relying on downstream considerations to restate fallback semantics; and
2. preview relationship refs for the active profile relationship role, specifically `preview.relationship.<role>.victoryMargin` and `preview.relationship.<role>.gainValueDelta`.

Ticket 001 proved the relationship preview ref family is absent. During ticket 002 reassessment, the live TypeScript contracts also showed `GameSpecCandidateFeatureDef` only accepts `type` and `expr`, and the compiler strips candidate features to `{ type, costClass, dependencies }`. Authoring raw YAML fallback keys would create an unenforced contract and would not satisfy Spec 201's later compiled-IR witness.

Without this prerequisite, ticket 002 cannot truthfully author `projectedAllyMarginDelta`, ticket 003 cannot truthfully author `allyNearWin`, and ticket 006 cannot prove preview fallback at the compiled candidate-feature seam.

## Assumption Reassessment (2026-05-27)

1. `packages/engine/src/cnl/game-spec-doc.ts` defines `GameSpecCandidateFeatureDef` with only `type` and `expr`; candidate-feature fallback is not currently a typed GameSpecDoc contract.
2. `packages/engine/src/cnl/compile-agents.ts` analyzes feature definitions and records only `type`, `costClass`, `expr`, and dependencies; feature-level preview fallback is neither validated nor emitted in the compiled policy catalog.
3. `reports/201-fitl-metric-availability-survey.md` records that current relationship refs are limited to current-state `relationship.<role>.seat` and `relationship.<role>.gainValue`; no `preview.relationship.*` family exists.
4. The required relationship preview refs are game-agnostic: they derive from the active authored relationship role and existing preview victory/relationship evaluation mechanics, not from FITL-specific seats or module ids.
5. Reassessment after user approval found existing repo-owned FITL candidate features already read preview refs without feature-level fallback (`projectedSelfMargin`, per-seat projected margins, `projectedCapabilityGain`, `projectedSelfRank`, current-leader/threat projections). A strict compiler rule would break the current GameSpecDoc unless this ticket also performs the minimal owned YAML migration.

## Architecture Check

1. Foundation #12: the compiler owns static ref-shape validation and fallback contract validation. Candidate-feature fallback and preview relationship ref parsing must be compiler-visible instead of undocumented YAML.
2. Foundation #20: preview-derived feature unavailable states must be explicit and traceable; silent coercion or raw ignored keys are not acceptable.
3. Foundation #15: the shared doctrine library should use one generic relationship-preview seam instead of forcing four per-profile fallback expressions.
4. Foundation #14: the stricter compiler contract and the owned GameSpecDoc migration land in the same change; no compatibility grace period or ignored fallback key is introduced.
5. Foundation #1: all engine implementation is generic agent policy infrastructure; no Fire in the Lake ids, seats, modules, or metrics are hardcoded in engine code.

## What to Change

### 1. Add candidate-feature preview fallback support

- Extend the GameSpecDoc candidate feature shape to accept `previewFallback`.
- Validate that candidate features containing preview-derived refs declare `previewFallback.onUnavailable`.
- Compile and retain the fallback in the candidate-feature IR so downstream diagnostics and tests can assert it.
- Ensure feature evaluation applies the fallback consistently when the preview-derived expression is unavailable.

### 2. Add preview relationship refs

Add generic parser/lowering/runtime support for:

- `preview.relationship.<role>.victoryMargin`
- `preview.relationship.<role>.gainValueDelta`

The refs must resolve the same relationship role namespace used by current-state `relationship.<role>.seat` / `relationship.<role>.gainValue`, but evaluate against the previewed post-candidate state where one is available.

### 3. Trace and diagnostics

- Preserve Foundation #20 trace visibility when candidate-feature fallback fires.
- Emit a compiler diagnostic for candidate features that reference preview relationship refs or other preview-derived refs without an explicit fallback.
- Reject unknown `preview.relationship.*` fields rather than accepting arbitrary string refs.

### 4. Migrate existing owned GameSpecDocs

- Add `previewFallback.onUnavailable: noContribution` to existing repo-owned candidate features that already read preview-derived refs and should remain compileable under the new rule.
- Keep this migration mechanical and limited to preserving compileability under the new generic contract; do not author the new Spec 201 features owned by ticket 002.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify — typed candidate feature fallback)
- `packages/engine/src/cnl/compile-agents.ts` (modify — validation, dependency/ref parsing, compiled IR)
- `packages/engine/src/cnl/preview-seat-agg-refs.ts` or nearest preview-ref registry (modify — include relationship preview refs if this remains the registry owner)
- `packages/engine/src/agents/policy-evaluation-core.ts` or nearest policy-eval owner (modify — evaluate preview relationship refs/fallback)
- `packages/engine/src/agents/policy-relationship-eval.ts` (modify if relationship role resolution needs a shared helper)
- `data/games/fire-in-the-lake/92-agents.md` (modify — minimal migration for existing preview-derived candidate features only)
- Focused tests under `packages/engine/test/architecture/preview-integrity/` and/or `packages/engine/test/unit/cnl/` (modify/new)

## Out of Scope

- New Spec 201 FITL YAML features in `data/games/fire-in-the-lake/92-agents.md` (owned by ticket 002 after this prerequisite lands).
- Shared strategy modules, profile bindings, and witness suite (owned by tickets 004-006).
- New game-specific relationship semantics or per-game schema files.
- Compatibility aliases for old or malformed ref names.

## Acceptance Criteria

### Tests That Must Pass

1. Candidate features containing preview-derived refs without `previewFallback.onUnavailable` fail compilation with a targeted diagnostic.
2. Candidate features containing preview-derived refs with `previewFallback.onUnavailable: noContribution` compile and retain that fallback in the compiled policy catalog.
3. `preview.relationship.nominalAlly.victoryMargin` and `preview.relationship.nominalAlly.gainValueDelta` compile in a generic fixture with an authored `nominalAlly` relationship.
4. A focused runtime/trace witness proves fallback fires visibly when a relationship preview ref is unavailable.
5. Existing repo-owned GameSpecDocs compile after the stricter rule because existing preview-derived candidate features carry explicit fallback.
6. `pnpm -F @ludoforge/engine build` passes.

### Invariants

1. No FITL-specific identifiers or seat names are hardcoded in engine code.
2. Unknown `preview.relationship.*` suffixes are rejected.
3. Candidate-feature fallback behavior matches Foundation #20: unavailable preview is explicit and traceable, never silently coerced.
4. No backwards-compatibility alias path is introduced.
5. FITL YAML migration is limited to existing candidate-feature fallback annotations; ticket 002 still owns new Spec 201 feature authoring.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-integrity/candidate-feature-previewfallback-required.test.ts` — missing fallback diagnostic and retained compiled fallback.
2. `packages/engine/test/architecture/preview-integrity/preview-relationship-refs.test.ts` — compile/runtime coverage for `preview.relationship.<role>.victoryMargin` and `gainValueDelta`.
3. Existing preview integrity tests updated only if the compiled feature IR shape changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-integrity/candidate-feature-previewfallback-required.test.js dist/test/architecture/preview-integrity/preview-relationship-refs.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm run check:ticket-deps`

## Outcome (2026-05-27)

Completed the generic engine prerequisite for Spec 201:

1. Added typed `previewFallback` support for authored and compiled candidate features, including compiler validation that preview-derived candidate features must declare explicit fallback semantics.
2. Added generic `preview.relationship.<role>.victoryMargin` and `preview.relationship.<role>.gainValueDelta` refs using the existing authored relationship-role namespace.
3. Applied candidate-feature preview fallback at runtime and preserved Foundation #20 trace visibility through `previewFallbackFired` entries with `feature.<id>` term ids.
4. Added focused preview-integrity coverage for missing fallback diagnostics, retained compiled fallback, runtime fallback tracing, relationship preview ref lowering, and unknown relationship-preview field rejection.
5. Mechanically migrated existing Fire in the Lake preview-derived candidate features to `previewFallback.onUnavailable: noContribution` without authoring the new Spec 201 features owned by ticket 002.
6. Updated the existing preview authoring unit fixture so its preview-derived candidate features satisfy the stricter explicit-fallback contract.

User-approved source-size deferral:

The final sweep found preexisting oversized TypeScript files with active growth. The user approved bounded deferral on 2026-05-27 because these are established compiler/runtime/type/test hubs and the retained additions are adjacent contract branches; extracting them for this ticket would widen or obscure the prerequisite seam. Residual extraction owner: none for this slice.

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `packages/engine/src/cnl/compile-agents.ts` | 5961 | 6108 | no; preexisting oversize | +147 | User-approved bounded deferral; parser, validation, and preview-ref collection logic sits beside existing agent CNL ref lowering. | none |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 3007 | 3083 | no; preexisting oversize | +76 | User-approved bounded deferral; runtime fallback and preview relationship evaluation are adjacent to existing policy ref evaluation. | none |
| `packages/engine/src/cnl/game-spec-doc.ts` | 1109 | 1110 | no; preexisting oversize | +1 | User-approved bounded deferral; single type-field addition belongs in the canonical GameSpecDoc contract hub. | none |
| `packages/engine/src/kernel/types-core.ts` | 2971 | 2978 | no; preexisting oversize | +7 | User-approved bounded deferral; compiled IR type additions belong in the canonical kernel type hub. | none |
| `packages/engine/test/unit/compile-agents-authoring.test.ts` | 3304 | 3308 | no; preexisting oversize | +4 | User-approved bounded deferral; fixture annotations preserve the existing authoring test under the stricter contract. | none |

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-integrity/candidate-feature-previewfallback-required.test.js dist/test/architecture/preview-integrity/preview-relationship-refs.test.js` — passed, 5 tests.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/compile-agents-authoring.test.js` — passed, 56 tests.
4. `pnpm -F @ludoforge/engine test:unit` — passed, 657 tests.

Post-review correction:

1. Corrected the migration wording from preserving current preview-coalesce semantics to preserving compileability under the stricter explicit-fallback contract.
