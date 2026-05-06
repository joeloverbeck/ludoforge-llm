# 156PREVOBSUTMET-001: Trace schema and type plumbing for preview observability

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/schemas/Trace.schema.json`, `packages/engine/src/agents/policy-eval.ts`, `policy-agent.ts`, fixture/replay JSON files
**Deps**: `specs/156-preview-observability-and-utility-metrics.md`

## Problem

Spec 156 layers new trace surfaces (`readyRefStats`, `utility`, `selectionReason`, inner-frontier `scoreContributions`, and the later nested `previewDrive.syntheticDecisions` trace) on top of the existing preview trace. Tickets 002, 003, and 005 populate the fields this ticket adds with real data, but they cannot land independently if the schema, the TypeScript types, and the empty-defaults are not in place first. This ticket lands the structural foundation that fits the live trace contract: schema additions with required new fields, type exports updated, `emptyPreviewUsage` extended with safe-empty defaults, and existing fixture/replay JSON re-blessed under the new schema. No behavior changes. Ticket 004 owns the coherent nested `previewDrive.syntheticDecisions` trace migration rather than this ticket adding a parallel flat or half-nested shape.

## Assumption Reassessment (2026-05-06)

1. Canonical metadata types are defined in `packages/engine/src/agents/policy-eval.ts` (lines 97, 132, 148), not `policy-evaluation-core.ts` as Spec 156's "Files to Touch" listed. Tickets in this series use `policy-eval.ts` paths. Confirmed via `grep -nE "^export (type|interface) Policy(Evaluation)" packages/engine/src/agents/*.ts`.
2. `emptyPreviewUsage` is defined twice (`policy-agent.ts:136` and `policy-eval.ts:?`) — both must be updated together. Confirmed via `grep -n emptyPreviewUsage packages/engine/src/agents/`.
3. Trace.schema.json defines `previewUsage` (line ~3538), per-candidate trace (line ~3777), and `outcomeBreakdown` (sub-object). The ticket-001 fields are additive; parent `required` arrays gain the new field names. No removed fields.
4. There is no `packages/engine/test/golden/` directory. Golden tests in this repo use the `*-golden.test.ts` naming convention under `packages/engine/test/integration/` or `packages/engine/test/e2e/`. Spec 156's path references are corrected accordingly in this ticket and downstream.
5. Existing fixtures with `previewUsage` payloads live under `packages/engine/test/fixtures/trace/` and inline within integration test files. Re-bless covers both.

## Architecture Check

1. The schema-first approach is the cleanest landing pad: every later ticket emits new field values against a stable contract, and the fixture re-bless cost is paid once at the bottom of the dependency graph rather than spread across four parallel tickets. Alternatives (per-ticket schema additions; making fields optional and tightening later) trade short-term diff size for long-term coordination cost and would each violate F#14 (no compatibility shims — required-with-defaults is the F#14-compliant shape, optional-fields-then-tighten is not).
2. All five additions are runtime trace data only. No GameSpecDoc field changes, no compiler validator changes, no engine kernel changes. The `RefId` keys in `readyRefStats` are the same generic ref strings the existing `previewUsage.refIds` array already carries — no game-specific identifiers leak.
3. No backwards-compatibility shims. New fields are required, populated with safe-empty defaults at emit time when no real value is available (`utility: 'none'` when no candidate is ready; `readyRefStats: {}` when no preview refs requested; `selectionReason: 'gated'` as the interim default). Re-blessed fixtures lock the new shape.
4. Foundations reset (2026-05-06): the live trace contract has flat `previewDriveDepth` and `previewCompletionPolicy` fields, not a nested `previewDrive` object. Adding `syntheticDecisions` in this ticket would either create a parallel flat trace shape or force a larger nested preview-drive migration. To keep F#14 and F#15 alignment, ticket 004 owns the nested `previewDrive.syntheticDecisions` migration as one coherent contract change.

## What to Change

### 1. Schema — `packages/engine/schemas/Trace.schema.json`

Extend the `previewUsage` object schema with required fields:
- `readyRefStats`: object keyed by ref id (string), each value an object with required fields `readyCount` (integer ≥ 0), `distinctValueCount` (integer ≥ 0), `min` (integer or null), `max` (integer or null), `range` (integer or null), `allReadyValuesEqual` (boolean).
- `utility`: enum `["none", "constant", "lowInformation", "differentiating"]`.

Extend the per-candidate trace object schema with a required field:
- `selectionReason`: enum `["coverage", "prior", "shallowDelta", "widening", "cache", "gated"]`. (Tickets 002–005 / Specs 157–159 populate the non-gated values; this ticket only adds the field to the schema.)

Extend the inner-frontier candidate trace shape (the chooseOne/chooseNStep candidate trace, currently lacking `scoreContributions`) to require `scoreContributions: ScoreContribution[]` mirroring the action-selection candidate trace. Default empty array when no consideration fired.

Update every `required` array in the schema where these fields are added.

### 2. TypeScript types — `packages/engine/src/agents/policy-eval.ts`

Mirror schema additions in the exported types:
- Extend `PolicyEvaluationPreviewUsage` interface with `readyRefStats: Readonly<Record<string, ReadyRefStats>>` and `utility: 'none' | 'constant' | 'lowInformation' | 'differentiating'`.
- Add new exported `ReadyRefStats` interface.
- Extend `PolicyEvaluationCandidateMetadata` with `selectionReason: SelectionReason` (new exported union). Reserve enumerators `'coverage' | 'prior' | 'shallowDelta' | 'widening' | 'cache' | 'gated'` even though only `'gated'` is populated this ticket.

Export const arrays for downstream test enumeration:
- `PREVIEW_UTILITY_VALUES = ['none', 'constant', 'lowInformation', 'differentiating'] as const`
- `SELECTION_REASONS = ['coverage', 'prior', 'shallowDelta', 'widening', 'cache', 'gated'] as const`

### 3. Default-empty wiring — `packages/engine/src/agents/policy-agent.ts`, `policy-eval.ts`

Update both `emptyPreviewUsage()` definitions (`policy-agent.ts:136` and the analogous site in `policy-eval.ts`) to include `readyRefStats: {}` and `utility: 'none'`. No real-value population yet; ticket 002 wires the actual aggregation.

Update `traceCandidatesForFrontier` (`policy-agent.ts:62-75`) and the action-selection candidate trace emitters in `policy-eval.ts` to set `selectionReason: 'gated'` for the placeholder default at the schema level. Real-value population for non-gated candidates comes from ticket 003.

### 4. Fixture re-bless — `packages/engine/test/fixtures/trace/**`, inline trace JSON in integration tests

Mechanical regeneration of every fixture/replay containing a `previewUsage` payload:
- Add `readyRefStats: {}` and `utility: 'none'` (safe defaults) to every previewUsage object.
- Add `selectionReason: 'gated'` to every candidate trace object.
- Add `scoreContributions: []` to every inner-frontier candidate trace lacking the field.

Record the updated fixture paths in this ticket's outcome. If this work is later committed, include `Re-bless golden trace: <each updated file> - Spec 156 ticket 001 trace plumbing` in the commit body.

### 5. Schema-parity test — `packages/engine/test/unit/trace/policy-trace-shape.test.ts` (modify or create)

Ajv-validate every emitted trace against the updated `Trace.schema.json`. Catch any code path that emits a previewUsage without the new fields.

## Files to Touch

- `packages/engine/schemas/Trace.schema.json` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify — type exports + emptyPreviewUsage)
- `packages/engine/src/agents/policy-agent.ts` (modify — emptyPreviewUsage + traceCandidatesForFrontier scaffold)
- `packages/engine/test/fixtures/trace/**` (modify — re-bless)
- `packages/engine/test/integration/**` (modify — inline trace JSON re-bless)
- `packages/engine/test/e2e/fitl-tooltip-golden.test.ts` (modify — if it carries previewUsage payloads)
- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify — if it carries previewUsage payloads)
- `packages/engine/test/unit/trace/policy-trace-shape.test.ts` (new or modify — schema-parity test)

## Out of Scope

- Computing `readyRefStats` or `utility` from real candidate data. (Ticket 002.)
- Populating `selectionReason` with non-gated values. (Ticket 003 for `'gated'` parity; Spec 157 for `'coverage' | 'prior' | 'widening'`; Spec 159 for `'fallback'`.)
- Schema/type plumbing and population for nested `previewDrive.syntheticDecisions`. (Ticket 004 owns the coherent nested preview-drive migration.)
- Returning real `scoreContributions` from `selectBestCompletionChooseOneValue`. (Ticket 005.)
- Cookbook documentation. (Ticket 006.)
- Renaming `agentGuided` → `policyGuided` in trace fields (Spec 159).

## Acceptance Criteria

### Tests That Must Pass

1. New: schema-parity test asserts every emitted trace conforms to the updated `Trace.schema.json` via Ajv (`pnpm -F @ludoforge/engine test:unit -- trace/policy-trace-shape`).
2. New: type-export regression — `PREVIEW_UTILITY_VALUES.length === 4`; `SELECTION_REASONS.length === 6`.
3. Existing engine suite passes with re-blessed fixtures: `pnpm -F @ludoforge/engine test`.
4. Existing typecheck: `pnpm turbo typecheck`.
5. Existing schema artifact build: `pnpm turbo schema:artifacts`.

### Invariants

1. (architectural-invariant) Every `previewUsage` payload contains `readyRefStats` and `utility` fields (Ajv-enforced).
2. (architectural-invariant) Every candidate trace (action-selection or inner-frontier) contains `selectionReason` (Ajv-enforced).
3. (architectural-invariant) `PREVIEW_UTILITY_VALUES` and `SELECTION_REASONS` exports match the schema enums verbatim.
4. (golden-trace) Re-blessed fixtures re-emit byte-identical JSON across two runs (replay-identity unchanged).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/trace/policy-trace-shape.test.ts` (new or modify) — `architectural-invariant`. Ajv-validates the trace schema and the const-array exports against the schema enums.
2. Existing fixture-consuming tests under `packages/engine/test/integration/` and `packages/engine/test/e2e/` — re-blessed; no test-logic changes.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- trace/policy-trace-shape`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo lint typecheck test`

## Outcome (2026-05-06)

Implemented the ticket-001 trace plumbing boundary after a Foundations-driven reset:

- Added required `previewUsage.readyRefStats` and `previewUsage.utility` to the canonical trace schema source, generated `Trace.schema.json`, kernel trace types, policy evaluation metadata, and both empty-preview defaults.
- Added exported `ReadyRefStats`, `PREVIEW_UTILITY_VALUES`, `SELECTION_REASONS`, and `SelectionReason` in `policy-eval.ts`.
- Added required candidate `selectionReason` plus required candidate `scoreContributions`, `previewRefIds`, and `unknownPreviewRefs` to the trace contract; current ticket-001 emitters use the safe default `selectionReason: 'gated'`.
- Re-blessed preview-usage fixtures in `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` and `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json`.
- Updated inline policy trace fixtures in engine schema/diagnostics tests and the runner console-trace subscriber test.
- Added `packages/engine/test/unit/trace/policy-trace-shape.test.ts`, which checks enum parity against `Trace.schema.json` and Ajv-validates emitted safe-empty preview usage/candidate objects.

Semantic correction: ticket 001 intentionally does not add `SyntheticDecisionTraceEntry` or `candidate.previewDrive.syntheticDecisions`. The live trace contract has flat `previewDriveDepth` / `previewCompletionPolicy`; ticket 004 now owns a coherent nested preview-drive migration so the repo does not carry parallel preview-drive contracts.

Proof:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts` — passed; only `Trace.schema.json` changed semantically.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/trace/policy-trace-shape.test.js` — passed after the final root typecheck rebuild.
- `pnpm -F @ludoforge/engine typecheck` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed after final rebuild.
- `pnpm -F @ludoforge/engine test:unit` — passed.
- `pnpm -F @ludoforge/engine test` — passed.
- `pnpm turbo typecheck` — failed once on owned runner fixture fallout, then passed after adding the new required preview defaults to `packages/runner/test/trace/console-trace-subscriber.test.ts`.
- `pnpm turbo schema:artifacts` — passed.
- `pnpm -F @ludoforge/runner test -- trace/console-trace-subscriber` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo test` — passed.
- `pnpm run check:ticket-deps` — passed for 6 active tickets and 2242 archived tickets.

No-invalidation note: the final status/outcome edit is transcription-only; it records the completed proof and does not change code, schema, command semantics, scope, dependency ownership, or acceptance criteria.
