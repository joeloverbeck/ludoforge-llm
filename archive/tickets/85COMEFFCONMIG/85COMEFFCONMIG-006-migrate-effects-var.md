# 85COMEFFCONMIG-006: Narrow effects-var.ts off full EffectContext merges

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/effects-var.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-var.ts` still has 3 `fromEnvAndCursor` call sites in `applySetVar`, `applyAddVar`, and `applySetActivePlayer`. These reconstruct full `EffectContext` objects even though the file now mostly talks to narrower boundaries:

1. eval helpers only need `ReadContext`
2. scoped-var definition/state helpers now accept `{ def }` / `{ state }`
3. var-change tracing only needs a tiny provenance/collector pick

The remaining work is no longer about introducing `env.mode` threading; it is about finishing the architectural cleanup at the `effects-var.ts` boundary so the file stops depending on a broad compatibility merge out of convenience.

## Assumption Reassessment (2026-03-26)

1. `applySetVar` still constructs a full merged context and passes it to eval, endpoint resolution, scoped-var definition lookup, scoped-var state reads, and trace emission — confirmed
2. `applyAddVar` still follows the same broad-context pattern — confirmed
3. `applySetActivePlayer` still constructs a full merged context even though it only needs selector evaluation against read-time fields — confirmed
4. `resolveRuntimeScopedEndpoint` already accepts `ReadContext` plus explicit `mode`, and `effects-var.ts` already passes `env.mode` today
5. `resolveScopedVarDef`, `readScopedVarValue`, and `readScopedIntVarValue` now accept narrower contexts, so continuing to pass a broad merged object from this file is stale plumbing
6. Existing unit coverage is stronger than originally assumed:
   - selector-resolution execution/discovery policy is already covered for `setActivePlayer`
   - trace/event parity is already covered across `setVar` and `addVar` global, per-player, and zone scopes
7. One gap remains worth locking down: dynamic scoped-var names/selectors sourced from merged `moveParams` should remain covered after replacing the full merge

## Architecture Check

1. `effects-var.ts` should depend on the narrowest context each downstream boundary actually requires. That is cleaner, more robust, and more extensible than retaining a compatibility-shaped object at the handler boundary.
2. Inline trace picks are still the right shape here because provenance emission needs only collector/state/trace metadata, not an eval context.
3. This aligns with Foundations 9 and 10: finish the migration directly, do not preserve broad plumbing once the downstream APIs have already been narrowed.

## What to Change

### 1. Replace the merged context in applySetVar

- Keep the existing binding-resolution flow
- For eval and endpoint resolution, use `mergeToReadContext(env, evalCursor)`
- Keep passing `env.mode` explicitly to `resolveRuntimeScopedEndpoint`
- For `resolveScopedVarDef`, pass `{ def: env.def }`
- For scoped-var reads, pass `{ state: cursor.state }`
- For trace emission, construct a narrow trace pick from env + cursor fields instead of reusing eval context

### 2. Replace the merged context in applyAddVar

- Same boundary pattern as `applySetVar`

### 3. Replace the merged context in applySetActivePlayer

- Use `mergeToReadContext(env, evalCursor)` for selector evaluation
- No trace pick is needed here because this handler does not emit var-change trace entries

### 4. Update local typing/imports

- Remove `fromEnvAndCursor`
- Import the narrow helper(s) actually used
- Stop typing local trace helpers through `Pick<EffectContext, ...>` if the file can express that shape directly from `EffectEnv`/`EffectCursor`

### Note

This ticket should preserve the architectural direction introduced by -001:
- do not keep passing a broad merged object to helpers that now accept `{ def }` or `{ state }`
- prefer explicit narrow objects plus a tiny trace pick over retaining `EffectContext`-shaped plumbing
- do not broaden scope into a shared cross-file provenance helper here; that consolidation belongs later once the remaining handler files are migrated and the stable duplication surface is obvious

## Files to Touch

- `packages/engine/src/kernel/effects-var.ts` (modify)

## Out of Scope

- Any changes to `scoped-var-runtime-access.ts` (done in -001)
- Any changes to `effect-context.ts`
- Any changes to `trace-provenance.ts` or `var-change-trace.ts` signatures
- Any changes to other effect handler files
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. Existing `effects-var` unit coverage continues to pass
2. Engine test coverage touching variable manipulation and selector normalization continues to pass
3. Determinism-related engine tests continue to pass through the standard engine suite
4. Trace output remains in parity with emitted `varChanged` events

### Invariants

1. `resolveRuntimeScopedEndpoint` receives `ReadContext` plus the already-explicit `env.mode`
2. Scoped-var definition lookup receives only `{ def }`
3. Scoped-var reads receive only `{ state }`
4. Var-change tracing receives the full narrow trace pick it needs
5. Determinism parity is maintained
6. Zero `fromEnvAndCursor` references remain in `effects-var.ts`

## Test Plan

### New/Modified Tests

1. Add at least one focused unit test covering dynamic scoped-var resolution through merged `moveParams` after the handler stops constructing a full `EffectContext`

### Commands

1. `pnpm -F @ludoforge/engine test -- effects-var.test.ts` or equivalent focused engine run
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
4. `pnpm turbo lint`

## Outcome

Completed: 2026-03-26

What actually changed:
- Corrected the ticket first to reflect current reality: `env.mode` threading had already landed, scoped-var helpers were already narrowed, and the remaining work was file-boundary cleanup in `effects-var.ts`
- Replaced all 3 `fromEnvAndCursor` call sites in `effects-var.ts` with narrow context plumbing
- Narrowed local calls so eval/selector work uses `ReadContext`, scoped-var definition lookup uses `{ def }`, scoped-var reads use `{ state }`, and var-change tracing uses a dedicated narrow trace shape
- Added focused unit coverage proving dynamic scoped-var names still resolve through merged `moveParams` after removing the full `EffectContext` merge

Deviations from original plan:
- The original ticket still treated explicit `env.mode` threading as part of the implementation, but that was already present in the codebase
- The final implementation kept the existing explicit binding-resolution/profiling flow in `applySetVar` instead of collapsing further to `mergeToEvalContext`, because preserving that local profiling boundary was cleaner than rewriting the handler more broadly

Verification results:
- `pnpm -F @ludoforge/engine build`
- `node --test packages/engine/dist/test/unit/effects-var.test.js`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
