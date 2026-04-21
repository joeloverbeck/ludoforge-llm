# 140MICRODECPRO-014: Test suite regeneration (T0 migration consolidation + T1–T15 new tests) + performance gate (T14)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — adds ~15 new test files under `packages/engine/test/`; no source changes
**Deps**: `archive/tickets/140MICRODECPRO-012.md`, `archive/tickets/140MICRODECPRO-015.md`, `tickets/140MICRODECPRO-016.md`

## Problem

With implementation + retirement + docs complete, the full microturn test surface can now land. This ticket authors all new tests T1-T15 per spec 140 Testing Strategy, plus the T14 performance gate (deterministic probe-step proxy against FITL reference corpus), and audits that ticket 012's public legacy retirement, ticket 015's remaining internal authority migration, and ticket 016's residual policy-diagnostics cleanup are complete.

## Assumption Reassessment (2026-04-20)

1. Ticket 012 has landed, but post-review split the remaining stale policy-diagnostics/replay regression cleanup into ticket 016. This ticket audits the final T0 state after 015 and 016, rather than re-owning those residual migrations itself.
2. All 15 new T-series tests target paths explicitly named in spec 140 Testing Strategy sections (T1-T15).
3. `.claude/rules/testing.md` is the canonical authority for test-class markers — confirmed.
4. Spec 137's distillation rule governs promotion from `convergence-witness` to `architectural-invariant` — per reassessed spec 140.
5. Performance proxy methodology for T14: deterministic probe-step (per Specs 137, 138, 139), not wall-clock. The baseline is the pre-spec per-`applyMove` latency on equivalent seeds, already captured by earlier spec performance gates.

## Architecture Check

1. Testing-as-proof (F16): every new test is `architectural-invariant` per the reassessed spec's Edge Cases clarification. No convergence-witness seeds pinned; no trajectory-specific outcomes.
2. Engine-agnostic: tests use synthetic GameDef fixtures wherever possible. FITL seeds (123, 1002, 1010) are canary references; Texas Hold'em has its own corpus analog.
3. F14 compliant: no test imports a retired symbol. T10 is the retirement gate in test form.
4. F19 (new foundation): T15 asserts every action in the canary corpus has one of the six decision-context kinds; no compound shapes survive.

## What to Change

### 1. T0 audit (verify ticket 012's migration)

Re-check each file listed in spec 140 T0 table:

- Confirm deletions landed (four files should not exist).
- Confirm migrations applied — each migrated file's class marker is correct (`architectural-invariant` or fresh `convergence-witness` ID tied to spec 140, not spec 139).
- Where possible, promote convergence-witness to architectural-invariant per Spec 137 distillation.

No new work needed if ticket 012 landed cleanly; this audit produces a short confirmation report in the ticket Outcome.

### 2. T1 — Microturn publication invariant

Create `packages/engine/test/unit/kernel/microturn-publication.test.ts` with `// @test-class: architectural-invariant`. Assertions per spec T1.

### 3. T2 — Decision stack invariants

Create `packages/engine/test/unit/kernel/decision-stack-invariants.test.ts`. Assertions per spec T2 (push/pop, monotonicity, parent chain, turn grouping).

### 4. T3 — Atomic legal action contract

Create `packages/engine/test/unit/kernel/atomic-legal-actions.test.ts`. Direct-applicability assertion.

### 5. T4 — Effect-frame suspend/resume correctness

Create `packages/engine/test/unit/kernel/effect-frame-suspend-resume.test.ts`. The expanded version of ticket 001's prototype test — now runs against the production kernel.

### 6. T5 — Agent no-throw global invariant

Create `packages/engine/test/integration/agents-never-throw-microturn.test.ts`. Property test over (GameDef, state, seed, agent) tuples. Include FITL canary seeds 123, 1002, 1010.

### 7. T6 — Bounded termination over canary corpus

Create `packages/engine/test/integration/spec-140-bounded-termination.test.ts`. FITL + Texas corpora.

### 8. T7 — Replay identity over microturns

Create `packages/engine/test/determinism/spec-140-replay-identity.test.ts`. Regenerate all golden fixtures under spec-140 protocol with `traceProtocolVersion: 'spec-140'`.

### 9. T8 — Stochastic auto-advance

Create `packages/engine/test/unit/kernel/stochastic-auto-advance.test.ts`.

### 10. T9 — Hidden-information microturn safety

Create `packages/engine/test/integration/spec-140-hidden-information-safety.test.ts`. Texas Hold'em hole-card masking.

### 11. T10 — No-certificate invariant (F14 retirement gate)

Create `packages/engine/test/integration/spec-140-no-certificate.test.ts`. Grep-based assertion that zero references to certificate machinery exist in engine source.

### 12. T11 — PolicyAgent per-microturn evaluation

Create `packages/engine/test/unit/agents/policy-agent-microturn-evaluation.test.ts`.

### 13. T12 — Profile migration correctness

Create `packages/engine/test/integration/spec-140-profile-migration.test.ts`. For every migrated Category A+B profile, assert equivalent evaluation at the action-selection microturn against a seed corpus.

### 14. T13 — Compound-turn summary correctness

Create `packages/engine/test/integration/spec-140-compound-turn-summary.test.ts`.

### 15. T14 — Performance gate (deterministic proxy)

Create `packages/engine/test/performance/spec-140-compound-turn-overhead.test.ts`. Deterministic probe-step proxy per Specs 137/138/139 methodology. Assert ≤ 1.50× pre-spec baseline.

### 16. T15 — FOUNDATIONS conformance

Create `packages/engine/test/integration/spec-140-foundations-conformance.test.ts`. Covers F5, F10, F18, F19.

### 17. Regenerate determinism golden fixtures

Any fixture in `packages/engine/test/fixtures/` that ticket 006 regenerated — this ticket's T7 consumes them and asserts bit-identical replay.

## Files to Touch

- `packages/engine/test/unit/kernel/microturn-publication.test.ts` (new)
- `packages/engine/test/unit/kernel/decision-stack-invariants.test.ts` (new)
- `packages/engine/test/unit/kernel/atomic-legal-actions.test.ts` (new)
- `packages/engine/test/unit/kernel/effect-frame-suspend-resume.test.ts` (new)
- `packages/engine/test/unit/kernel/stochastic-auto-advance.test.ts` (new)
- `packages/engine/test/unit/agents/policy-agent-microturn-evaluation.test.ts` (new)
- `packages/engine/test/integration/agents-never-throw-microturn.test.ts` (new)
- `packages/engine/test/integration/spec-140-bounded-termination.test.ts` (new)
- `packages/engine/test/integration/spec-140-hidden-information-safety.test.ts` (new)
- `packages/engine/test/integration/spec-140-no-certificate.test.ts` (new)
- `packages/engine/test/integration/spec-140-profile-migration.test.ts` (new)
- `packages/engine/test/integration/spec-140-compound-turn-summary.test.ts` (new)
- `packages/engine/test/integration/spec-140-foundations-conformance.test.ts` (new)
- `packages/engine/test/determinism/spec-140-replay-identity.test.ts` (new)
- `packages/engine/test/performance/spec-140-compound-turn-overhead.test.ts` (new)
- `packages/engine/test/fixtures/` (regenerate any determinism goldens if needed)

## Out of Scope

- No source-code changes. All implementation tickets (003-012) must be complete.
- T0 *migration work* — already done in ticket 012; this ticket only audits completeness.
- Documentation — ticket 013.

## Acceptance Criteria

### Tests That Must Pass

1. Every new test file runs green via `node --test packages/engine/dist/test/...` (after build).
2. T10 — grep returns zero hits for retired certificate symbols.
3. T14 — performance proxy ≤ 1.50× pre-spec baseline.
4. T15 — FOUNDATIONS conformance passes F5, F10, F18, F19.
5. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. Every new test file has a `// @test-class:` marker on the first content line.
2. Every `convergence-witness` marker (if any) cites a fresh spec-140 witness ID, never a spec-139 ID.
3. No test pins a trajectory-specific outcome except as distillation into an architectural invariant, per Spec 137's rule.
4. Performance gate budget is the deterministic probe-step proxy, not wall-clock.

## Test Plan

### New/Modified Tests

All 15 new tests listed above, plus the T0 audit confirmation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e` — canary corpus.
4. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck`
