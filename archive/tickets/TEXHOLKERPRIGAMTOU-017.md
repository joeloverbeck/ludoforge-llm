# TEXHOLKERPRIGAMTOU-017: Runtime Asset Indexing and Precompiled Table Accessors

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-016
**Blocks**: TEXHOLKERPRIGAMTOU-018

## 1) Reassessed assumptions (code/tests reality)

This ticket's original assumptions were partially outdated.

What is already implemented in code:
- `src/kernel/runtime-table-index.ts` builds runtime table indexes from `runtimeDataAssets` + `tableContracts`.
- `src/kernel/eval-query.ts` (`assetRows`) already uses indexed table entries; row-path traversal is not repeated per query call.
- `src/kernel/resolve-ref.ts` (`assetField`) already uses table index lookup.
- Existing tests already cover baseline runtime table indexing behavior and typed errors (`test/unit/runtime-table-index.test.ts`, `test/unit/eval-query.test.ts`, `test/unit/resolve-ref.test.ts`).

Remaining discrepancy / gap:
- `assetField` still performs repeated linear field lookup (`entry.contract.fields.find(...)`) instead of a precompiled field accessor map.
- Determinism/collision behavior and contract-level edge cases are only partially covered by tests.

## 2) Updated scope

Refine runtime table indexing to complete the precompiled-accessor architecture:
- Extend runtime index entries with precompiled field contract lookup (`fieldContractsByName`) built once.
- Update `resolve-ref`/`eval-query` paths to consume precompiled field metadata and avoid repeated per-call contract scans.
- Keep runtime semantics and error codes stable.
- Strengthen unit tests around deterministic indexing and normalization collision behavior.

Out of scope:
- Introducing game-specific paths/optimizations.
- Timing-based performance assertions in CI (flaky and environment-dependent).

## 3) Invariants that must hold

1. Query/ref results are identical before/after accessor precompilation.
2. Table row ordering remains identical to payload array order.
3. Runtime table/field lookup is indexed (no repeated per-call contract field scans).
4. No mutable global cache/state is introduced for runtime table indexing.
5. Deterministic behavior under NFC-normalized asset-id collisions (first declaration wins).

## 4) Tests required

1. Unit: runtime table index exposes deterministic field contract lookup for each contract.
2. Unit: NFC-normalized runtime asset-id collisions resolve deterministically (first asset wins).
3. Unit: `assetRows` behavior remains unchanged for valid queries and typed errors.
4. Unit: `assetField` behavior remains unchanged while using indexed field contracts.
5. Regression: `npm run build`, relevant unit tests, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-15
- What was actually changed:
  - Added precompiled field contract accessor map (`fieldContractsByName`) to runtime table index entries in `src/kernel/runtime-table-index.ts`.
  - Updated `assetField` resolution to use indexed field contracts instead of per-call linear scans in `src/kernel/resolve-ref.ts`.
  - Removed global lazy cache path (`getRuntimeTableIndex` + `WeakMap`) and standardized on explicit `buildRuntimeTableIndex`.
  - Threaded prebuilt runtime table indexes through core runtime/evaluation paths (`apply-move`, `legal-moves`, `legal-choices`, `terminal`, `initial-state`, `trigger-dispatch`) so hot-path evaluation can consume precompiled index state.
  - Strengthened runtime index tests in `test/unit/runtime-table-index.test.ts`:
    - asserted indexed field contract lookup is present and typed.
    - added deterministic NFC-collision test proving first-declared runtime asset wins.
    - replaced cache-identity assertion with deterministic rebuild assertion.
- Deviations from original plan:
  - Original ticket assumed runtime table indexing itself was missing; reassessment showed it was already implemented and cached. Work was narrowed to the remaining accessor/index gap and test hardening.
  - Kept out timing-based performance assertions in favor of deterministic structural/behavioral tests.
- Verification results:
  - `npm run build` passed.
  - Targeted tests passed: `dist/test/unit/runtime-table-index.test.js`, `dist/test/unit/resolve-ref.test.js`, `dist/test/unit/eval-query.test.js`.
  - `npm test` passed.
  - `npm run lint` passed.
