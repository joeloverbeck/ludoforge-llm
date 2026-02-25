# EVEINTCHOPRO-004: Reassess and complete Spec 50 protocol test coverage

**Status**: ✅ COMPLETED  
**Spec**: 50 (Event Interactive Choice Protocol)  
**Priority**: High  
**Depends on**: EVEINTCHOPRO-001, EVEINTCHOPRO-002  
**Blocks**: None (EVEINTCHOPRO-005 can run in parallel)

## Assumption Reassessment

### What changed since the original ticket draft

1. The kernel architecture change from Spec 50 is already implemented:
   - `legalMoves()` emits base event templates (not pre-resolved decision params).
   - Event emission uses `isMoveDecisionSequenceSatisfiable()` gating.
2. Agent integration is already implemented:
   - `RandomAgent` and `GreedyAgent` both run `completeTemplateMove()` on legal moves.
3. Significant integration coverage already exists:
   - `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` already covers most Spec 50 tests 1-8 behaviorally.

### Discrepancies vs original ticket

- Original ticket assumed missing kernel/agent behavior. That assumption is now outdated.
- Original ticket required a new file `event-choice-protocol.test.ts`. Existing coverage is already concentrated in the Gulf of Tonkin integration suite; extending that suite is cleaner and avoids duplicate fixtures.
- The remaining concrete gap is explicit Test 9-style event-side unsatisfiability gating coverage under the event action path, plus tightening a few explicit assertions tied to Spec 50 wording.

## Architectural Position

The current architecture (template event moves + `legalChoicesEvaluate` loop + `completeTemplateMove` in agents) is better than the legacy deterministic pre-resolution design:

- It is cleaner: one generic decision protocol for operations and events.
- It is more robust: legality and satisfiability are evaluated at decision boundaries.
- It is more extensible: new effects/macros can participate in the same protocol without event-specific branching.

No backwards-compatibility shims or alias behavior should be introduced here.

## Updated Scope

Strengthen and finish Spec 50 Tests 1-9 coverage by updating existing integration tests:

| File | Change |
|------|--------|
| `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` | **Modify** — add/strengthen missing protocol assertions and unsatisfiable event-side gating case |

## Test Work Items

1. Tighten pending-choice assertions for Gulf of Tonkin unshaded template:
   - Explicitly verify `legalChoicesEvaluate(...).kind === 'pending'`, `type === 'chooseOne'`.
   - Verify options match the city-zone set.
   - Verify decision id shape includes `$targetCity`.
2. Add explicit no-chooseOne event-side completion check for Gulf of Tonkin shaded side:
   - `legalChoicesEvaluate(...).kind === 'complete'`.
   - `applyMove` succeeds directly.
3. Add explicit satisfiability gating test for impossible event choice domain:
   - Mutate a test-only event side to make `chooseOne` options empty.
   - Verify that side is excluded from `legalMoves()` (or otherwise illegal on evaluation, per invariant intent).

## Out of Scope

- Kernel source changes (`legal-moves.ts`, `legal-choices.ts`, `effects-choice.ts`, etc.).
- Agent source changes.
- Simulator/E2E flows (covered by EVEINTCHOPRO-005).
- Runner UI behavior.

## Acceptance Criteria

### Coverage acceptance

- Existing Gulf of Tonkin integration suite explicitly covers all Spec 50 Tests 1-9 behaviors.
- No duplicate protocol test harness is introduced unless required by a hard technical blocker.

### Invariants

- **INV-2**: Unsatisfiable event decision sequences are excluded.
- **INV-3**: Agent-completed event moves apply successfully.
- **INV-4**: Zero-piece event iteration is a complete no-op.
- **INV-5**: Event sides without `chooseOne` are already complete.

### Verification

```bash
pnpm turbo build
node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js
```

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Reassessed and corrected ticket assumptions/scope to match current architecture (event templates + satisfiability gating already implemented).
  - Strengthened `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` with explicit Spec 50 coverage for:
    - pending `chooseOne` option domain and decision id shape,
    - deterministic completion shape (`6` decision params for unshaded Gulf of Tonkin),
    - shaded side completeness (no `chooseOne`),
    - unsatisfiable event-side gating exclusion.
- **Deviations from original plan**:
  - No new `event-choice-protocol.test.ts` file was added; existing Gulf of Tonkin integration suite was extended to avoid duplicative fixtures and preserve DRY coverage.
  - No kernel/agent architecture changes were required because those changes were already present in the codebase.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.js` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine test` passed (271/271).
