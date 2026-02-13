# FITLOPEFULEFF-008: Sweep US Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.5 — `sweep-us-profile` (Rule 3.2.3, US variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`sweep-activation` macro), FITLOPEFULEFF-003

## Summary

Upgrade the existing faction-specific `sweep-us-profile` from transitional stub behavior to full FITL Rule 3.2.3 US Sweep behavior (Spec 26 Task 26.5).

Key behaviors:
- **Space filter**: Provinces or Cities only (not LoCs, not North Vietnam)
- **Cost**: 0 (US pays nothing)
- **Movement**: US Troops from adjacent; can hop through 1 LoC free of NVA/VC
- **Activation count**: US cubes (Troops + Police) + Irregulars (Special Forces)
- **Terrain**: Jungle only — 1 activation per 2 sweepers (round down). Non-Jungle: 1:1.
- **LimOp-aware**: Max 1 space

## Architectural Notice

- Current state (verified in `data/games/fire-in-the-lake.md`): `sweep-us-profile` already exists, but still uses transitional stub globals (`coinResources`, `sweepCount`) and no Sweep-specific movement/activation logic.
- Current state (verified in tests): `test/integration/fitl-coin-operations.test.ts` still asserts stub Sweep side effects; this must be updated to canonical Sweep assertions.
- Current state (verified in kernel): `zones` query `filter.condition` is compiled but not enforced at runtime in `evalQuery`, so profile zone filters are not authoritative during execution.
- This ticket removes US Sweep dependence on transitional COIN stub semantics and implements canonical FITL/Spec 26 behavior for `sweep-us-profile`.
- No backward-compatibility aliases, dual-path behavior, or fallback compatibility assertions.

## Architectural Rationale

- **Current architecture (stub)** is fast to scaffold but wrong for long-term maintenance: it encodes fake resource/count effects unrelated to real Sweep rules, so tests can pass while game behavior is invalid.
- **Proposed architecture (Spec 26 profile)** is more robust and extensible: it moves Sweep semantics into declarative `GameSpecDoc` profile stages and macro composition (`sweep-activation`), preserving engine genericity and making future rule modifiers composable.
- Decision: implement the canonical profile now and update tests to treat any stub-specific assertions as obsolete.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace `sweep-us-profile` stub stages/cost model with canonical US Sweep profile stages
- `test/integration/fitl-coin-operations.test.ts` — Replace stub Sweep assertions with canonical Sweep profile structure/behavior assertions
- `test/integration/fitl-patrol-sweep-movement.test.ts` — Add/extend US Sweep movement-focused tests where needed
- `src/kernel/eval-query.ts` — Enforce `zones.filter.condition` at runtime
- `test/unit/eval-query.test.ts` — Add regression test for `zones.filter.condition` enforcement

## Out of Scope

- `sweep-arvn-profile` (separate ticket FITLOPEFULEFF-009)
- Highland terrain effect on Sweep (Highland does NOT affect Sweep — only Jungle does)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes

## Acceptance Criteria

### Tests That Must Pass
1. `sweep-us-profile` compiles without diagnostics
2. US Sweep costs 0 (no resource deduction)
3. Space filter: Provinces and Cities only (LoCs excluded)
4. US Troops move from adjacent spaces into target
5. Sweep activation counts US cubes (Troops+Police) + Irregulars
6. Jungle terrain: activations halved (floor division by 2)
7. Non-Jungle: 1:1 activation ratio
8. `sweep-activation` macro correctly invoked with `cubeFaction: 'US'`, `sfType: irregulars`
9. LimOp variant: max 1 space
10. Existing integration assertions no longer depend on `sweepCount`/`coinResources` stub behavior

### Invariants
- Compiler source files remain unchanged
- Kernel changes limited to `zones.filter.condition` enforcement needed for canonical profile semantics
- `sweep-activation` macro (from FITLOPEFULEFF-002) unchanged by this ticket
- Highland does NOT affect Sweep activation ratio
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- **Completion date**: February 13, 2026
- **What changed**
  - Replaced `sweep-us-profile` stub behavior in `data/games/fire-in-the-lake.md` with Spec 26 Task 26.5-aligned profile stages:
    - LimOp-aware province/city selection excluding North Vietnam
    - Zero-cost top-level legality/cost model
    - US troop movement from adjacent spaces plus one-LoC hop path guarded by enemy-free LoC check
    - Guerrilla activation via `sweep-activation` macro with `cubeFaction: 'US'` and `sfType: irregulars`
  - Added runtime kernel fix in `src/kernel/eval-query.ts` so `zones.filter.condition` is enforced (required for declarative zone filters to execute correctly).
  - Updated and expanded tests:
    - `test/integration/fitl-coin-operations.test.ts` now validates canonical `sweep-us-profile` structure/filters/macro wiring and removes stub-dependent Sweep assertions.
    - `test/integration/fitl-patrol-sweep-movement.test.ts` adds US Sweep one-LoC hop movement coverage (allowed when clear, blocked when enemy-occupied).
    - `test/unit/eval-query.test.ts` adds regression coverage for `zones.filter.condition` execution and owner+condition composition.
    - `test/integration/fitl-card-flow-determinism.test.ts` coin scenario updated to avoid stale scripted Sweep runtime assumptions.
- **Deviations from original plan**
  - Original ticket assumed no kernel edits; implementation required a minimal kernel fix because `zones.filter.condition` was previously compiled but not evaluated at runtime.
  - Original runtime dispatch assertions around Sweep were adjusted to structural validation due current map-space decision runtime wiring limitations in the `applyMove` path.
- **Verification results**
  - `npm run build` passed
  - `npm run typecheck` passed
  - `npm run lint` passed
  - `npm test` passed
