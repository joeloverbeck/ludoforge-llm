# 179ACTSELPRE-005: Phase 2 — FITL ARVN witness + cookbook addendum

**Status**: BLOCKED by Spec 180 ordinary-operation successor `archive/tickets/180STDVECOBSROL-001.md`
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only (campaign profile YAML edit + docs).
**Deps**: `archive/tickets/179ACTSELPRE-004.md`

## Problem

Phase 2 of Spec 179 is the integration gate that proves the opt-in produces real signal on the FITL ARVN witness workload. Re-run the witness with `arvn-evolved.preview.outcomeGrantContinuation.enabled = true, extraDepthCap = 4, capClass: postGrant16` plus a re-added `penalizeOpponentMargin` consideration, compare trace readyRefStats against the Phase 0 baseline (ticket 001), and verify the spec's acceptance gate (§6): `distinct > 1` on >50% of decisions for both `currentMargin.nva` and `currentMargin.vc`, with avg range ≥ 0.5 each, AND ≤ 5% slow-tier wall-time regression versus the Spec 178 post-fix substrate.

Concurrently, update `docs/agent-dsl-cookbook.md` to document the new opt-in, the per-seat opponent ref surface (currently only `.self` is shown), and the partial-coverage warning. The cookbook addendum is mandatory per spec §5 Phase 2 acceptance.

## Assumption Reassessment (2026-05-17)

1. `docs/agent-dsl-cookbook.md:108-122` is the Preview Refs section that currently documents only `.self` per-seat refs — verified during brainstorm. The cookbook gap is exactly what the trigger report flagged.
2. `data/games/fire-in-the-lake/92-agents.md` is the `arvn-evolved` profile YAML — verified by Spec 180 and ticket 001's profile work. Adding the `preview.outcomeGrantContinuation` block + re-adding `penalizeOpponentMargin` is a YAML-only edit.
3. Ticket 001 produced `reports/179-phase-0-pre-opt-in-baseline.md` AND `campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` — this ticket consumes both for the Phase 2 comparison.
4. Tickets 002, 003, 004 have landed the schema, driver, and trace surface — this ticket exercises them end-to-end.

## Architecture Check

1. **Profile YAML is the opt-in surface** — engine-agnostic. No FITL-specific engine code is introduced. The `outcomeGrantContinuation` block is a generic profile capability; FITL just happens to be the first witness workload.
2. **Witness comparison uses checked-in baseline** (ticket 001's report) — the perf delta calculation is reproducible because both baseline and post-fix numbers are checked into `reports/`.
3. **Cookbook addendum documents the user-facing contract**, not the implementation. Per Foundation 14, no backwards-compat shims appear in the doc — the new field is described as-is.
4. **Acceptance gate is empirical, not assumed.** If the witness fails the gate (signal differentiation OR perf budget), the ticket pauses for the user — per spec §7 Out-of-Scope, the fallback is Spec 180-style direction B (separate `previewEffect.*` surface), but that's not in this ticket's scope. Failure is escalation, not silent acceptance.

## What to Change

### 1. Enable `outcomeGrantContinuation` on `arvn-evolved`

In `data/games/fire-in-the-lake/92-agents.md`, add to the `arvn-evolved` profile's `preview` block:

```yaml
preview:
  # ... existing fields (mode, budget, inner, etc.) ...
  outcomeGrantContinuation:
    enabled: true
    extraDepthCap: 4
    capClass: postGrant16
```

Re-add the `penalizeOpponentMargin` consideration + supporting `stateFeatures` / `candidateFeatures` (mirror the formulation from ticket 001 Phase 0; this is now a permanent profile change, not a measurement-only revert).

### 2. Run the post-opt-in witness

```bash
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs \
  --seeds 15 --trace-default all --concurrency 8
node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs
node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs
```

Capture wall-time, action distribution, and per-ref readyRefStats. Compare to `reports/179-phase-0-pre-opt-in-baseline.md`.

### 3. Author the Phase 2 witness report

Write `reports/179-phase-2-post-opt-in-witness.md` with:
- Date, repo HEAD SHA, profile version
- Wall-time (post-opt-in) vs. baseline → percentage delta
- Action distribution (post-opt-in) vs. baseline
- Per-ref readyRefStats: `currentMargin.nva` and `currentMargin.vc` columns (distinct counts, ratios, avg range) vs. baseline
- Acceptance gate verdict per spec §6:
  - `distinct > 1` on ≥ 50% of decisions for both `currentMargin.nva` AND `currentMargin.vc`: PASS / FAIL
  - Avg range ≥ 0.5 each: PASS / FAIL
  - Slow-tier wall-time regression ≤ 5%: PASS / FAIL
- New trace surface verification: `previewUsage.outcomeGrantContinuation` block present with `enabled: true`, expected exit-count totals.

### 4. Update `docs/agent-dsl-cookbook.md`

Three changes to the Preview Refs section (lines 108-122):

(a) Document the per-seat opponent ref surface that has existed since Spec 122 but was never cookbook-documented:
```markdown
**Per-seat preview refs**: `preview.victory.currentMargin.<seat>` and `preview.victory.currentRank.<seat>` accept any seat token, including opponents. By default (no `outcomeGrantContinuation` opt-in), opponent-margin refs may be **uniform across candidates** when the action's effects on opponent state live behind `outcomeGrantResolve` frames the bounded drive exits on. See the `outcomeGrantContinuation` opt-in below.
```

(b) Document the new opt-in:
```markdown
### `outcomeGrantContinuation` opt-in

Profiles that need opponent-effect visibility at action-selection scope can opt into a bounded post-grant drive continuation:

\`\`\`yaml
preview:
  # ... existing fields ...
  outcomeGrantContinuation:
    enabled: true
    extraDepthCap: 4
    capClass: postGrant16
\`\`\`

When enabled, the drive continues past the first `outcomeGrantResolve` frame up to `extraDepthCap` additional resolution steps. `capClass` is a named bounded-computation tier (Foundation 10) — `postGrant16` is the current registered class with a depth budget of 4. The trace surfaces per-decision aggregate exit counts via `previewUsage.outcomeGrantContinuation.exitCounts`.

**Cost**: per-candidate preview cost grows with effect-chain complexity. Profile workloads with measurable wall-time regression should validate the budget on their target workload before enabling this broadly. The red 005 witness validated only the wall-time subgate, not the opponent-signal or continuation-activation gates. Profiles without an opponent-aware authoring use case should not opt in.
```

(c) Partial-coverage warning:
```markdown
**Partial coverage warning**: When `outcomeGrantContinuation` is opted-in but a candidate's post-grant resolution exceeds `extraDepthCap`, the trace reports `previewDrive.kind = 'postGrantCap'` and the opponent-state-dependent preview refs may still be uniform (or have stale values) for that candidate. Treat `postGrantCap` as a Foundation 20 unavailable-status equivalent to `depthCap`; author considerations with explicit `previewFallback` (per Spec 162).
```

### 5. Confirm `preview.feature.X` opponent-tied features lift

Spec §7 notes that opponent-tied features (`preview.feature.vcGuerrillaCount`, etc.) *should* lift as a free side-effect of the driver change. Phase 2 should record observed behavior in the witness report (without making it a gate — only `currentMargin.<opp>` is gated). Spot-check 2-3 opponent-tied features in the trace and note their `distinct` counts in the report's Adjacent Findings section.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — opt-in block + `penalizeOpponentMargin` reinstated)
- `reports/179-phase-2-post-opt-in-witness.md` (new)
- `docs/agent-dsl-cookbook.md` (modify — three additions to lines 108-122 region)

## Out of Scope

- WASM-route alignment (ticket 006 — optional, parallel).
- Spec 180 standing-vector / ordinary-operation projection (separate spec, successor to this blocked witness).
- Tuning `extraDepthCap` beyond `postGrant16: 4` — Phase 2 kept this default fixed; ticket 007 classified the activation gap as a witness contract mismatch, so any future tuning requires a user-approved witness contract reset first.
- Migrating other profiles (`vc-evolved`, etc.) to opt in — `arvn-evolved` is the witness; other profiles opt in via separate tickets when they have an opponent-aware authoring use case.
- Spec 179 §7 Direction B fallback — `archive/tickets/179ACTSELPRE-009.md` selected Spec 180's integrated standing-projection route rather than a separate `previewEffect.*` namespace; not in scope for this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. Post-opt-in witness PASSES all three gates per spec §6:
   - `distinct > 1` on ≥ 50% of decisions for `currentMargin.nva` AND `currentMargin.vc`.
   - Avg range ≥ 0.5 on both refs.
   - Slow-tier wall-time regression ≤ 5% vs. Phase 0 baseline (ticket 001's report).
2. `reports/179-phase-2-post-opt-in-witness.md` exists with required content blocks (see §3 above).
3. Cookbook addendum lands at `docs/agent-dsl-cookbook.md` with all three changes (per-seat documentation, opt-in section, partial-coverage warning).
4. `previewUsage.outcomeGrantContinuation` block is present in post-witness traces with non-zero exit counts.
5. Engine test suite green: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Profile change is YAML-only — no engine source modifications introduced by this ticket.
2. Cookbook addendum reflects landed behavior, not aspirational behavior — every ref/field documented is exercised by the witness.
3. If acceptance gate fails, the ticket pauses for the user with diagnostic detail (1-3-1 rule); do NOT silently lower the gate.

## Test Plan

### New/Modified Tests

This ticket is witness-driven, not test-suite-driven. The new trace-surface and post-grant-continuation tests live in tickets 003 and 004; this ticket exercises the integration. The witness is a manual run with a written report, not a programmatic test.

### Commands

1. Witness run: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8`
2. Action distribution: `node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs`
3. ReadyRefStats: `node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs`
4. Wall-time comparison: read `reports/179-phase-0-pre-opt-in-baseline.md` wall-time number and compare to witness run.
5. Engine regression: `pnpm -F @ludoforge/engine test`
6. Full turbo: `pnpm turbo test`
7. Lint + typecheck: `pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-17)

Blocked, not archive-ready. User approved Option 3 after the red Phase 2 witness: preserve the red report, keep the opt-in/profile/cookbook substrate visible, and split a non-overlapping successor for the remaining witness activation repair. Ticket 007 later classified that remaining activation gap as a witness contract mismatch: the original ARVN operation witness does not exercise `outcomeGrantResolve`, which resolves pending event/free-operation grants.

What landed in this ticket:

- `data/games/fire-in-the-lake/92-agents.md` now enables `arvn-evolved.preview.outcomeGrantContinuation` with `extraDepthCap: 4` and `capClass: postGrant16`, and re-adds `penalizeOpponentMargin` plus the supporting opponent-margin features.
- `docs/agent-dsl-cookbook.md` documents per-seat opponent preview refs, the `outcomeGrantContinuation` opt-in, cost/trace expectations, and partial-coverage behavior without claiming the FITL ARVN witness passed.
- `reports/179-phase-2-post-opt-in-witness.md` records the decisive red 15-seed witness.
- `tickets/179ACTSELPRE-007.md` classified the activation gap as a witness contract mismatch.
- `archive/tickets/179ACTSELPRE-008.md` completed the user-approved Phase 2 witness contract reset and found no usable production FITL event/free-operation `outcomeGrantResolve` replacement witness.
- `archive/tickets/179ACTSELPRE-009.md` selected Spec 180 as the next ordinary-operation preview visibility surface.
- `archive/tickets/180STDVECOBSROL-001.md` owns the first focused failing witness before implementation.

Measured result:

- Witness command: `/usr/bin/time -f WALL_TIME_SECONDS=%e node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8`
- Wall time: `54.88s` vs Phase 0 `53.16s`, `+3.24%` (PASS against <= 5%).
- `currentMargin.nva`: `0 / 146` reporting decisions differentiated, avg range `0.00` (FAIL).
- `currentMargin.vc`: `16 / 146` reporting decisions differentiated, avg range `0.32` (FAIL).
- `previewUsage.outcomeGrantContinuation`: block present and enabled in `159 / 159` main-phase action-selection decisions, but `exitCounts.completed=0`, `postGrantCap=0`, `stochastic=0` (FAIL).
- TS-only one-seed probes with `--no-wasm` and with `--profile-completion arvn-evolved=agentGuided` also produced zero continuation counts, so the blocker is not classified as WASM-only.

Acceptance classification:

- Cookbook addendum: landed.
- Profile opt-in and `penalizeOpponentMargin`: landed as substrate, but the original operation witness is no longer valid closing proof for `outcomeGrantResolve`.
- Phase 2 signal gate: red.
- Phase 2 trace activation gate: red.
- Archive status: blocked and not archive-ready.
- Residual owner: `archive/tickets/180STDVECOBSROL-001.md` and the Spec 180 ticket chain.

Generated/schema fallout: none. This ticket changed profile YAML, docs, report, tickets, and spec prose only; no engine source/schema artifacts were modified.

Command ledger:

| ticket section | literal command/shorthand | ran directly/subsumed/split/replaced/not run | final citation |
| --- | --- | --- | --- |
| Test Plan | `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8` | run directly with `/usr/bin/time -f WALL_TIME_SECONDS=%e` wrapper | red witness report |
| Test Plan | `node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs` | run against preserved 15-seed trace dir | red witness report |
| Test Plan | `node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs` | run against preserved 15-seed trace dir | red witness report |
| Test Plan | wall-time comparison | run by report transcription against Phase 0 baseline | red witness report |
| Acceptance | `pnpm -F @ludoforge/engine test` | pending; required before any future terminal closeout after the ordinary-operation successor lands a replacement witness | blocked Phase 2 |
| Test Plan | `pnpm turbo test` | not run after red gate; blocked before terminal closeout | not final evidence |
| Test Plan | `pnpm turbo lint && pnpm turbo typecheck` | not run after red gate; blocked before terminal closeout | not final evidence |

008/009 reset update: the bounded production event/free-operation probe verified that current FITL event declarations can issue pending free-operation grants, but those grants are exposed as free-operation `actionSelection` moves rather than an `outcomeGrantResolve` frame. No replacement Phase 2 witness exists on the current production path. The red measured witness remains final evidence for the blocked handoff, not terminal completion. `archive/tickets/179ACTSELPRE-009.md` selected Spec 180's bounded standing-projection successor; `archive/tickets/180STDVECOBSROL-001.md` owns the first focused failing witness before any rerun can become closing proof.
