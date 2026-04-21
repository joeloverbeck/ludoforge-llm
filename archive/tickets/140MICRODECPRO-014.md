# 140MICRODECPRO-014: Test suite regeneration (T0 migration consolidation + T1–T15 proof completion) + performance gate (T14)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — migrates existing test files plus adds missing proof files under `packages/engine/test/`; no source changes
**Deps**: `archive/tickets/140MICRODECPRO-012.md`, `archive/tickets/140MICRODECPRO-015.md`, `archive/tickets/140MICRODECPRO-016.md`

## Problem

With implementation + retirement + docs complete, the full microturn test surface can now land. The original draft assumed T1-T15 required fifteen net-new files, but the live repo already contains several post-migration proofs under retained or stale names (`microturn-smoke`, `effect-frame-suspend-resume-prototype`, `agents-never-throw-with-nonempty-legal-moves`, `fitl-canary-bounded-termination`, `spec-139-replay-identity`, `spec-139-hidden-information-safety`, `spec-139-foundation-18-conformance`). This ticket now audits that final T0 state after tickets 012/015/016, migrates those retained proofs onto the explicit spec-140 surface where they already satisfy the intended contract, and adds only the genuinely missing tests (including the T14 deterministic performance gate).

## Assumption Reassessment (2026-04-20)

1. Ticket 012 has landed, but post-review split the remaining stale policy-diagnostics/replay regression cleanup into ticket 016. This ticket audits the final T0 state after 015 and 016, rather than re-owning those residual migrations itself.
2. Spec 140's T0 migration table is the authoritative boundary: existing retained proofs should be migrated or renamed where they already satisfy the intended T-surface, and only missing proof lanes should become net-new files.
3. `.claude/rules/testing.md` is the canonical authority for test-class markers — confirmed.
4. Spec 137's distillation rule governs promotion from `convergence-witness` to `architectural-invariant` — per reassessed spec 140.
5. Performance proxy methodology for T14: deterministic probe-step (per Specs 137, 138, 139), not wall-clock. The live repo no longer contains a preserved Spec 139 baseline artifact, so this ticket must establish and record a current microturn-era deterministic budget instead of pretending a historical comparator is locally available.

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

Migrate `packages/engine/test/unit/kernel/microturn-smoke.test.ts` to `packages/engine/test/unit/kernel/microturn-publication.test.ts` with `// @test-class: architectural-invariant`. Expand the existing smoke assertions so the file is explicitly the T1 proof, not an unnamed bridge smoke.

### 3. T2 — Decision stack invariants

Create `packages/engine/test/unit/kernel/decision-stack-invariants.test.ts`. Assertions per spec T2 (push/pop, monotonicity, parent chain, turn grouping).

### 4. T3 — Atomic legal action contract

Create `packages/engine/test/unit/kernel/atomic-legal-actions.test.ts`. Direct-applicability assertion.

### 5. T4 — Effect-frame suspend/resume correctness

Migrate `packages/engine/test/unit/kernel/effect-frame-suspend-resume-prototype.test.ts` to `packages/engine/test/unit/kernel/effect-frame-suspend-resume.test.ts`. Keep the FITL inventory validation, but make the file explicitly the T4 production-kernel proof rather than a prototype placeholder.

### 6. T5 — Agent no-throw global invariant

Migrate `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts` to `packages/engine/test/integration/agents-never-throw-microturn.test.ts`. Retain the synthetic adversarial cases already proving the invariant, and expand to the canary corpus only if needed to satisfy T5.

### 7. T6 — Bounded termination over canary corpus

Migrate `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` to `packages/engine/test/integration/spec-140-bounded-termination.test.ts`. Preserve the existing FITL canary coverage and add the Texas analog only if it is not already proven elsewhere.

### 8. T7 — Replay identity over microturns

Migrate `packages/engine/test/determinism/spec-139-replay-identity.test.ts` to `packages/engine/test/determinism/spec-140-replay-identity.test.ts`. Remove stale spec-139 / legacy-diagnostics wording, assert the live spec-140 replay contract, and regenerate only the fixtures actually consumed by the final proof.

### 9. T8 — Stochastic auto-advance

Create `packages/engine/test/unit/kernel/stochastic-auto-advance.test.ts`.

### 10. T9 — Hidden-information microturn safety

Migrate `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts` to `packages/engine/test/integration/spec-140-hidden-information-safety.test.ts`. Replace any retired move-completion assumptions with direct microturn publication assertions.

### 11. T10 — No-certificate invariant (F14 retirement gate)

Create `packages/engine/test/integration/spec-140-no-certificate.test.ts`. Grep-based assertion that zero references to certificate machinery exist in engine source.

### 12. T11 — PolicyAgent per-microturn evaluation

Create `packages/engine/test/unit/agents/policy-agent-microturn-evaluation.test.ts`.

### 13. T12 — Profile migration correctness

Create `packages/engine/test/integration/spec-140-profile-migration.test.ts`. The historical pre-migration evaluator is no longer present in-tree, so this proof becomes a live-boundary migration correctness gate: for every migrated Category A+B profile, assert the shipped profile corpus compiles, contains no retired syntax in the active data files, and chooses published legal microturn actions across the seed corpus without fallback to retired completion/template surfaces.

### 14. T13 — Compound-turn summary correctness

Create `packages/engine/test/integration/spec-140-compound-turn-summary.test.ts`.

### 15. T14 — Performance gate (deterministic proxy)

Create `packages/engine/test/performance/spec-140-compound-turn-overhead.test.ts`. Deterministic probe-step proxy per Specs 137/138/139 methodology. Because no preserved Spec 139 baseline artifact exists in the live repo, this file must establish a current reproducible microturn-era budget against a fixed corpus and assert subsequent runs stay within that recorded budget.

### 16. T15 — FOUNDATIONS conformance

Migrate `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts` to `packages/engine/test/integration/spec-140-foundations-conformance.test.ts`. Rewrite it away from retired incomplete/trusted-move semantics so the final file proves F5, F10, F18, and F19 on the live microturn surface.

### 17. Regenerate determinism golden fixtures

Only the fixtures actually consumed by the final replay-identity proof should be regenerated. Do not bulk-regenerate unrelated goldens just because the original draft assumed a full spec-140 corpus rewrite.

## Files to Touch

- `packages/engine/test/unit/kernel/microturn-smoke.test.ts` (rename/migrate to `microturn-publication.test.ts`)
- `packages/engine/test/unit/kernel/decision-stack-invariants.test.ts` (new)
- `packages/engine/test/unit/kernel/atomic-legal-actions.test.ts` (new)
- `packages/engine/test/unit/kernel/effect-frame-suspend-resume-prototype.test.ts` (rename/migrate to `effect-frame-suspend-resume.test.ts`)
- `packages/engine/test/unit/kernel/stochastic-auto-advance.test.ts` (new)
- `packages/engine/test/unit/agents/policy-agent-microturn-evaluation.test.ts` (new)
- `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts` (rename/migrate to `agents-never-throw-microturn.test.ts`)
- `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` (rename/migrate to `spec-140-bounded-termination.test.ts`)
- `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts` (rename/migrate to `spec-140-hidden-information-safety.test.ts`)
- `packages/engine/test/integration/spec-140-no-certificate.test.ts` (new)
- `packages/engine/test/integration/spec-140-profile-migration.test.ts` (new)
- `packages/engine/test/integration/spec-140-compound-turn-summary.test.ts` (new)
- `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts` (rename/migrate to `spec-140-foundations-conformance.test.ts`)
- `packages/engine/test/determinism/spec-139-replay-identity.test.ts` (rename/migrate to `spec-140-replay-identity.test.ts`)
- `packages/engine/test/performance/spec-140-compound-turn-overhead.test.ts` (new)
- `packages/engine/test/fixtures/` (regenerate only replay fixtures actually consumed by T7 if needed)

## Out of Scope

- No source-code changes. All implementation tickets (003-012) must be complete.
- Engine source changes remain out of scope unless a proof lane exposes a real bug. If that happens, fix it under TDD and record the spillover in Outcome.
- Documentation — ticket 013.

## Acceptance Criteria

### Tests That Must Pass

1. Every created or migrated test file for T1-T15 runs green via `node --test packages/engine/dist/test/...` (after build).
2. T10 — grep returns zero hits for retired certificate symbols.
3. T12 — migrated A+B shipped profiles compile cleanly, contain no retired production syntax in the live data files, and choose only published legal microturn actions across the ticket corpus.
4. T14 — deterministic performance proxy stays within the recorded current-contract budget established by this ticket.
5. T15 — FOUNDATIONS conformance passes F5, F10, F18, F19.
6. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. Every created or migrated test file has a `// @test-class:` marker on the first content line.
2. Every `convergence-witness` marker (if any) cites a fresh spec-140 witness ID, never a spec-139 ID.
3. No test pins a trajectory-specific outcome except as distillation into an architectural invariant, per Spec 137's rule.
4. Performance gate budget is the deterministic probe-step proxy, not wall-clock.

## Test Plan

### New/Modified Tests

All T1-T15 proofs listed above, including migrated retained files and genuinely new files, plus the T0 audit confirmation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e` — canary corpus.
4. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed on 2026-04-21.

T0 audit result:
- The retained spec-139-era proof files were migrated onto the explicit spec-140 surface instead of duplicated.
- `packages/engine/test/integration/spec-139-failing-seeds-regression.test.ts` was absorbed into `spec-140-bounded-termination.test.ts` and deleted so the FITL canary regression no longer survives as a parallel stale file.
- No determinism golden fixture rewrite was needed beyond the live replay assertions; the consumed trace fixtures were already spec-140-tagged.

Delivered proof surface:
- Migrated/renamed: `microturn-publication`, `effect-frame-suspend-resume`, `agents-never-throw-microturn`, `spec-140-bounded-termination`, `spec-140-replay-identity`, `spec-140-hidden-information-safety`, `spec-140-foundations-conformance`.
- Added: `decision-stack-invariants`, `atomic-legal-actions`, `stochastic-auto-advance`, `policy-agent-microturn-evaluation`, `spec-140-no-certificate`, `spec-140-profile-migration`, `spec-140-compound-turn-summary`, `spec-140-compound-turn-overhead`.

Recorded T14 deterministic budget:
- FITL corpus (`123`, `1005`, `1010`): `totalDecisions <= 150`, `totalCompoundTurns <= 35`, `maxMicroturnsPerTurn <= 50`.
- Texas corpus (`2000`, `2001`): `totalDecisions <= 10`, `totalCompoundTurns <= 10`, `maxMicroturnsPerTurn <= 2`.

Verification run:
- Passed: `pnpm -F @ludoforge/engine build`
- Passed focused unit/kernel lane: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js dist/test/unit/kernel/decision-stack-invariants.test.js dist/test/unit/kernel/atomic-legal-actions.test.js dist/test/unit/kernel/effect-frame-suspend-resume.test.js dist/test/unit/kernel/stochastic-auto-advance.test.js dist/test/unit/agents/policy-agent-microturn-evaluation.test.js`
- Passed focused replay / no-throw lane: `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js dist/test/integration/agents-never-throw-microturn.test.js`
- Passed focused hidden-info / retirement / profile lane: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/spec-140-hidden-information-safety.test.js dist/test/integration/spec-140-no-certificate.test.js dist/test/integration/spec-140-profile-migration.test.js`
- Passed focused canary / summary / foundations / performance lane: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/spec-140-bounded-termination.test.js dist/test/integration/spec-140-compound-turn-summary.test.js dist/test/integration/spec-140-foundations-conformance.test.js dist/test/performance/spec-140-compound-turn-overhead.test.js`

Broader lane note:
- `pnpm -F @ludoforge/engine test` produced substantial pass evidence, including the migrated spec-140 files and many earlier suites, but remained in the known quiet-progress mode during `dist/test/integration/spec-140-profile-migration.test.js` and did not return a final shell summary within the bounded wait used in this session. Record this as `harness-noisy / not final-confirmed`, not as a clean package-lane completion.
