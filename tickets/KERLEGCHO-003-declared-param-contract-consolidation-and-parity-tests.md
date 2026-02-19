# KERLEGCHO-003: Declared Param Contract Consolidation + Cross-Surface Parity Tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — refactor for robustness and extensibility
**Deps**: KERLEGCHO-001, KERLEGCHO-002

## Problem

Declared action param handling is currently spread across multiple legality/execution paths (`legalChoices*`, `legalMoves`, `applyMove`) with overlapping logic and different failure modes. This increases drift risk and makes regressions likely when one path changes.

To keep architecture clean and extensible, declared-param normalization/membership rules should have one canonical implementation with parity tests across all entry points.

## What to Change

**Files (expected)**:
- `packages/engine/src/kernel/` (new shared helper module for declared param contract)
- `packages/engine/src/kernel/legal-choices.ts`
- `packages/engine/src/kernel/legal-moves.ts`
- `packages/engine/src/kernel/apply-move.ts`
- `packages/engine/test/unit/kernel/legal-choices.test.ts`
- `packages/engine/test/unit/kernel/legal-moves*.test.ts` (or closest existing legal-moves unit file)
- `packages/engine/test/unit/kernel/apply-move.test.ts`

Create and adopt a canonical declared-param contract helper:

1. Centralize value normalization + domain membership checks for declared action params.
2. Use the helper in `legalChoices*`, `legalMoves` param enumeration gates (where applicable), and `applyMove` validation.
3. Document expected behavior for invalid encoding and out-of-domain values in one place.
4. Add explicit parity tests so a move accepted by one surface is not rejected by another for declared-param reasons.

## Invariants

1. Declared-param acceptance/rejection is consistent across `legalChoices*`, `legalMoves`, and `applyMove`.
2. No surface may return/emit a move template as valid if `applyMove` would reject it for declared-param contract reasons.
3. Canonical helper remains game-agnostic and query-driven (no per-game schema branches).
4. Refactor introduces no change to GameSpecDoc ownership boundaries (`GameSpecDoc` stays game-specific; `GameDef`/simulator remain agnostic).

## Tests

1. **Parity table tests**: same set of declared-param fixtures asserted across `legalChoices*`, `legalMoves`, and `applyMove`.
2. **Negative parity tests**: out-of-domain, wrong-shape, and non-encodable cases reject consistently across surfaces.
3. **Positive parity tests**: valid params accepted consistently and produce compatible move progression/execution.
4. **Regression**: existing kernel unit/integration suites for legal choices, legal moves, and apply move remain green.

