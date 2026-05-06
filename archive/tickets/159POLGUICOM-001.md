# 159POLGUICOM-001: Mechanical rename `agentGuided` → `policyGuided`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel schemas, kernel types, CNL compiler, agents preview, agents runtime
**Deps**: `specs/159-preview-policy-guided-completion.md`

## Problem

The completion policy enum in `preview.completion` exposes `agentGuided`, a name that misleads on two counts: (1) it suggests recursion into a full agent invocation per inner microturn (it doesn't — local frontier scoring), and (2) the post-Spec-158 implementation routes through `selectBestMicroturnChooseOneValue` and `buildMicroturnChooseCallback` — these are policy-evaluator engines, not agent invocations. F#14 demands the rename ship as one atomic cut: every reference to `agentGuided` in the engine package (literal AND identifier, including the `agentGuidedDeps` runtime input prop) is replaced by `policyGuided` / `policyGuidedDeps` in the same change. No alias; no period of "both names accepted". This ticket performs the mechanical rename and lands the AC#5 schema-rejection negative test. The behavioral fallback restructure and trace integration are deferred to ticket 002 — preserving the existing silent `??` fallback structure unchanged here keeps the diff mechanical and reviewable.

## Assumption Reassessment (2026-05-06)

1. `packages/engine/src/agents/policy-preview.ts:431-452` defines `pickAgentGuidedChooseOneDecision`; `:454-507` defines `pickAgentGuidedChooseNStepDecision`. Both already route through Spec 158's evaluators — confirmed against current code in this session's reassessment of spec 159.
2. `pickInnerDecision` at `policy-preview.ts:509-529` switches on `policy === 'agentGuided'` with silent `?? pickGreedy*Decision(...)` at lines 519-520 (chooseOne) and 524-526 (chooseNStep). This ticket renames the policy literal but preserves the `??` structure — the deletion ships in ticket 002 alongside the explicit-fallback restructure.
3. The runtime input prop is currently named `agentGuidedDeps` on `CreatePolicyPreviewRuntimeInput` at `policy-preview.ts:135`, with consumers at `:437`, `:460`, and `policy-runtime.ts:195`. The rename to `policyGuidedDeps` is part of the F#14 atomic cut and lands here.
4. Zod enum literals live at `packages/engine/src/kernel/schemas-core.ts:1154`, `:2031`, and `:2038`. The TypeScript union `AgentPreviewCompletionPolicy = 'greedy' | 'agentGuided'` lives at `types-core.ts:842`. After this ticket, both list `'greedy' | 'policyGuided'` (the third value `'fallback'` arrives in 002).
5. `packages/engine/schemas/GameDef.schema.json` regenerates automatically via `pnpm turbo schema:artifacts` (the source of truth is the Zod schema in `schemas-core.ts`); not hand-edited. `pnpm test` runs `schema:artifacts:check`, which fails CI if the artifact drifts.
6. Three existing test files declare `'agentGuided'` literals and must be migrated in this ticket: `test/integration/agents/cross-game-driver-conformance.test.ts`, `test/unit/compile-agents-authoring.test.ts`, `test/unit/agents/policy-diagnostics-preview.test.ts`. After migration, a separate negative test asserts that `'agentGuided'` is rejected by the schema (AC#5 from the spec).
7. No `data/games/**/*.yaml` profile declares `preview.completion` — the runtime IR default at `policy-runtime.ts:191` is `'greedy'`. This ticket does not touch game data; the IR default is preserved. Verified during reassessment of spec 159.

## Architecture Check

1. **Why this approach is cleaner than alternatives.** The mechanical rename matches the implementation — `policyGuided` accurately names "the policy considerations score the synthetic options". A behavioral preservation here (silent `??` fallback intact, just with renamed function names) keeps the rename diff mechanical and reviewable in isolation; the fallback restructure ships as a focused follow-up in ticket 002 with its own architectural justification.
2. **GameSpecDoc vs runtime boundary.** `policyGuided` is engine-generic — a completion policy keyword. The actual game-specific guidance lives in microturn-scope considerations under the profile's YAML (Spec 158 territory). No engine code in this ticket interprets game-specific microturn guidance.
3. **No backwards-compatibility shims.** F#14 strict: `agentGuided` literal and identifier are deleted everywhere in the same change. No alias, no deprecation warning that accepts both names. Every repo-owned consumer (5 source files, 3 test files) is migrated in this ticket. The mechanical uniformity of the rename is itself the reviewable signal — a reader greps `agentGuided` post-merge and finds zero results except in the negative-test fixture asserting rejection.
4. **F#14 atomic-cut multi-ticket coordination.** Per the spec-to-tickets atomic-cut rule, the FULL deletion of the `agentGuided` literal/identifier — across both source AND test files — lands in this earliest ticket. Tickets 002, 003, 004 introduce dependent behavioral changes but do not re-cite the deleted symbols. The build is green after this ticket lands, before 002 ships its behavioral changes.

## What to Change

### 1. Zod schema rename — `packages/engine/src/kernel/schemas-core.ts`

Replace `'agentGuided'` with `'policyGuided'` in the three enum locations at lines 1154, 2031, 2038. The enum stays binary `['greedy', 'policyGuided']` for this ticket; the third value `'fallback'` arrives in ticket 002's trace-integration changes.

### 2. TypeScript union rename — `packages/engine/src/kernel/types-core.ts`

At line 842, change:
```ts
export type AgentPreviewCompletionPolicy = 'greedy' | 'agentGuided';
```
to:
```ts
export type AgentPreviewCompletionPolicy = 'greedy' | 'policyGuided';
```
The union extension to include `'fallback'` lands in 002.

### 3. CNL compiler diagnostic rename — `packages/engine/src/cnl/compile-agents.ts`

At lines 818-830 (inside `lowerPreviewConfig` at lines 762-849), update the diagnostic message and suggestion:

```ts
if (
  completion !== undefined
  && (typeof completion !== 'string' || (completion !== 'greedy' && completion !== 'policyGuided'))
) {
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_COMPLETION_INVALID,
    path: `${path}.completion`,
    severity: 'error',
    message: `Profile "${profileId}" preview.completion must be greedy or policyGuided, got ${JSON.stringify(completion)}.`,
    suggestion: 'Set preview.completion to greedy or policyGuided.',
  });
}
```

### 4. Preview function renames — `packages/engine/src/agents/policy-preview.ts`

Rename:
- `pickAgentGuidedChooseOneDecision` → `pickPolicyGuidedChooseOneDecision` (def at lines 431-452 and call site in `pickInnerDecision`)
- `pickAgentGuidedChooseNStepDecision` → `pickPolicyGuidedChooseNStepDecision` (def at lines 454-507 and call site)
- `agentGuidedDeps` prop on `CreatePolicyPreviewRuntimeInput` (line 135) → `policyGuidedDeps`; consumers at `:437` (`const guided = input.agentGuidedDeps;`) and `:460` are updated accordingly.
- In `pickInnerDecision` at lines 509-529, replace `policy === 'agentGuided'` (lines 518, 524) with `policy === 'policyGuided'`. The `?? pickGreedy*Decision(...)` silent-fallback expressions at lines 519-520 and 524-526 are PRESERVED in this ticket — they are deleted in 002 alongside the explicit-fallback restructure.

### 5. Runtime consumer rename — `packages/engine/src/agents/policy-runtime.ts`

At line 195, update the `agentGuidedDeps` prop name to `policyGuidedDeps`:

```ts
? { policyGuidedDeps: { catalog: input.catalog, profile: activeProfile! } }
```

The runtime IR default at line 191 (`activeProfile?.preview.completion ?? 'greedy'`) is PRESERVED — flipping it would silently change behavior for every undeclared profile, at odds with F#15.

### 6. Existing test migration

Replace every `completion: 'agentGuided'` literal in:
- `packages/engine/test/integration/agents/cross-game-driver-conformance.test.ts` (2 occurrences)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (occurrences at lines 1121 and 1140)
- `packages/engine/test/unit/agents/policy-diagnostics-preview.test.ts` (2 occurrences)

with `completion: 'policyGuided'`.

### 7. AC#5 negative test — append to `packages/engine/test/unit/compile-agents-authoring.test.ts`

Add a single negative-assertion test (within the existing test file, not a new file) that constructs a profile with `completion: 'agentGuided'` and asserts the compiler diagnostic message names `policyGuided`. This guards against silent regressions where the diagnostic message drifts but the rejection still fires.

### 8. Regenerate JSON schema artifact

Run `pnpm turbo schema:artifacts` to update `packages/engine/schemas/GameDef.schema.json`. Commit the regenerated artifact alongside the source changes — `schema:artifacts:check` is part of the default `pnpm test` lane and will fail CI if the artifact is stale.

## Files to Touch

- `packages/engine/src/kernel/schemas-core.ts` (modify — Zod enum at lines 1154, 2031, 2038)
- `packages/engine/src/kernel/types-core.ts` (modify — `AgentPreviewCompletionPolicy` union at line 842)
- `packages/engine/src/cnl/compile-agents.ts` (modify — diagnostic message and suggestion at lines 818-830 within `lowerPreviewConfig`)
- `packages/engine/src/agents/policy-preview.ts` (modify — `pickAgentGuided*` function renames, `agentGuidedDeps` prop rename at lines 135/437/460, policy-string switches at 518/524)
- `packages/engine/src/agents/policy-runtime.ts` (modify — `agentGuidedDeps` consumer at line 195)
- `packages/engine/schemas/GameDef.schema.json` (regenerated — `pnpm turbo schema:artifacts`; commit the artifact)
- `packages/engine/schemas/Trace.schema.json` (regenerated fallout — same `AgentPreviewCompletionPolicy` enum is serialized in preview drive traces)
- `packages/engine/test/integration/agents/cross-game-driver-conformance.test.ts` (modify — 2 literals)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify — migrate 2 literals at lines 1121/1140; add AC#5 negative test)
- `packages/engine/test/unit/agents/policy-diagnostics-preview.test.ts` (modify — 2 literals)

## Out of Scope

- Replacing the silent `??` fallback at `pickInnerDecision` lines 519-520 and 524-526 with the explicit `{ decision; usedFallback }` shape. (Ticket 002.)
- Adding `fallbackCompletionPolicy` config field. (Ticket 002.)
- Adding `'fallback'` to the `AgentPreviewCompletionPolicy` enum. (Ticket 002.)
- Adding `completionPolicyFallbackCount` to `PolicyPreviewUsageTrace`. (Ticket 002.)
- Compile-time warning for `policyGuided` without microturn considerations. (Ticket 003.)
- Cookbook updates. (Ticket 004.)
- Touching `data/games/**/*.yaml` — no profile declares `preview.completion`; runtime IR default applies and is preserved.

## Acceptance Criteria

### Tests That Must Pass

1. Migrated existing tests pass with `'policyGuided'`: `pnpm -F @ludoforge/engine test:unit -- compile-agents-authoring`, `policy-diagnostics-preview`; `pnpm -F @ludoforge/engine test:integration -- cross-game-driver-conformance` (or the engine-default integration lane).
2. AC#5 negative test passes: a profile with `completion: 'agentGuided'` produces a diagnostic at code `CNL_COMPILER_AGENT_PREVIEW_COMPLETION_INVALID` whose message contains `policyGuided`.
3. Schema artifact check: `pnpm turbo schema:artifacts:check` passes (regenerated `GameDef.schema.json` matches the source).
4. Existing engine suite: `pnpm -F @ludoforge/engine test`.
5. Existing typecheck: `pnpm turbo typecheck`.
6. Existing lint: `pnpm turbo lint`.

### Invariants

1. (architectural-invariant) After this ticket, `grep -rn "'agentGuided'\|\"agentGuided\"\|agentGuided\b" packages/engine/src/ packages/engine/test/` returns matches only in the AC#5 negative-test fixture. F#14 strict.
2. (architectural-invariant) The runtime input prop on `CreatePolicyPreviewRuntimeInput` is named `policyGuidedDeps` everywhere; `agentGuidedDeps` appears nowhere.
3. (architectural-invariant) The runtime IR default at `policy-runtime.ts:191` reads `activeProfile?.preview.completion ?? 'greedy'` — the default literal is unchanged by this ticket. (F#15: surprise-avoidance.)
4. (architectural-invariant) `AgentPreviewCompletionPolicy` is `'greedy' | 'policyGuided'` after this ticket. The third value `'fallback'` arrives in 002 — verified by 002's invariants.
5. (architectural-invariant) `pickInnerDecision` at `policy-preview.ts:509-529` retains the silent `??` fallback expressions structurally — only the function names and policy literal change. Deletion is owned by 002.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify — migrate 2 existing `'agentGuided'` literals at lines 1121/1140; add AC#5 negative test asserting that `'agentGuided'` is rejected with a diagnostic naming `policyGuided`).
2. `packages/engine/test/integration/agents/cross-game-driver-conformance.test.ts` (modify — migrate 2 `'agentGuided'` literals).
3. `packages/engine/test/unit/agents/policy-diagnostics-preview.test.ts` (modify — migrate 2 `'agentGuided'` literals).

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- compile-agents-authoring`
2. `pnpm -F @ludoforge/engine test:unit -- policy-diagnostics-preview`
3. `pnpm -F @ludoforge/engine test -- cross-game-driver-conformance`
4. `pnpm turbo schema:artifacts`
5. `pnpm turbo schema:artifacts:check`
6. `pnpm turbo lint typecheck test`

## Outcome

Implemented on 2026-05-06. The implementation keeps this ticket's mechanical boundary:

- `agentGuided` was renamed to `policyGuided` across engine source, engine tests, and generated schemas.
- `agentGuidedDeps` was renamed to `policyGuidedDeps`; no alias was added.
- The silent `?? pickGreedy*Decision(...)` fallback structure in `pickInnerDecision` is preserved for ticket 002.
- The runtime IR default remains `activeProfile?.preview.completion ?? 'greedy'`.
- The existing test fixtures now author `policyGuided`, and the added AC#5 negative test proves `agentGuided` is rejected with diagnostics naming `policyGuided`.

Generated-artifact correction: `pnpm turbo schema:artifacts` rewrites both `GameDef.schema.json` and `Trace.schema.json`. `Trace.schema.json` is owned generated fallout because the renamed enum also appears on preview-drive trace payloads.

Command ledger and final proof:

| Ticket command | Final citation |
| --- | --- |
| `pnpm -F @ludoforge/engine test:unit -- compile-agents-authoring` | Replaced by `pnpm -F @ludoforge/engine exec node --test dist/test/unit/compile-agents-authoring.test.js` after `pnpm turbo schema:artifacts` rebuilt `dist`; passed, 54 tests. |
| `pnpm -F @ludoforge/engine test:unit -- policy-diagnostics-preview` | Replaced by `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-diagnostics-preview.test.js` after build; passed, 3 tests. |
| `pnpm -F @ludoforge/engine test -- cross-game-driver-conformance` | Replaced by focused compiled integration proof `pnpm -F @ludoforge/engine exec node --test dist/test/integration/agents/cross-game-driver-conformance.test.js`; passed, 5 tests. The broad `pnpm -F @ludoforge/engine test` also passed with 64/64 default files. |
| `pnpm turbo schema:artifacts` | Run literally; passed and regenerated `GameDef.schema.json` plus owned `Trace.schema.json` fallout. |
| `pnpm turbo schema:artifacts:check` | Stale root Turbo task; replaced by package script `pnpm -F @ludoforge/engine run schema:artifacts:check`; passed. |
| `pnpm turbo lint typecheck test` | Split into `pnpm turbo lint`, `pnpm turbo typecheck`, and `pnpm turbo test`; all passed. |

Source file size ledger: the touched source files and `compile-agents-authoring.test.ts` are pre-existing over repo guidance. This ticket adds only a mechanical rename plus one focused negative test; extraction would widen the mechanical rename boundary and is deferred with no new successor because no new separable production logic was added.

Deferred sibling scope: ticket 002 owns explicit fallback and trace aggregate behavior, ticket 003 owns the policy-guided warning, and ticket 004 owns cookbook documentation. This ticket intentionally leaves those surfaces unchanged.

Late-edit proof validity: the final ticket edit only changed status and transcribed exact proof results after all final lanes were green; it did not change code, generated artifacts, scope, command semantics, touched-file ownership, follow-up ownership, or acceptance boundaries.
