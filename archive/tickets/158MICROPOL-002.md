# 158MICROPOL-002: Architectural-invariant tests for microturn scope

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/158MICROPOL-001.md`

## Problem

Ticket 001 lands the F#14 atomic cut migrating `scopes: [completion]` → `scopes: [microturn]`. The new contract needs explicit architectural-invariant tests to lock in: the per-option microturn evaluator's scoring shape across all ten ref kinds, cross-scope ref rejection at compile time, IR/bytecode shape per microturn ref kind, F#14 grep enforcement (no completion-scope references survive in source or data), and a convergence-witness equivalence proof for the migration on the FITL `preferPatronageMode` fixture. Without these tests, future drift could silently re-introduce retired surfaces or break per-ref evaluation.

## Assumption Reassessment (2026-05-06)

1. **Ticket 001 has landed** before this ticket starts — the new microturn evaluator pair, scope enum, ten ref kinds, and updated schema must exist before tests can reference them.
2. **`preferPatronageMode` is not committed in `data/games/fire-in-the-lake/`** — confirmed; it lives in campaign experiment artifacts only (`campaigns/lessons-global.jsonl`, `campaigns/fitl-arvn-agent-evolution/results.tsv`). The convergence-witness test must author both the completion-scope baseline (as documentation only — runtime evaluator is deleted) AND the microturn-scope rewrite as inline test fixtures.
3. **Empirical baseline behavior** captured from prior campaigns: `preferPatronageMode` (weight 10) flipped 4/4 govern-mode chooseOnes from `aid` to `patronage` (per `campaigns/lessons-global.jsonl` exp-003 + restart exp-001). The convergence-witness asserts the new microturn-scope evaluator reproduces this captured expected-output sequence on a fixed FITL seed.
4. **Test path convention** is `packages/engine/test/unit/agents/...` and `packages/engine/test/unit/cnl/...` — confirmed.
5. **Test-class taxonomy** per `.claude/rules/testing.md` — four files are `architectural-invariant`; the migration-equivalence test is `convergence-witness` with a documented `@witness:` id.
6. **Foundations-aligned F#14 grep boundary corrected after reassessment** — F#14 forbids supported compatibility shims, alias runtime paths, authored/serialized retired contracts, and executable completion-scope evaluator surfaces. It does **not** forbid compiler diagnostics or tests from naming a removed surface while rejecting it. Therefore `no-completion-scope-references.test.ts` must enforce semantic absence of the retired runtime/authoring contract and allow migration-diagnostic strings that reject `completion` and point to `microturn`.

## Architecture Check

1. **All five new tests are architectural invariants or one explicit convergence witness** — none are trajectory-pinned witnesses without justification. Each invariant test asserts a property over the new microturn surface that any legitimate kernel evolution must satisfy; the witness test guards a specific empirical outcome (`preferPatronageMode` migration equivalence).
2. **Engine-agnosticism preserved** — `microturn-option-evaluator.test.ts`, `microturn-scope-validation.test.ts`, and `compile-microturn-refs.test.ts` use non-FITL fixtures to verify the evaluator is engine-generic (F#1). The convergence-witness test is FITL-specific by design and explicitly classified `convergence-witness` with witness id `spec-158-completion-to-microturn-equivalence`.
3. **F#14 enforcement is a test, not a runtime guard** — the no-completion-scope grep test runs as an architectural invariant, ensuring future drift cannot reintroduce retired surfaces in source or production data.

## What to Change

### 1. Per-option scoring core test

`packages/engine/test/unit/agents/microturn-option-evaluator.test.ts` (new) — `architectural-invariant`. Verifies per-option scoring across all ten ref kinds. For each ref kind (`microturn.kind`, `decisionKey`, `actorSeat`, `option.value`, `option.index`, `option.stableKey`, `option.tags`, `option.targetKind`, `remainingRequiredCount`, `remainingMaxCount`), asserts that a single-consideration profile with that ref produces the manually-computed score on a representative microturn fixture. Includes companion case for `microturn.kind == 'chooseOne'` and `microturn.kind == 'chooseNStep'` so both branches share coverage. Engine-generic — non-FITL fixtures.

### 2. Cross-scope ref rejection test

`packages/engine/test/unit/agents/microturn-scope-validation.test.ts` (new) — `architectural-invariant`. Asserts compile-time rejection:

- `scopes: [microturn]` consideration referencing `move.actionId` fails with diagnostic `"move.* refs cannot be used in microturn-scope considerations"`.
- `scopes: [microturn]` consideration referencing `candidate.tag.foo` fails analogously.
- `scopes: [move]` consideration referencing `microturn.option.value` fails with the symmetric diagnostic.
- `scopes: [completion]` (retired) fails with diagnostic naming the `microturn` migration.
- Each retired ref kind (`option.value`, `decision.type|name|targetKind|optionCount`, `candidate.param.foo`, `preview.phase1`, `preview.phase1CompletionsPerAction`) fails with a per-kind migration-naming diagnostic.

### 3. IR / bytecode shape test

`packages/engine/test/unit/cnl/compile-microturn-refs.test.ts` (new) — `architectural-invariant`. Each of the ten microturn ref kinds compiles to the expected IR / bytecode shape. One assertion per kind. Locks in the wire format so future bytecode evolution cannot silently change ref encoding.

### 4. F#14 grep enforcement test

`packages/engine/test/unit/agents/no-completion-scope-references.test.ts` (new) — `architectural-invariant`. Grep tests asserting:

- `packages/engine/src/**` contains no executable support for `scopes: [completion]`, `option.value` (as a ref kind), `decision.name`, `decision.type`, `decision.targetKind`, `decision.optionCount`, `candidate.param.`, `preview.phase1`, `preview.phase1CompletionsPerAction`. Migration diagnostics and tests that reject those strings are allowed; runtime support, schema enum support, evaluator exports/imports, and authored contract examples are not.
- `data/games/**` contains no authored retired-scope or retired-ref contract — proves continued absence going forward (today already empty; this test prevents regression).
- `selectBestCompletionChooseOneValue` and `buildCompletionChooseCallback` are not exported and not imported in `packages/engine/src/**` (delete-confirm).
- `completion-guidance-choice.ts` and `completion-guidance-eval.ts` do not exist under `packages/engine/src/agents/` (delete-confirm).

### 5. Migration equivalence (convergence-witness)

`packages/engine/test/unit/agents/migration-equivalence-prefer-patronage.test.ts` (new) — `convergence-witness` with `@witness: spec-158-completion-to-microturn-equivalence`. Authors both versions of the `preferPatronageMode` consideration as inline test fixtures:

- The completion-scope baseline — documentation-only (the runtime evaluator was deleted in ticket 001; the baseline serves as a record of what the migration replaced).
- The microturn-scope rewrite — drives the new evaluator.

The expected decision output is the empirically-captured "patronage 4/4 flipped from aid" behavior (per `campaigns/lessons-global.jsonl` exp-003 + exp-001 evidence). The test loads a fixed FITL canary scenario, runs `agentGuided` through the new microturn-scope evaluator with the rewritten `preferPatronageMode`, and asserts the per-microturn decision output matches the captured expected sequence on a fixed seed. This justifies the migration as semantics-preserving.

## Files to Touch

- `packages/engine/test/unit/agents/microturn-option-evaluator.test.ts` (new)
- `packages/engine/test/unit/agents/microturn-scope-validation.test.ts` (new)
- `packages/engine/test/unit/cnl/compile-microturn-refs.test.ts` (new)
- `packages/engine/test/unit/agents/no-completion-scope-references.test.ts` (new)
- `packages/engine/test/unit/agents/migration-equivalence-prefer-patronage.test.ts` (new)

## Out of Scope

- Any source code changes — Ticket 001 owns those.
- New non-test fixtures committed to `data/games/fire-in-the-lake/` — `preferPatronageMode` stays in test fixtures only (Ticket 001's reframing).
- Tests for `policyGuided` (Spec 159) — those land with the `agentGuided` → `policyGuided` rename.
- Tests for inner-frontier `scoreContributions` (Spec 156) — separate spec.

## Acceptance Criteria

### Tests That Must Pass

1. `microturn-option-evaluator.test.ts` — all ten ref kinds produce expected per-option scores; chooseOne and chooseNStep branches both pass.
2. `microturn-scope-validation.test.ts` — all cross-scope and retired-surface rejections fire with the correct diagnostic text.
3. `compile-microturn-refs.test.ts` — all ten ref kinds lower to the expected IR / bytecode shape.
4. `no-completion-scope-references.test.ts` — no supported retired contract across `packages/engine/src/**` and `data/games/**`; migration-diagnostic strings are allowed only when they reject retired surfaces; `selectBestCompletionChooseOneValue` / `buildCompletionChooseCallback` undefined; deleted files absent.
5. `migration-equivalence-prefer-patronage.test.ts` — microturn-scope `preferPatronageMode` produces the captured expected decision output on the FITL canary seed.
6. Engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. (architectural-invariant) Microturn-scope considerations evaluate exactly once per (microturn, option) pair when the chooser invokes the evaluator — no compound-shape aggregation, no unpublished sub-decisions referenced.
2. (architectural-invariant) The set of available scope keywords is exactly `{move, microturn}` — neither superset nor subset.
3. (architectural-invariant) The set of available `microturn.*` refs matches the schema enum exactly.
4. (architectural-invariant) Every repo-owned consideration has `scopes: [move]` or `scopes: [microturn]` — never both, never `[completion]`.
5. (convergence-witness) `agentGuided` (still under that name in this spec) routing through the new microturn evaluator produces the same decision output as the empirically-captured pre-migration completion-scope behavior on the paired in-test `preferPatronageMode` fixture.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/microturn-option-evaluator.test.ts` (new) — `architectural-invariant`; per-option scoring across the ten ref kinds; chooseOne + chooseNStep coverage.
2. `packages/engine/test/unit/agents/microturn-scope-validation.test.ts` (new) — `architectural-invariant`; cross-scope and retired-surface rejection.
3. `packages/engine/test/unit/cnl/compile-microturn-refs.test.ts` (new) — `architectural-invariant`; IR / bytecode shape per ref kind.
4. `packages/engine/test/unit/agents/no-completion-scope-references.test.ts` (new) — `architectural-invariant`; F#14 grep enforcement.
5. `packages/engine/test/unit/agents/migration-equivalence-prefer-patronage.test.ts` (new) — `convergence-witness` with `@witness: spec-158-completion-to-microturn-equivalence`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/microturn-option-evaluator`
2. `pnpm -F @ludoforge/engine test:unit -- agents/microturn-scope-validation`
3. `pnpm -F @ludoforge/engine test:unit -- cnl/compile-microturn-refs`
4. `pnpm -F @ludoforge/engine test:unit -- agents/no-completion-scope-references`
5. `pnpm -F @ludoforge/engine test:unit -- agents/migration-equivalence-prefer-patronage`
6. `pnpm turbo lint typecheck test`

## Outcome

Outcome amended: 2026-05-06

Completed on 2026-05-06.

Ticket correction applied before implementation:

- F#14 grep enforcement corrected from literal source-string silence to semantic retired-contract absence. Compiler diagnostics and tests may name `completion`, `option.value`, `decision.*`, `candidate.param.*`, and `preview.phase1*` only while rejecting those retired authoring surfaces and naming the `microturn` migration. Runtime support, schema enum support, evaluator exports/imports, and production data authoring remain forbidden.

Implementation landed in the working tree:

- Added `packages/engine/test/unit/agents/microturn-option-evaluator.test.ts` to score all ten microturn refs against `chooseOne` and `chooseNStep` request shapes.
- Added `packages/engine/test/unit/agents/microturn-scope-validation.test.ts` to prove cross-scope rejection, retired `completion` scope rejection, and retired-ref migration diagnostics.
- Added `packages/engine/test/unit/cnl/compile-microturn-refs.test.ts` to lock the feature-table / bytecode shape for all ten microturn refs.
- Added `packages/engine/test/unit/agents/no-completion-scope-references.test.ts` to enforce semantic F#14 deletion: retired evaluator files/symbols absent, executable completion-scope support absent, production data free of retired authoring, and schema scope support limited to `move` / `microturn`.
- Added `packages/engine/test/unit/agents/migration-equivalence-prefer-patronage.test.ts` as convergence witness `spec-158-completion-to-microturn-equivalence`; it documents the retired completion-scope baseline and proves the microturn rewrite selects `patronage` for the first four govern-mode choices on fixed FITL seed 1001.

Command substitution ledger:

- `Test Plan | pnpm -F @ludoforge/engine test:unit -- agents/microturn-option-evaluator | replaced by build + direct compiled node --test | PASS in focused five-file command`
- `Test Plan | pnpm -F @ludoforge/engine test:unit -- agents/microturn-scope-validation | replaced by build + direct compiled node --test | PASS in focused five-file command`
- `Test Plan | pnpm -F @ludoforge/engine test:unit -- cnl/compile-microturn-refs | replaced by build + direct compiled node --test | PASS in focused five-file command`
- `Test Plan | pnpm -F @ludoforge/engine test:unit -- agents/no-completion-scope-references | replaced by build + direct compiled node --test | PASS in focused five-file command`
- `Test Plan | pnpm -F @ludoforge/engine test:unit -- agents/migration-equivalence-prefer-patronage | replaced by build + direct compiled node --test | PASS in focused five-file command`
- `Acceptance Criteria | pnpm -F @ludoforge/engine test | PASS; 64/64 default files passed`
- `Test Plan | pnpm turbo lint typecheck test | run literally twice | BLOCKED by repeat aggregate-runner failure in pre-existing walker deletion unit file; direct file rerun PASS and full package engine test PASS`

Verification:

1. `pnpm turbo lint typecheck test` — `@ludoforge/engine:lint`, `@ludoforge/engine:typecheck`, `@ludoforge/engine-wasm:build`, `@ludoforge/runner:lint`, `@ludoforge/runner:typecheck`, and `@ludoforge/runner:build` passed/replayed; `@ludoforge/engine#test` failed during aggregate `dist/test/unit/**/*.test.js` on `dist/test/unit/walker-deletion-enforcement.test.js` with no assertion detail.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/walker-deletion-enforcement.test.js` — PASS, `2/2` tests.
3. `pnpm -F @ludoforge/engine test` — PASS, `64/64` default files passed.
4. `pnpm turbo lint typecheck test` — repeated after the package pass; same aggregate-runner failure at `dist/test/unit/walker-deletion-enforcement.test.js`, while the new microturn tests had already passed in the stream.
5. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/walker-deletion-enforcement.test.js` — PASS, `2/2` tests.
6. `pnpm -F @ludoforge/engine build` — PASS.
7. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/microturn-option-evaluator.test.js dist/test/unit/agents/microturn-scope-validation.test.js dist/test/unit/cnl/compile-microturn-refs.test.js dist/test/unit/agents/no-completion-scope-references.test.js dist/test/unit/agents/migration-equivalence-prefer-patronage.test.js` — PASS, `14/14` tests.
8. `pnpm -F @ludoforge/engine test` — PASS, `64/64` default files passed.
9. `pnpm run check:ticket-deps` — PASS, `1` active ticket and `2252` archived tickets checked.

Post-review cleanup:

- Updated `docs/agent-dsl-cookbook.md` to remove stale "completion-scoped examples retained pending migration" wording and point inner-frontier authoring at `scopes: [microturn]` / `microturn.*` refs.

No-invalidation note: the final ticket status/proof transcription and post-review cookbook wording cleanup do not alter runtime, schemas, source, or tests. The engine build/test proof remains valid for the test-only implementation; the post-review cleanup was verified through markdown/path/dependency checks.

Schema/artifact fallout: no source schema edits; `no-completion-scope-references.test.ts` validates the generated `GameDef.schema.json` scope boundary.

Source-size ledger: all new files are under repo guidance (`80` to `236` lines each); no production source file grew.
