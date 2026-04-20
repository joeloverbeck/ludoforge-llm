# 140MICRODECPRO-009: D9 — Re-evolution campaign (Category C) — gate ticket

**Status**: DEFERRED
**Priority**: LOW
**Effort**: Large
**Engine Changes**: None — MAP-Elites campaign execution only; profile YAML updates
**Deps**: `tickets/140MICRODECPRO-008.md`

## Problem

Historical draft retained for series traceability only. On 2026-04-20 the user-approved boundary rewrite moved the live profile-capability cut into `140MICRODECPRO-007`. Any future policy-quality campaign now depends on the post-cut microturn-native profiles rather than this original split.

## Historical Resolution

Original re-evolution slice superseded by the merged boundary in `140MICRODECPRO-007` on 2026-04-20. Retained as a historical draft-series record only.

Profiles whose expressions depend on the retired two-phase scoring shape (Category C from I2) have no 1:1 microturn equivalent. Ticket 008 marks them with `# spec-140-category-c: requires re-evolution` YAML comments and preserves their pre-migration form.

This ticket runs a MAP-Elites re-evolution campaign against the new microturn-native policy evaluator to produce replacement expressions that meet baseline win-rate parity on the canary corpus.

**Gate condition**: Close this ticket with `Declined — no Category C expressions present` if ticket 002's I2 audit and ticket 008's refresh both report zero Category C classifications. This is the spec's own descope path for specs where the two-phase dependency does not materialize.

## Assumption Reassessment (2026-04-20)

1. MAP-Elites evolution pipeline exists — confirmed (referenced by spec 140 D9 and the broader roadmap).
2. Ticket 008 has landed and the Category C set is known.
3. Baseline win rates for each pre-migration profile are preserved as historical fixtures for comparison against re-evolved profiles.
4. Re-evolution may take multi-hour to multi-day depending on fitness landscape — spec explicitly documents this in Edge Cases.

## Architecture Check

1. Evolution-first (F2): this is exactly the use case the evolution pipeline was built for — data-driven expression improvement via YAML mutation.
2. Engine-agnostic: the re-evolution campaign runs the existing MAP-Elites tooling; no engine changes.
3. F14 compliant: re-evolved profiles *replace* the Category C comment blocks from ticket 008 in the same commit. No dual-profile coexistence.
4. Success criterion: each re-evolved profile meets or exceeds its pre-migration baseline win rate on the canary corpus. Below-baseline profiles remain commented-out until the campaign produces a working variant.

## What to Change

### 1. Re-evolution campaign setup

Create `campaigns/phase3-microturn/re-evolution/` subdirectory with:

- `campaign-plan.md` — lists each Category C profile, its pre-migration expression, its baseline canary win rate, and the evolution budget (max generations, max wall-clock).
- `seeds.json` — reproducible MAP-Elites seeds for the campaign.
- `harness.sh` — invokes the evolution pipeline per profile.

### 2. Execute MAP-Elites per Category C profile

For each profile, run the evolution campaign until one of:
- A candidate meets or exceeds baseline win rate on the canary corpus (success).
- The budget is exhausted without success (escalate — this ticket may require follow-up).

### 3. Commit winning expressions

Replace the `# spec-140-category-c: …` comment blocks in `data/games/fire-in-the-lake/92-agents.md` (and `data/games/texas-holdem/92-agents.md` if applicable) with the winning re-evolved expressions. Add the `microturnMigration: 'spec-140'` metadata flag to each newly-migrated profile.

### 4. Campaign report

Produce `campaigns/phase3-microturn/re-evolution/report.md` documenting:
- Per-profile evolution trajectory (generations, best-of-generation fitness, final winning expression).
- Canary-corpus win-rate comparison (pre-migration vs. re-evolved).
- Any profiles that failed to reach baseline — flag for follow-up spec.

## Files to Touch

- `campaigns/phase3-microturn/re-evolution/campaign-plan.md` (new)
- `campaigns/phase3-microturn/re-evolution/seeds.json` (new)
- `campaigns/phase3-microturn/re-evolution/harness.sh` (new)
- `campaigns/phase3-microturn/re-evolution/report.md` (new, end-of-campaign)
- `data/games/fire-in-the-lake/92-agents.md` (modify — replace Category C blocks with winning expressions)
- `data/games/texas-holdem/92-agents.md` (modify if applicable)

## Out of Scope

- Engine code changes.
- Any Category A or B profile — ticket 008 handles those.
- Improving pre-spec quality — the spec explicitly scopes this ticket to meeting baseline, not beating pre-spec (Edge Cases: "Re-evolved Category C profiles").
- T12 (profile migration correctness) — ticket 014.

## Acceptance Criteria

### Tests That Must Pass

1. For every re-evolved profile, the canary corpus (FITL seeds 123, 1002, 1010 at minimum) produces a win rate ≥ baseline.
2. `runGame` does not throw for any re-evolved profile on the canary corpus.
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all green.
4. If the gate condition (zero Category C profiles) was hit at ticket start, all assertions reduce to "no Category C blocks exist" — verifiable by grep.

### Invariants

1. No Category C YAML comment block survives in any `*-agents.md` file after the ticket completes (if the gate did not close).
2. Every re-evolved profile has `microturnMigration: 'spec-140'` metadata.
3. The campaign report documents each re-evolution decisively.

### Descope path

If no Category C expressions exist at ticket start:
- Update ticket Outcome to `Declined — no Category C expressions present after I2/ticket 008 audit`.
- Skip all file creations.
- Close without archival via the gate pathway described in `docs/archival-workflow.md`.

## Test Plan

### New/Modified Tests

- No new unit tests; verification is campaign-report + canary-corpus win-rate comparison.

### Commands

1. `campaigns/phase3-microturn/re-evolution/harness.sh` (per profile, iterative).
2. `pnpm -F @ludoforge/engine test:e2e` — canary corpus runs.
3. `grep -rn "spec-140-category-c" data/games/` — must return zero after campaign, or zero at start (gate close).
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
