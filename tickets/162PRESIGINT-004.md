# 162PRESIGINT-004: Compiler previewFallback + CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK diagnostic + fixture migration (atomic cut)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `compile-agents.ts` plus FITL profile YAML migration
**Deps**: `archive/tickets/162PRESIGINT-003.md`

## Problem

Today an authoring profile can declare a microturn consideration whose `value` is a `preview.option.*` ref without specifying what should happen when the ref resolves as unavailable (depthCap, hidden, unresolved, etc.). The compiler accepts the spec and the runtime silently coerces the unknown value to `unknownAs ?? 0` — a hidden floor for "preview ref returned nothing". Spec §5.2 makes the fallback explicit at authoring time: every consideration whose `value` flows through a `previewOptionRef` MUST declare `previewFallback.onUnavailable: noContribution | { constant: <number> }`, or compilation fails with `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`.

Because the compiler diagnostic immediately rejects every existing fixture that uses `previewOptionRef` without `previewFallback`, the FITL profile YAML files and any test fixture profiles that build profiles via the YAML pipeline MUST migrate in the same change. This is a Foundation #14 atomic cut — the diagnostic and the migration land together.

This ticket compiles the new field and emits the diagnostic. Runtime consumption of `previewFallback` (the path that actually changes scoring behavior) lands in 005.

## Assumption Reassessment (2026-05-09)

1. **`compile-agents.ts:81` `INNER_PREVIEW_HARD_CAP = 256`.** Verified. UNCHANGED by this ticket. T7 (hard-cap-unchanged) is included here as an architectural-invariant guard.
2. **Cost formula at `compile-agents.ts:1018-1019`.** Verified — the validation block at line 1020 is `if (!Number.isSafeInteger(cost) || cost > INNER_PREVIEW_HARD_CAP)`. UNCHANGED.
3. **Existing `unknownAs` field on compiled consideration.** Verified at `policy-evaluation-core.ts:505`. Continues to work for non-preview unknown refs (spec §5.2). The compiler's job is to detect a `previewOptionRef` in the `value` AST and require `previewFallback` instead — `unknownAs` remains valid for considerations that don't use preview refs.
4. **FITL profiles using `previewOptionRef`.** Verified consumers:
   - `data/games/fire-in-the-lake/92-agents.md:393, 398, 473` — production FITL agents
   - `data/games/fire-in-the-lake/94-diagnostic-agents.md:11, 16, 34` — diagnostic FITL agents
   Both files declare `preferOptionProjectedMargin: { value: { ref: preview.option.delta.victory.currentMargin.self } }` with no `previewFallback`. Both must migrate.
5. **No Texas Hold'em consumer.** Quick grep confirmed no `preview.option.*` ref usage in Texas Hold'em data files. The conformance corpus is FITL-only for now (this is the only game profile with inner preview enabled).
6. **Test fixtures construct profiles inline via `refExpr`.** Integration tests like `policy-preview-inner-choosenstep-fitl-canary-golden.test.ts:83` build `value: refExpr({ kind: 'previewOptionRef', refKind: 'deltaVictoryCurrentMarginSelf' })` directly — these go through the same compiled-consideration path and must be updated to include `previewFallback` in their inline construction.
7. **CNL diagnostic naming.** `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` is the spec-named code. Confirm during implementation that the existing diagnostic-emission helper accepts this code form (look for sibling `CNL_COMPILER_AGENT_*` codes in `compile-agents.ts`).

## Architecture Check

1. **Foundation #12 (Compiler-Kernel Validation Boundary).** This is exactly where the diagnostic belongs — knowable from the spec alone (does the consideration's value AST contain a `previewOptionRef` and is `previewFallback` declared?), no runtime state needed. Authoring bug caught at compile time.
2. **Foundation #14 (No Backwards Compatibility).** The diagnostic is unconditional — no flag, no opt-in, no transition window. All FITL fixtures and inline test fixtures migrate atomically. The legacy `unknownAs` path becomes unreachable for preview-ref considerations once 005 lands; until then, the compiler enforces the contract at the front gate.
3. **Foundation #20 (Preview Signal Integrity).** Direct alignment — the integrity claim that "any consideration that converts an unavailable preview ref into a contribution MUST declare that fallback explicitly in profile YAML" is enforced here.
4. **Engine-agnostic.** The compiler change is entirely about the generic `previewOptionRef` machinery. FITL fixture migrations are data-only — no game-specific code added to compiler logic.
5. **Mechanical uniformity.** The fixture migration is a one-line addition (`previewFallback: { onUnavailable: noContribution }`) per consideration. Per the skill's atomic-cut guidance, the Large effort rating is acceptable because the change is mechanically uniform across all consumers.

## What to Change

### 1. Extend the YAML schema and compiled shape

In `packages/engine/src/cnl/compile-agents.ts`:
- Accept `previewFallback.onUnavailable` in the consideration YAML schema. Two valid forms:
  - String literal: `noContribution`.
  - Object: `{ constant: <integer> }` where `<integer>` is a finite, safe integer (Foundation #8 — exact arithmetic).
- Compile to a stable shape:
  ```ts
  previewFallback?: {
    readonly onUnavailable:
      | 'noContribution'
      | { readonly kind: 'constant'; readonly value: number };
  }
  ```
- Validate the constant value: must be `Number.isSafeInteger`. Emit `CNL_COMPILER_AGENT_PREVIEW_FALLBACK_INVALID` (or whichever existing schema-error code is conventional) on violation.

### 2. Emit `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`

For each compiled consideration:
1. Walk the `value` expression AST.
2. If any node has `kind: 'previewOptionRef'` AND the consideration has no `previewFallback`, emit:
   - Code: `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`
   - Severity: error (rejects compilation).
   - Message: name the consideration id, the ref id (built via `previewOptionRefKey`), and the suggested YAML to add. Example: `Consideration "preferOptionProjectedMargin" references preview.option.delta.victory.currentMargin.self but does not declare previewFallback.onUnavailable. Add either previewFallback: { onUnavailable: noContribution } or previewFallback: { onUnavailable: { constant: 0 } }.`
3. Continue compilation past the diagnostic only if the existing compiler infrastructure aggregates errors before failing; otherwise short-circuit per the existing pattern.

### 3. Migrate FITL profile YAML fixtures

`data/games/fire-in-the-lake/92-agents.md` — line 393-473 area, `preferOptionProjectedMargin` consideration. Add:
```yaml
preferOptionProjectedMargin:
  scopes: [microturn]
  costClass: preview
  weight: 300
  value:
    ref: preview.option.delta.victory.currentMargin.self
  previewFallback:
    onUnavailable: noContribution
```

`data/games/fire-in-the-lake/94-diagnostic-agents.md` — line 11-34 area. Same migration.

Run a final grep over `data/` for any other `preview.option.*` references; if found, migrate. The grep performed during decomposition surfaced only these two files.

### 4. Migrate inline test fixtures

For each test that constructs a consideration with `value: refExpr({ kind: 'previewOptionRef', ... })`:
- `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts:167`
- `packages/engine/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.ts:83`
- `packages/engine/test/unit/cnl/compile-preview-inner.test.ts:197`
- `packages/engine/test/unit/cnl/validate-preview-inner-warning-parity.test.ts:114`

Add `previewFallback: { onUnavailable: 'noContribution' }` to the inline consideration construction. Mechanical change.

### 5. New compiler tests

`packages/engine/test/architecture/preview-integrity/previewfallback-required-diagnostic.test.ts` (T6 from spec §9.3):

```ts
// @test-class: architectural-invariant
```

Cases:
- Consideration with `value.ref: preview.option.*` and no `previewFallback` → compiler rejects with code `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`. Diagnostic message names the consideration id and the ref id.
- Consideration with `value.ref: preview.option.*` and `previewFallback: { onUnavailable: noContribution }` → compiles cleanly.
- Consideration with `value.ref: preview.option.*`, `previewFallback: { onUnavailable: { constant: 0 } }`, and legacy `unknownAs: 7` → compiles cleanly. (Per spec §14 Open Question 2 and §5.2: `unknownAs` remains active for non-preview unknown values within the same consideration; the consideration may have both fields without conflict.)
- Consideration with non-preview `value` (e.g., a state-feature ref) and no `previewFallback` → compiles cleanly. Diagnostic does not fire spuriously.

`packages/engine/test/architecture/preview-integrity/hard-cap-unchanged.test.ts` (T7 from spec §9.3):

```ts
// @test-class: architectural-invariant
```

- Import `INNER_PREVIEW_HARD_CAP` (or expose it for tests if it is currently private). Assert `=== 256`.
- Read the cost-formula validation block at `compile-agents.ts:1020-1028`. Assert the message string contains `INNER_PREVIEW_HARD_CAP 256` to anchor the test against accidental cap drift. (If the test cannot read source files, an alternative is to compile a profile at exactly `cost = 256` and assert no error, then at `cost = 257` and assert the rejection.)

### 6. Update CNL spec/test fixtures that compile FITL profiles

`packages/engine/test/integration/` and `packages/engine/test/determinism/` may compile FITL game-spec docs end-to-end. After 92-agents.md and 94-diagnostic-agents.md migrate, the compilation step succeeds with the new field present. Verify replay-identity tests (spec-160 / spec-161) still pass byte-identical.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify — schema, compiled shape, diagnostic emission)
- `packages/engine/src/cnl/` schema-related modules if `previewFallback` Zod schema lives elsewhere (check during implementation)
- `data/games/fire-in-the-lake/92-agents.md` (modify — add `previewFallback`)
- `data/games/fire-in-the-lake/94-diagnostic-agents.md` (modify — add `previewFallback`)
- `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` (modify — inline fixture)
- `packages/engine/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.ts` (modify — inline fixture)
- `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (modify — inline fixture if it builds compileable considerations)
- `packages/engine/test/unit/cnl/validate-preview-inner-warning-parity.test.ts` (modify — inline fixture)
- `packages/engine/test/architecture/preview-integrity/previewfallback-required-diagnostic.test.ts` (new)
- `packages/engine/test/architecture/preview-integrity/hard-cap-unchanged.test.ts` (new)

`Likely surface`: the test list above is bounded by the validated grep for `previewOptionRef` consumers; exact scope refines during implementation by re-running the grep against the tip of branch.

## Out of Scope

- Runtime consumption of `previewFallback` (`evaluateConsideration` reading the compiled field, `fallbackExplicit` selectionReason firing, `previewFallbackFired` candidate trace field). Owned by 005.
- ARVN seed 1000 convergence-witness. Owned by 006.
- Cookbook update — the cookbook fix in 006 will retract the universal-capability framing and document `previewFallback`. This ticket does not touch the cookbook.
- Raising `INNER_PREVIEW_HARD_CAP`. Out of scope by spec §3 (deferred to Spec 164). T7 actively guards against scope creep here.
- New ref families. Out of scope by spec §3 (deferred to Spec 163).

## Acceptance Criteria

### Tests That Must Pass

1. T6: `previewfallback-required-diagnostic.test.ts` — all four cases per §5 above pass.
2. T7: `hard-cap-unchanged.test.ts` — `INNER_PREVIEW_HARD_CAP === 256` and the cap formula is unchanged.
3. Existing FITL canary golden tests pass (compilation succeeds with migrated YAML).
4. Existing replay-identity tests pass byte-identical (compilation deterministic; runtime behavior unchanged for `ready` refs because 005 hasn't landed yet).
5. Existing CNL compile tests pass.
6. Existing suite: `pnpm turbo build && pnpm turbo test`.

### Invariants

1. **Foundation #14 atomic cut**: every repository-owned profile YAML and every inline test fixture that uses `previewOptionRef` declares `previewFallback`. Compiler rejection is unconditional (no opt-out flag, no compatibility shim).
2. `INNER_PREVIEW_HARD_CAP === 256` unchanged.
3. The cost formula at `compile-agents.ts:1020` is unchanged.
4. `unknownAs` continues to compile for considerations whose `value` does not contain a `previewOptionRef`.
5. The diagnostic fires only when both conditions hold (preview-option ref present in value AST AND no `previewFallback` declared) — no false positives for sibling considerations.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-integrity/previewfallback-required-diagnostic.test.ts` (new, T6) — diagnostic firing and non-firing cases.
2. `packages/engine/test/architecture/preview-integrity/hard-cap-unchanged.test.ts` (new, T7) — cap and formula preservation guard.
3. Inline fixture migrations in 4 test files listed above.
4. YAML fixture migrations in 2 FITL data files.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-integrity/previewfallback-required-diagnostic.test.js dist/test/architecture/preview-integrity/hard-cap-unchanged.test.js`
3. `pnpm -F @ludoforge/engine test` (full engine suite — verifies FITL canary goldens still pass)
4. `pnpm turbo test` (full repo, includes determinism replay tests)
5. `pnpm turbo schema:artifacts` (verifies any schema artifact regeneration if `previewFallback` adds to a public schema)
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`
