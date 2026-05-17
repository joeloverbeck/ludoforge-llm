# 179ACTSELPRE-002: Phase 1a — Schema/compiler/validator wiring for `outcomeGrantContinuation`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types.ts` (or `types-core.ts`), `packages/engine/src/cnl/compile-agents.ts`, `packages/engine/src/cnl/validate-agents.ts`, `packages/engine/src/cnl/game-spec-doc.ts`, `packages/engine/schemas/*.json`.
**Deps**: `archive/tickets/179ACTSELPRE-001.md`

## Problem

Spec 179's profile-side opt-in (`preview.outcomeGrantContinuation.{enabled, extraDepthCap, capClass}`) must reach the compiled `AgentPreviewConfig` before the driver change (ticket 003) can consume it. This ticket lands the schema field, threads it through the compiler and validator, regenerates schema artifacts, and pins old-profile compatibility (existing profiles without the new field compile and behave identically to today's opt-out behavior).

## Assumption Reassessment (2026-05-17)

1. `AgentPreviewConfig` exists in the engine kernel types — verified during brainstorm verification at `packages/engine/src/kernel/types-core.ts` / `schemas-core.ts` (cap-class enum at `:1334, :2384`; existing `completionPolicy`/`fallbackCompletionPolicy`/`completionDepthCap` defaults at `policy-preview.ts:608-610`).
2. `compile-agents.ts` is where preview-config fields are lowered from YAML/JSON spec to compiled form. Existing cap classes (`standard256`, `deep1024`) live at `compile-agents.ts:111-118` with `CAP_CLASS_BUDGETS` and `INNER_PREVIEW_HARD_CAP = 256` — this ticket adds a sibling `extraDepthCap`-class registry following the same naming convention.
3. `validate-agents.ts` enforces compile-time invariants on preview config (e.g., depth-cap bounds). The new `outcomeGrantContinuation.extraDepthCap` must be subject to an analogous bound.
4. Old profiles that omit `outcomeGrantContinuation` MUST continue to behave exactly as today — current behavior preserved by treating the absent block as `enabled: false`. Spec §2 Non-Goals confirms: "No default behavior change."

## Architecture Check

1. **Opt-in surface, opt-out default.** New field is optional; absence means `enabled: false`; existing profiles compile and run unchanged. Aligns with Foundation 14 (No Backwards Compatibility) by not introducing a deprecated path — there is no prior behavior being replaced, only new behavior being made available.
2. **Named cap-class pattern, not free-form numeric budget.** `extraDepthCap` resolves to a cap-class label statically recorded in the compiled artifact, per Foundation 10's amendment in Spec 164. Reuses the existing `standard256` / `deep1024` registry pattern at `compile-agents.ts:111-118` — adds e.g. `postGrant16` (4 + buffer, as proposed in spec §4.1) as a new cap class.
3. **Validation at compile time** (Foundation 12 — Compiler-Kernel Validation Boundary): `extraDepthCap` value must reference a known cap class; unknown labels fail compilation with a diagnostic name analogous to existing `CNL_COMPILER_AGENT_PREVIEW_*` codes.
4. **No engine-agnostic boundary impact.** No FITL-specific identifiers leak into kernel types. The `outcomeGrantContinuation` block is generic — any game's profile can opt in.

## What to Change

### 1. Extend `AgentPreviewConfig` schema

Add an optional `outcomeGrantContinuation` block to `AgentPreviewConfig`:

```ts
readonly outcomeGrantContinuation?: {
  readonly enabled: boolean;
  readonly extraDepthCap: number;
  readonly capClass: AgentPreviewPostGrantCapClass;
};
```

Add a sibling cap-class type for `extraDepthCap`:

```ts
export type AgentPreviewPostGrantCapClass = 'postGrant16';  // start with one named class; future specs may add more
export const POST_GRANT_CAP_CLASS_BUDGETS: Record<AgentPreviewPostGrantCapClass, number> = {
  postGrant16: 4,  // matches spec §4.1 proposal; tuneable per witness data from ticket 005
};
```

Locations: `packages/engine/src/kernel/types-core.ts` (type), `packages/engine/src/kernel/schemas-core.ts` (Zod schema).

### 2. Thread through compile-agents.ts and validate-agents.ts

In `compile-agents.ts`:
- Parse the YAML `outcomeGrantContinuation` block; default to `{ enabled: false }` when absent.
- Resolve `capClass` against `POST_GRANT_CAP_CLASS_BUDGETS`; unknown labels emit a new diagnostic (proposed: `CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_CAP_CLASS_UNKNOWN`).
- Lower into the compiled `AgentPreviewConfig` shape.

In `validate-agents.ts`:
- Validate `extraDepthCap` is a positive integer.
- Validate `enabled: true` requires both `extraDepthCap` AND `capClass` (per spec Open Question §8.3 — "named cap class is mandatory when opted in").

### 3. Regenerate schema artifacts

Run `pnpm turbo schema:artifacts` to regenerate `packages/engine/schemas/GameDef.schema.json` and any other affected schemas. Commit the regenerated JSON.

### 4. Pin old-profile compatibility

Add an architectural-invariant test at `packages/engine/test/architecture/preview-config-back-compat/old-profiles-compile.test.ts`:

```ts
// @test-class: architectural-invariant
```

The test loads every existing profile under `data/games/*/9*-agents.md` (or the conformance corpus of profiles), compiles each, and asserts the resolved `AgentPreviewConfig.outcomeGrantContinuation` is `undefined` or `{ enabled: false }`. This pins the "default behavior unchanged" Non-Goal from spec §2.

### 5. Compiler diagnostic test

Add a compiler-rejection test at `packages/engine/test/architecture/preview-config-back-compat/post-grant-cap-class-validation.test.ts` covering:
- Profile with `enabled: true` and missing `extraDepthCap` → compile error
- Profile with `enabled: true` and unknown `capClass` → `CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_CAP_CLASS_UNKNOWN`
- Profile with `enabled: true` and valid `capClass: postGrant16` → compiles cleanly

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add type)
- `packages/engine/src/kernel/schemas-core.ts` (modify — add Zod schema)
- `packages/engine/src/cnl/compile-agents.ts` (modify — parse, lower, cap-class registry)
- `packages/engine/src/cnl/validate-agents.ts` (modify — bound checks, opt-in invariants)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — thread new field through the spec-doc projection if it surfaces preview config)
- `packages/engine/schemas/GameDef.schema.json` (regenerated)
- `packages/engine/test/architecture/preview-config-back-compat/old-profiles-compile.test.ts` (new)
- `packages/engine/test/architecture/preview-config-back-compat/post-grant-cap-class-validation.test.ts` (new)

## Out of Scope

- Driver change (ticket 003 — `driveSyntheticCompletion` extension).
- Trace surface (ticket 004 — `previewUsage.outcomeGrantContinuation`).
- WASM-route alignment (ticket 006 — optional).
- Adding additional `postGrantCap` classes beyond `postGrant16` — start with one named class; future specs add more if witnesses demand.
- Touching existing profiles to opt in — opt-in for `arvn-evolved` is owned by ticket 005's Phase 2 witness.

## Acceptance Criteria

### Tests That Must Pass

1. `old-profiles-compile.test.ts` — every existing profile compiles unchanged with `outcomeGrantContinuation === undefined` or `{ enabled: false }` resolved default.
2. `post-grant-cap-class-validation.test.ts` — all three diagnostic cases pass.
3. Engine test suite green: `pnpm -F @ludoforge/engine test`.
4. Compiler reproducibility (Foundation 8): `pnpm -F @ludoforge/engine build` followed by a second `pnpm -F @ludoforge/engine build` produces byte-identical `dist/` output.
5. Schema artifact reproducibility: `pnpm turbo schema:artifacts` is idempotent — running twice produces no diff.

### Invariants

1. `AgentPreviewConfig` shape is additive — no field removed, no field renamed; the new `outcomeGrantContinuation` block is optional.
2. Foundation 10 (Bounded Computation): `outcomeGrantContinuation.extraDepthCap` resolves to a named cap class statically recorded in the compiled artifact.
3. Foundation 12 (Compiler-Kernel Validation Boundary): all invariants validated at compile time, not deferred to runtime.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-config-back-compat/old-profiles-compile.test.ts` — proves Non-Goal "No default behavior change" from spec §2.
2. `packages/engine/test/architecture/preview-config-back-compat/post-grant-cap-class-validation.test.ts` — proves compile-time validation of the new field.

### Commands

1. Targeted: `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-config-back-compat/*.test.js`
2. Schema regen: `pnpm turbo schema:artifacts`
3. Full engine: `pnpm -F @ludoforge/engine test`
4. Full turbo: `pnpm turbo test`
5. Lint + typecheck: `pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completion date: 2026-05-17

Post-review: no must-fix-now cleanup, reopen-original-ticket item, or follow-up ticket was required. The landed schema/compiler/validator slice satisfies ticket 002 and remains bounded to Phase 1a; driver behavior, trace aggregation, FITL witness/cookbook, and optional WASM routing remain with active tickets 003-006.

Authorization ledger:
- Approved option: surgical additions in canonical schema/compiler hubs despite preexisting oversize files.
- Scope effect: preserves ticket boundary; no extraction in this ticket.
- Basis: `types-core.ts`, `schemas-core.ts`, `compile-agents.ts`, and `game-spec-doc.ts` are established contract hubs; extracting preview schema/compiler tables would widen this Phase 1a slice and obscure the additive wiring.

What landed:
- Added `AgentPreviewPostGrantCapClass = 'postGrant16'` and optional compiled `preview.outcomeGrantContinuation` config with `enabled`, `extraDepthCap`, and `capClass`.
- Added authored `GameSpecAgentProfileDef.preview.outcomeGrantContinuation`.
- Added compiler lowering for `preview.outcomeGrantContinuation`, including mandatory `extraDepthCap`/`capClass` when `enabled: true`, `postGrant16` cap-class validation, and `extraDepthCap === 4` budget validation.
- Added validator diagnostics for malformed enabled post-grant continuation blocks.
- Added architecture tests for old production profile opt-out compatibility and post-grant cap-class validation.
- Regenerated schema artifacts; persisted diff is `packages/engine/schemas/GameDef.schema.json` only. `Trace.schema.json` and `EvalReport.schema.json` were rewritten byte-identically by the generator.

Touched-file scope:
- Done: `packages/engine/src/kernel/types-core.ts`
- Done: `packages/engine/src/kernel/schemas-core.ts`
- Done: `packages/engine/src/cnl/compile-agents.ts`
- Done: `packages/engine/src/cnl/validate-agents.ts`
- Done: `packages/engine/src/cnl/game-spec-doc.ts`
- Done: `packages/engine/schemas/GameDef.schema.json`
- Done: `packages/engine/test/architecture/preview-config-back-compat/old-profiles-compile.test.ts`
- Done: `packages/engine/test/architecture/preview-config-back-compat/post-grant-cap-class-validation.test.ts`
- Owned fallout: `packages/engine/src/cnl/compiler-diagnostic-codes.ts`

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `packages/engine/src/kernel/types-core.ts` | 2324 | 2332 | no; preexisting oversize + active growth | +8 | Approved surgical addition in canonical compiled type hub; extraction would widen the ticket. | none |
| `packages/engine/src/kernel/schemas-core.ts` | 2751 | 2759 | no; preexisting oversize + active growth | +8 | Approved surgical addition in canonical Zod schema hub; extraction would widen the ticket. | none |
| `packages/engine/src/cnl/compile-agents.ts` | 4619 | 4720 | no; preexisting oversize + active growth | +101 | Approved surgical addition in canonical agent compiler hub; extraction would widen the ticket. | none |
| `packages/engine/src/cnl/game-spec-doc.ts` | 877 | 882 | no; preexisting oversize + active growth | +5 | Approved surgical addition in canonical authored spec type hub; extraction would widen the ticket. | none |

Final proof:
- `pnpm -F @ludoforge/engine build` — pass.
- Engine build reproducibility — pass. Two consecutive `pnpm -F @ludoforge/engine build` runs produced identical SHA-256 manifests for 5,923 files under `packages/engine/dist`.
- `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-config-back-compat/*.test.js` — pass: 2 suites, 4 tests, 0 failures.
- `pnpm turbo schema:artifacts` — pass, run twice for idempotence. Persisted diff is `GameDef.schema.json`; generated `Trace.schema.json` and `EvalReport.schema.json` were byte-identical.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — pass as a fresh package-local schema check after the root schema task.
- `pnpm -F @ludoforge/engine test` — pass: 92/92 files passed; unit block 5,668 tests passed; architecture block 101 tests passed.
- `pnpm turbo lint` — pass. Engine lint executed; runner lint was a Turbo cache hit replay.
- `pnpm turbo typecheck` — pass. Engine and runner typecheck tasks executed; engine build dependency was a Turbo cache hit replay.
- `pnpm turbo test` — pass: 5/5 tasks successful. Engine and runner tests executed; build dependencies were Turbo cache hit replays. Runner emitted preexisting jsdom canvas `getContext()` warnings and a Vite chunk-size advisory, both non-ticket-owned.
- `pnpm run check:ticket-deps` — pass: ticket dependency integrity check passed for 5 active tickets and 2,396 archived tickets.
- `git diff --check` — pass.
- New-file whitespace checks — pass. `git diff --no-index --check /dev/null ...` exited 1 for each new test file because the files are new, with no whitespace diagnostics.

Late-edit proof validity:
- Terminal status and final proof transcription only. No code, schema, acceptance-boundary, dependency, touched-file, or follow-up scope changed after the final proof set.
