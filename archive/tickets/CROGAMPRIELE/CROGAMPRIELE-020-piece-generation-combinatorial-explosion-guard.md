# CROGAMPRIELE-020: Add combinatorial explosion guard to piece generation

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — cnl expand-piece-generation, compiler-diagnostic-codes
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-008-expand-templates-orchestrator.md`

## Problem

`expandPieceCatalogAsset` in `expand-piece-generation.ts` computes the Cartesian product of all dimensions via `cartesianProduct()` (line 221) with no upper bound on the result size. A spec author who accidentally declares dimensions with many values (e.g., two dimensions of 100 values each = 10,000 piece types, or three dimensions of 50 = 125,000) will cause the compiler to allocate unbounded arrays, potentially exhausting memory or producing a GameDef too large to serialize.

The five other expansion passes already have implicit bounds (batch markers/vars use explicit `ids`/`names` arrays; zone templates are bounded by seat count; phase templates are bounded by `fromTemplate` entries). Piece generation is the only expansion pass with multiplicative growth, making it the most likely source of accidental OOM.

## Assumption Reassessment (2026-03-02)

1. `cartesianProduct()` is at `expand-piece-generation.ts:27-44`. Confirmed: recursive, no size check.
2. `expandPieceCatalogAsset()` calls it at line 221 and iterates the result unbounded at line 223.
3. No existing guard or diagnostic code for combinatorial limits exists — confirmed by grepping `compiler-diagnostic-codes.ts` for `PIECE_GEN_MAX` or `PIECE_GEN_COMBO` (zero matches).
4. `validateGenerateBlock()` (lines 94-183) validates structural correctness but not combinatorial size.

## Architecture Check

1. A compile-time guard is strictly cleaner than letting users discover OOM at runtime. The guard belongs in `validateGenerateBlock()` alongside the existing structural checks — same validation phase, same diagnostic pattern.
2. This is a compiler-level concern — the kernel and runtime remain agnostic. The constant lives in the compiler module.
3. No backwards-compatibility concern — specs below the limit are unaffected. Specs above it get a clear error diagnostic instead of silent OOM.

## What to Change

### 1. Add `MAX_GENERATED_PIECE_TYPES` constant (`expand-piece-generation.ts`)

Add a module-level constant (e.g., `5_000`) representing the maximum number of piece types a single `generate` block may produce.

### 2. Add size check after `cartesianProduct()` call (`expand-piece-generation.ts`)

After line 221 (`const combinations = cartesianProduct(genBlock.dimensions);`), check `combinations.length > MAX_GENERATED_PIECE_TYPES`. If exceeded, push a diagnostic and `continue` to skip this generate block.

Alternatively, the check can be done in `validateGenerateBlock()` by computing the product of dimension value counts without materializing the array. This is more efficient — it avoids allocating the oversized array at all:

```typescript
const combinationCount = block.dimensions.reduce(
  (acc, dim) => acc * dim.values.length, 1
);
if (combinationCount > MAX_GENERATED_PIECE_TYPES) {
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PIECE_GEN_COMBINATION_LIMIT_EXCEEDED,
    path,
    severity: 'error',
    message: `generate block produces ${combinationCount} combinations, exceeding limit of ${MAX_GENERATED_PIECE_TYPES}.`,
  });
  valid = false;
}
```

The pre-materialization approach (in `validateGenerateBlock`) is preferred since it prevents the allocation entirely.

### 3. Add diagnostic code (`compiler-diagnostic-codes.ts`)

Add `CNL_COMPILER_PIECE_GEN_COMBINATION_LIMIT_EXCEEDED` to the `CNL_COMPILER_DIAGNOSTIC_CODES` enum after the existing `PIECE_GEN_*` entries.

## Files to Touch

- `packages/engine/src/cnl/expand-piece-generation.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/expand-piece-generation.test.ts` (modify)

## Out of Scope

- Changing `cartesianProduct` to a lazy/streaming iterator (optimization, not needed at current scale)
- Per-asset cumulative limits (each generate block is independent)
- Limits on other expansion passes (they are already implicitly bounded)

## Acceptance Criteria

### Tests That Must Pass

1. A generate block with dimensions producing exactly `MAX_GENERATED_PIECE_TYPES` combinations succeeds without diagnostics.
2. A generate block exceeding the limit emits `CNL_COMPILER_PIECE_GEN_COMBINATION_LIMIT_EXCEEDED` and does not produce expanded piece types.
3. All existing `expand-piece-generation.test.ts` tests continue to pass (well below the limit).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No generate block can produce more than `MAX_GENERATED_PIECE_TYPES` piece types.
2. The limit is enforced before array materialization (no OOM risk).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-piece-generation.test.ts` — "emits CNL_COMPILER_PIECE_GEN_COMBINATION_LIMIT_EXCEEDED when dimension product exceeds limit": create a generate block with dimensions whose product exceeds the constant. Assert the diagnostic is emitted and no expanded piece types are produced.
2. `packages/engine/test/unit/expand-piece-generation.test.ts` — "allows generate block at exact limit boundary": create a generate block whose product equals `MAX_GENERATED_PIECE_TYPES`. Assert no diagnostic and successful expansion.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "expand-piece-generation|expandPieceGeneration"`
2. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

Implementation matched the ticket plan exactly. No deviations.

### Changes made
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` — added `CNL_COMPILER_PIECE_GEN_COMBINATION_LIMIT_EXCEEDED` to `COMPILER_DIAGNOSTIC_CODES_PIECE_GENERATION`
- `packages/engine/src/cnl/expand-piece-generation.ts` — added exported `MAX_GENERATED_PIECE_TYPES` constant (5,000) and pre-materialization guard in `validateGenerateBlock()` that computes the product of dimension value counts without allocating the Cartesian product array
- `packages/engine/test/unit/expand-piece-generation.test.ts` — added 2 new tests (tests 13-14, renumbered existing test 13 to 15)

### Ticket assumption corrections
- Updated line number references: `cartesianProduct()` 27-40 → 27-44, `validateGenerateBlock()` 94-139 → 94-183 (function grew with dimension/derivedProp checks since ticket was written)
