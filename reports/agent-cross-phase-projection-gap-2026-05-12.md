# Agent Cross-Phase Projection Gap — Preview Reach Across Phase Boundaries

**Date**: 2026-05-12
**Reported from**: `fitl-arvn-agent-evolution` improve-loop campaign, exp-005 through exp-010 (worktree `.claude/worktrees/improve-fitl-arvn-agent-evolution`, branch `improve/fitl-arvn-agent-evolution`)
**Status**: Open — handoff to ChatGPT-Pro for deep research alongside `docs/FOUNDATIONS.md`
**Severity**: Medium — current arvn-evolved profile is functional at `compositeScore=-3.5333` via a hand-tuned static-boost prior; the gap is a quality-of-life improvement, not a blocker
**Prior related reports**:
- `reports/agent-candidate-param-discrimination-gap-2026-05-11.md` — addressed by spec-166 (PR #255); candidate-param refs now resolve
- `reports/agent-candidate-param-proposal.md` — external deep-research proposal
- `reports/fitl-arvn-post-spec-166-plateau-2026-05-12.md` — preceding-session campaign findings; recommended Option B (`continuedDeepening` + `deep1024`)
- `reports/preview-inner-choosenstep-architectural-gap-2026-05-07.md` — preceding gap report resolved by spec 164
- `reports/projected-state-lookup-refs-2026-05-10.md` — preceding gap report resolved by spec 165
- `reports/spec-164-deepening-benchmarks-20260510.md` — spec 164 benchmarks
**Performance constraint**: harness runtime for 15 seeds is currently ~13 minutes post-deep1024. Any solution must respect this budget; bytecode/WASM acceleration is the preferred cost-mitigation path because the existing policy VM and preview-drive infrastructure already runs in Rust WASM (`packages/engine-wasm/policy-vm/`).

---

## 1. Executive summary

The `fitl-arvn-agent-evolution` campaign has plateaued at `compositeScore = -3.5333` (`avgMargin = -5.5333`, `wins = 3/15`) after exp-005 successfully applied `continuedDeepening` + `deep1024` to `arvn-evolved.preview.inner`. Five follow-up structural attempts — including weight tuning, conditional considerations, projected-control-population candidateFeatures, and a Govern-boost ablation — failed to improve the metric further.

The most informative follow-up was exp-010, which **removed `preferGovernWeighted` entirely** from `arvn-evolved` and regressed the campaign by `-5.4` composite points (`-3.5333 → -8.9333`, wins `3 → 2`). This proved that the static `preferGovernWeighted=1000` boost is **load-bearing**, even with deep1024-enhanced preview signal in place. Empirically: **non-Govern actions show higher projected margins in the inner preview than Govern, but those projections do not survive game evolution.**

The mechanism: preview's synthetic-completion driver resolves the immediate effects of an action (typically up to 16 chooseN/chooseOne frontiers via spec 164 `deep1024`) but does NOT advance through intervening factions' main-phase turns or reach the next **Coup phase**, which is where ARVN-relevant state changes consolidate. Specifically:

- ARVN plays **Train** → places 3 ARVN troops in some zone. The control flip from that placement (which is what increases `coinControlPop` and therefore ARVN's margin) is computed only after the next Coup phase resolves redeployments + pacification.
- ARVN plays **Govern** → increments `Patronage` by 1. The Patronage gain is immediate; the preview sees it correctly.
- Therefore preview consistently undervalues Govern relative to actions whose immediate placements look impactful but only consolidate at Coup.

The static `preferGovernWeighted=1000` acts as a **compensating prior** for this systematic preview bias. It's a hand-tuned heuristic that does the work a cross-phase projection would do automatically.

**The architectural gap is real but distinct from spec 166**:
- Spec 166 (just merged): exposes typed-scalar candidate params at action-selection scope. State-local, no preview. Resolves "same-action variant discrimination" (event side, branch).
- This gap: **preview cannot project through phase boundaries** (main-phase actions of intervening factions → Coup-phase resolution). It is closest in spirit to spec 164 (which extended preview depth within a single action's effect tree) but operates at a fundamentally different layer.

This document specifies the gap in detail, surveys three solution shapes (A: cross-phase preview, B: phase-anchored heuristic state features, C: phase-cycle awareness refs), analyses the computational cost of each against the campaign's 13-minute harness budget, and flags open research questions about Rust/WASM acceleration paths.

---

## 2. Empirical evidence from this campaign

### 2.1 The exp-010 ablation result

Exp-010 removed `preferGovernWeighted` from `arvn-evolved.use.considerations` (no replacement). All other state was held constant (deep1024 + continuedDeepening enabled per exp-005's ACCEPT).

Result:

| Metric | Pre-ablation (exp-005) | Post-ablation (exp-010) | Δ |
|---|---|---|---|
| compositeScore | -3.5333 | -8.9333 | **-5.4** |
| avgMargin | -5.5333 | -10.2667 | -4.7 |
| wins | 3 / 15 | 2 / 15 | -1 |

This is a major regression. Even with the architecturally improved deep1024 preview, Govern does not win on preview-margin alone. The +1000 static boost is essential.

### 2.2 What the preview sees and doesn't see

From the seed-1000 trace at the first action-selection decision (action distribution: 9 candidates including govern, event ×3 variants, train, patrol, raid, sweep, transport, pass):

| Action | Score with `preferGovernWeighted=1000` | Score without (extrapolated) | Preview margin component |
|---|---|---|---|
| govern | -3500 | -4500 | ≈ -4500 (project of "play Govern, +1 patronage") |
| event (3 variants) | -4000 | -4000 | ≈ -4000 (project "play event, various effects within depth-16") |
| train | -4000 | -4000 | ≈ -4000 (project "place 3 ARVN, control unchanged immediately") |
| patrol/raid/sweep/transport | -4500 | -4500 | ≈ -4500 |

Without the +1000 boost, **events tie or beat Govern** on projected margin alone. The preview thinks events deliver more immediate margin than Govern's +1 Patronage. But playing more events regresses the metric (per exp-002, exp-007). The static boost compensates.

### 2.3 Confirmation via `preferControlPopGain` (exp-009)

Exp-009 added a `projectedControlPopGain` candidateFeature reading `preview.feature.coinControlPop` delta + a `preferControlPopGain` consideration at `scopes: [move]` weight 500. The intent was to boost actions that build COIN-controlled population.

Trace inspection on seed 1000:
- The consideration fired **222 times** across action-selection decisions
- Non-zero contributions appeared **only on coup-phase forced actions** (`coupArvnRedeployPolice`, etc.) — and they were all *negative* (`-500` each), reflecting temporary `coinControlPop` drops during redeploy
- Main-phase action candidates (`govern`, `train`, `event`, etc.): **contribution = 0** for all

The signal is silent at action-selection scope for main-phase actions because **`coinControlPop` does not change within deep1024's depth-16 reach for those actions**. The control flip happens during Coup-phase resolution, which the preview cannot reach.

### 2.4 Cumulative experimental evidence

10 experiments completed during this campaign session:

| Exp | Change | Status | Δ from best |
|---|---|---|---|
| baseline | post-spec-166 | BASELINE | -3.8 |
| exp-001 | `avoidShadedEvent` (spec-166 cookbook) | REJECT | -0.13 |
| exp-002 | `preferEvent` + `avoidShadedEvent` combined | REJECT | -0.13 |
| exp-003 | remove `preferOptionProjectedMargin` | CRASH (structural coupling with `preview.inner`) | — |
| exp-004 | `governWeight 1000 → 500` | NEAR_MISS (zero behavioral change) | 0 |
| **exp-005** | **`continuedDeepening` + `deep1024`** | **ACCEPT** | **+0.27** |
| exp-006 | `discourageGovernWhenPatronageHigh` (gt 30, -500) | NEAR_MISS (fires only 2 of 118 Govern picks) | 0 |
| exp-007 | `preferEvent` (eventWeight=500) over deep1024 | REJECT (+2 bad event picks: card-10, card-8) | -0.13 |
| exp-008 | `projectedMarginWeight 300 → 600` | NEAR_MISS (argmax invariant under scalar multiplication of a single consideration) | 0 |
| exp-009 | `preferControlPopGain` candidateFeature + consideration | NEAR_MISS (silent at action-selection scope) | 0 |
| exp-010 | remove `preferGovernWeighted` | REJECT (**-5.4**) | **massive** |

The pattern: structural preview improvements work (deep1024 = +0.27); weight/conditional tweaks at action-selection scope produce zero effect or regress; the static Govern boost is irreplaceable.

---

## 3. The architectural gap — specification

### 3.1 Current preview-driver capabilities

The agent DSL exposes the following preview-derived refs at action-selection scope (`scopes: [move]`):

| Ref family | What it reads | Where the synthetic completion stops |
|---|---|---|
| `preview.victory.<...>` | Projected scalar victory metrics (margin, faction control, etc.) | After resolving the action's effect tree to depth `deep.depthCap` (default 16 with `deep1024` cap class) |
| `preview.feature.<stateFeatureName>` | Projected state-feature values (e.g., `coinControlPop`, `patronage`) | Same depth — reads the state-feature against the projected post-action state |
| `preview.var.<varName>` | Projected game-variable values | Same depth |
| `preview.option.delta.<...>` | Per-option deltas at microturn (chooseN/chooseOne) frontiers | Within the inner-preview budget; spec 164 `deep1024` allows up to depth 16 per ladder |

The synthetic-completion driver is implemented in `packages/engine/src/agents/policy-eval.ts` (action-selection scope) and `packages/engine/src/agents/policy-preview-drive.ts` (inner preview). The Rust/WASM port is at `packages/engine-wasm/policy-vm/src/preview_drive.rs` (379 lines).

**Key limitation**: the driver is bounded by `deep.depthCap` chooseN/chooseOne frontier descents **within a single action's effect tree**. It does NOT:

1. Advance the simulator through intervening factions' main-phase turns
2. Reach the next Coup phase (which would require simulating ~6+ main-phase decisions plus the coup resolution itself)
3. Account for cumulative state changes across multiple actions

The driver resolves to the end of the action's effect resolution — *not* to the end of the round, the next eligibility window, the next coup phase, or any other game-phase boundary.

### 3.2 What FITL's victory pathway requires the preview to see

ARVN's victory formula: `COIN-Controlled Population + Patronage > 50`. Margin = the LHS - 50.

For ARVN to choose between actions intelligently, the agent needs to project both terms:

| Term | Action that increments it | Projection latency within current architecture |
|---|---|---|
| Patronage | Govern (+1 per use), certain events | **Immediate** — `preview.feature.patronage` resolves correctly at depth 1 |
| COIN-Controlled Population | Train (places ARVN troops → may flip control), Patrol (moves Police, removes guerrillas), Sweep (activates guerrillas), Assault (removes enemies), certain events, coup-phase redeploys | **Latent** — the control flip happens via state-evaluation at the end of effect resolution, often only after Coup-phase redeploys complete |

So Patronage-gain actions are correctly previewed; COIN-Controlled-Population-gain actions are systematically underestimated because their immediate-effect projection doesn't yet show the control flip.

### 3.3 The systematic preview bias

When the preview compares actions:

- **Govern**: projects `+1 Patronage`. Margin delta ≈ `+1` per Govern.
- **Train**: projects `+3 ARVN troops in zone X`. Margin delta: depends on whether zone X flips control during this synthetic completion. Usually it doesn't, so margin delta ≈ `0`. (After the next Coup, it might be `+population(X)` if zone X became COIN-controlled — but the synthetic completion stops before then.)
- **Event card-87 unshaded** ("Place 3 ARVN within 3 of Hue + Active Support shift"): projects 3 ARVN placements; same latency as Train. Margin delta ≈ `0` in preview.
- **Event card-87 shaded** ("Replace 2 ARVN with 2 VC + Patronage +4 or -4"): projects `+4 Patronage`. Margin delta ≈ `+4` in preview — looks great!

The preview-bias direction: actions that produce **immediate, ledger-level state changes** (Patronage delta, Resource delta) project well; actions that produce **placement/control changes** (Train, Patrol, troop-placement events) project as roughly zero-delta and lose by comparison.

The hand-tuned static boost `preferGovernWeighted=1000` reflects the *correct* long-run value of Govern that the preview underestimates. Other static boosts (`trainWhenControlLow=500`) reflect the same insight for Train under specific game-state conditions. These boosts are **operator-encoded long-term priors**, not bugs.

### 3.4 What "Coup-phase outcome projection" would mean

A cross-phase projection mechanism would let preview project through enough subsequent state evolution that:

- The Train troop placement's eventual control-flip would be reflected in `preview.feature.coinControlPop`
- The Patrol guerrilla-removal's eventual support-shift would be reflected in `preview.victory.currentMargin.self`
- Event effects whose value materializes at Coup (capability shadings, redeploys, support shifts) would be visible

The mechanism would replace the hand-tuned static boost with an automatic projection of long-term value. ARVN's choice between Govern vs. Train would then be a fair comparison on projected margin alone.

This is **not** an extension of spec 166 (which exposes already-published candidate params; no preview involved). It is closest in spirit to **spec 164** (which extended preview depth within a single action's effect tree), but differs because the relevant boundary is a game-phase boundary, not a chooseN-ladder depth.

---

## 4. Three implementation shapes

Each option is a candidate path. They are not mutually exclusive; (B) and (C) in particular can compose to approximate (A) at lower cost.

### 4.1 Option A — Cross-phase preview (true projection)

Extend the synthetic-completion driver to advance through main-phase actions of intervening factions until a declared game-phase boundary (e.g., next Coup phase or next eligibility-window reset). Implement as a new cap class — `deep4096`, `coupHorizon`, etc. — with explicit cost budgeting.

**YAML shape (proposed)**:

```yaml
preview:
  inner:
    chooseNStep: true
    chooseOne: true
    maxOptions: 8
    chooseNBeamWidth: 1
    depthCap: 4
    strategy: continuedDeepening
    capClass: deep1024
    continuedDeepening:
      broad: { depthCap: 4 }
      deep: { depthCap: 16, trigger: [allRequestedRefsDepthCapped], rootPolicy: allRootsWithinCap }
  outer:                          # NEW — cross-phase projection at outer (action-selection) scope
    crossPhaseProjection: true
    horizon:
      kind: untilPhase
      phaseId: coup               # generic phase id; not FITL-specific
    capClass: outerCrossPhase4096 # new cap class
    opponentPolicy:
      strategy: deterministicBaseline   # use baseline profiles to simulate opponents
```

**What the engine has to do**: at action-selection time, for each candidate, run the kernel forward through subsequent factions' turns (using each faction's baseline profile as the deterministic stand-in policy) until the declared phase boundary is reached or the budget is exhausted. Then resolve `preview.victory.*` / `preview.feature.*` against the projected state.

**Foundation alignment**:
- §1 Engine Agnosticism — must use generic phase-id (`coup`, `cleanup`, etc.) from game data, not hardcode "FITL".
- §7 Specs Are Data, Not Code — the projection trigger must be a declarative condition (`untilPhase`, `untilNextActor`, etc.), not arbitrary code.
- §10 Bounded Computation — strictly: needs `opponentPolicy` declaration (deterministic), `capClass` budget, depth/turn ceiling, and explicit unavailability when the budget is exceeded.
- §20 Preview Signal Integrity — if the projection can't reach the phase boundary within budget, the ref must be marked unavailable. `previewFallback` rules apply.
- §6 Schema Ownership Stays Generic — the `phaseId` enum must come from each game's GameSpecDoc, not be hardcoded.
- §17 Strongly Typed Domain Identifiers — `phaseId` should be a typed scalar (similar to `ZoneId`, `PlayerId`).

**Cost analysis**: for FITL, the average distance from any main-phase decision to the next Coup is roughly 6 main-phase actions (varies by game state and card sequence). Each main-phase action involves an inner-preview of comparable cost to today's per-decision preview. Naive cost: `6 × current_per_decision_cost`. With deep1024 at ~968 per chooseN/chooseOne ladder, and roughly 1-2 ladders per main-phase action, the cross-phase budget would need to be in the ~10,000-50,000 range per candidate — **20-50× current cost**.

At today's 13-minute harness runtime, a naive Option A would push runtime to **4-12 hours**, which is far outside the campaign's iteration budget. Mitigation paths in §5 below.

**Implementation risk**: high. The synthetic-completion driver currently lives entirely within action effect resolution; extending to cross-action / cross-phase requires substantial new kernel integration. The Rust WASM port (`preview_drive.rs`) is currently 379 lines and only handles inner-preview frontiers — it does not know about phase transitions.

### 4.2 Option B — Phase-anchored heuristic state features

Add new state-features (`feature.*`) or candidateFeatures whose `expr` computes a **deterministic heuristic estimate** of post-coup state values without running any simulation. Pure formula in YAML, evaluated against the current authoritative state.

**Examples**:

```yaml
stateFeatures:
  projectedPostCoupCoinControlPop:
    # Estimate: current coinControlPop + (count of zones where +1 ARVN piece would flip to COIN-control)
    type: number
    expr:
      add:
        - { ref: feature.coinControlPop }
        - aggregateSpaces:    # NEW or existing aggregator
            filter:
              and:
                - controlStatus: contested
                - coinPiecesNeededToFlip: { lte: 1 }
            value:
              { ref: zoneProp.population }
            op: sum

  zonesNearCoinFlip:
    # Count of zones one piece away from COIN control — proxy for "Train value"
    type: number
    expr:
      aggregateSpaces:
        filter:
          coinPiecesNeededToFlip: { lte: 1 }
        op: count
```

Then a consideration:

```yaml
preferTrainWhenZonesNearFlip:
  scopes: [move]
  when:
    gt:
      - { ref: feature.zonesNearCoinFlip }
      - 2
  weight: 600
  value:
    boolToNumber:
      ref: candidate.tag.train
```

The agent gets a Train boost specifically when there are flippable zones nearby — a state-conditional path the existing `trainWhenControlLow` doesn't capture (the existing condition is global `coinControlPop<25`, not per-zone).

**Foundation alignment**:
- §1 Engine Agnosticism — formulas use generic refs (`zoneProp`, `controlStatus`, `aggregateSpaces`). Game data declares which zone properties exist.
- §7 Specs Are Data — pure declarative expressions; no projection simulation.
- §10 Bounded Computation — formula is `O(zones)` per evaluation. For FITL, ~50 zones; trivial cost.
- §20 Preview Signal Integrity — no preview involved; state-local instantaneous reads. Cannot become unavailable.
- §17 Strongly Typed Domain Identifiers — zone properties already typed.

**Cost analysis**: trivial. Adding a state-feature that aggregates over zones is `O(zones)` per consideration evaluation. For FITL's ~50 zones and 5-10 candidates per decision, the added cost is comparable to existing `globalTokenAgg` state-features (which already iterate over tokens or zones). No measurable harness-time impact.

**Implementation risk**: low. The aggregator infrastructure largely exists. Some new aggregator predicates may be needed (e.g., `coinPiecesNeededToFlip`) but these are pure functions of authoritative state.

**Trade-off**: loses fidelity vs. Option A. A heuristic "zones near coin flip" is an approximation that may misfire (e.g., when an opposing faction is about to add troops to the same zone). The operator has to design heuristics that match the game's actual dynamics.

### 4.3 Option C — Phase-cycle awareness refs

Expose **timing/structural information** about the game's phase cycle as new state-level refs, without doing any projection. The agent can then write conditional considerations that reason about its position in the cycle.

**Examples**:

```yaml
# NEW refs:
# - turn.actionsUntilNextPhase.<phaseId>    (number — how many actions until phase fires)
# - turn.cardsUntilNextPhase.<phaseId>      (number — how many cards remaining before phase trigger)
# - phase.next.id                            (typed enum string — what phase fires next)
# - turn.currentEligibilityWindow            (binding — which window-id is active)
# - turn.factionsRemainingInRound           (number — how many factions still act this round)
```

A consideration using these:

```yaml
preferGovernEarlyInCoupCycle:
  scopes: [move]
  when:
    gt:
      - { ref: turn.cardsUntilNextPhase.coup }
      - 3
  weight: 200    # bonus on top of preferGovernWeighted=1000
  value:
    boolToNumber:
      ref: candidate.tag.govern
```

Or:

```yaml
preferTrainNearCoupCycleEnd:
  scopes: [move]
  when:
    lt:
      - { ref: turn.cardsUntilNextPhase.coup }
      - 2
  weight: 500
  value:
    boolToNumber:
      ref: candidate.tag.train
```

The agent encodes the strategic prior "build Patronage early in the cycle, build placements late" via timing-aware conditionals.

**Foundation alignment**:
- §1 Engine Agnosticism — `phase.next.id` reads the game's declared phase sequence. `cardsUntilNextPhase` needs a generic notion of "phase-trigger" (in FITL, cards in the deck; in other games, possibly turn-count thresholds). Requires care to keep the trigger-mechanism abstract.
- §6 Schema Ownership Stays Generic — the engine must not enumerate "coup", "cleanup", etc.; phase ids come from GameSpecDoc.
- §10 Bounded Computation — refs are `O(1)` reads of pre-computed scheduling state.
- §20 Preview Signal Integrity — no preview, no unavailability.

**Cost analysis**: trivial. New refs over existing turn/phase state.

**Implementation risk**: low-to-medium. The "cards until next coup" calculation depends on FITL's card-deck structure; generalizing it to other games requires identifying a common abstraction for "scheduled phase triggers". Spec 158 (microturn policy scope) and Spec 165 (projected-state lookups) provide structural precedents.

**Trade-off**: provides timing structure but no semantic projection. The operator still has to encode value-of-action-at-time-t manually. Less powerful than A; complementary to B.

### 4.4 Hybrid recommendation

The pragmatic path forward — given the 13-minute harness budget — is **B + C in parallel**, escalating to a scoped variant of (A) only if the cheap options plateau.

| Path | What to ship first | Expected gain | Cost |
|---|---|---|---|
| **B alone** | 1-2 zone-aggregator state features (`zonesNearCoinFlip`, `projectedPostCoupCoinControlPop`) + 1-2 conditional considerations using them | Probably +0.1 to +0.3 compositeScore | Trivial runtime impact |
| **C alone** | `turn.cardsUntilNextPhase.<id>` ref + 2 timing-aware conditionals | Probably +0.05 to +0.15 | Trivial runtime impact |
| **B + C** | Both | Probably +0.15 to +0.4 (composable) | Trivial runtime impact |
| **Scoped A** | Cross-phase projection only for actions tagged `phase-critical` (e.g., Train); rest stay at deep1024 | Probably +0.3 to +0.5 if the scoping is precise | Substantial — needs new kernel hook and budgeting |

Scoped A is the most powerful but requires the most engine work; B+C is the most cost-effective starting point.

---

## 5. Computational cost and bytecode/WASM mitigation paths

The campaign's harness runtime is ~13 minutes for 15 seeds post-deep1024 (was ~11 minutes before). The user has flagged that further significant runtime increases would harm iteration cadence. Any solution must either be free (B, C) or use bytecode/WASM acceleration to offset cost (A).

### 5.1 Current WASM/bytecode infrastructure

`packages/engine-wasm/policy-vm/` is a Rust crate that compiles to WASM and is invoked from the TypeScript runtime via stable C ABI. Major exports (from `packages/engine-wasm/policy-vm/src/lib.rs`):

```rust
ludoforge_policy_vm_abi_magic()                       // ABI sentinel
ludoforge_policy_vm_abi_version()                     // ABI version
ludoforge_policy_vm_alloc(len)                        // Allocator
ludoforge_policy_vm_dealloc(ptr, len)
ludoforge_policy_vm_evaluate_bytecode(bytecode, ctx)  // Single bytecode evaluation
ludoforge_policy_vm_evaluate_bytecode_batch(...)      // Batched evaluation (preview-drive use)
ludoforge_policy_vm_evaluate_preview_drive_batch(...) // Preview-drive batched evaluation
```

`packages/engine-wasm/policy-vm/src/preview_drive.rs` (379 lines) implements the **inner-preview drive in WASM** — i.e., the per-option projected-state evaluation that spec 164's `deep1024` accelerates.

The TypeScript side (`packages/engine/src/agents/policy-wasm-runtime.ts:50`) maps ref kinds to WASM opcode slots:

```ts
const REF_KIND_TO_OPCODE: Record<string, number> = {
  // ...
  candidateParam: 9,    // spec 166's new ref family
  // ...
};
```

So a new ref kind from any of options A/B/C would need:
1. A new opcode slot in the WASM ABI
2. A Rust handler in `policy-vm/src/lib.rs` or `preview_drive.rs`
3. A TypeScript-side resolver fallback (`packages/engine/src/agents/policy-runtime.ts`) for backwards compatibility / debugging

### 5.2 Bytecode/WASM cost analysis per option

| Option | What runs in policy expression eval (bytecode/WASM-friendly) | What needs new kernel infrastructure (not yet WASMified) | Net cost impact |
|---|---|---|---|
| **A — Cross-phase preview** | New refs read projected state-features after cross-phase simulation. Refs themselves are bytecode-friendly. | The **simulation driver** (cross-phase advance through opponent turns) is fundamentally new kernel work. Currently `kernel/` and `sim/` are TypeScript only; no Rust port exists. Adding a multi-action simulator to Rust is a major undertaking. | Without WASM acceleration: 20-50× current cost (4-12 hours per 15 seeds). With kernel-level WASM port: potentially 5-10× current cost (60-130 minutes). |
| **B — Heuristic state features** | All formula evaluation is bytecode. Aggregators (`aggregateSpaces`, `globalTokenAgg`) already exist and run efficiently. New refs (`zoneProp.foo`, `controlStatus`, etc.) are state-local reads. | None — pure expression evaluation. | Negligible (~1-3% harness time increase per new state-feature). |
| **C — Phase-cycle awareness refs** | New refs (`turn.cardsUntilNextPhase.<id>`, `phase.next.id`) are state-local reads with `O(1)` lookups. | Possibly minor kernel-side computation for `cardsUntilNextPhase` (cache the deck-position-to-phase mapping at game start). | Negligible. |

### 5.3 Hybrid Rust-WASM path for Option A

If Option A is pursued, the practical implementation strategy would be:

1. **Phase 1**: WASMify the kernel's action-execution and state-transition logic (the core `applyEffect`, `enumerateLegalMoves`, etc.). This is significant work but pays off across many use cases.
2. **Phase 2**: WASMify the simulator's main-phase advance loop (process player turns, apply faction baseline policies as deterministic stand-ins).
3. **Phase 3**: Add a `crossPhaseProjection` driver in Rust that calls into Phase 1/2 to advance through phase boundaries.
4. **Phase 4**: Expose new ref kinds (`preview.crossPhase.*`) that resolve through the new driver.

Phases 1-2 are large architectural undertakings (likely multi-spec work) but yield cross-cutting performance improvements (faster simulator, faster preview, faster legal-move enumeration). Phases 3-4 are smaller, building on the WASMified primitives.

An interim mitigation while Phases 1-2 are not yet done: implement the cross-phase driver in TypeScript but heavily restrict scope (e.g., projection only fires for actions tagged `phase-critical`, only at action-selection scope, only when the agent's preview budget allows). The cost spike applies to a small fraction of decisions, keeping total harness runtime under control.

### 5.4 Cost-benefit summary

For a campaign with ~10-15 experiment iterations per session at 13-minute harness runtime:

| Solution | Setup cost (engineering) | Runtime cost per harness | Expected metric gain |
|---|---|---|---|
| **B alone** | 1-2 days (new aggregator + 2 considerations) | +1-3% (~14 minutes total) | +0.1 to +0.3 |
| **C alone** | 1-2 days (new refs + 2 conditionals) | +0-1% (~13 minutes total) | +0.05 to +0.15 |
| **B + C** | 2-3 days | +1-3% (~14 minutes total) | +0.15 to +0.4 |
| **A (TypeScript, scoped)** | 1-2 weeks | +50-100% (~20-26 minutes total) for affected actions only | +0.3 to +0.5 |
| **A (WASMified, full)** | 2-3 months (Phase 1-4) | +30-50% (~17-20 minutes total) | +0.3 to +0.5 |

Recommendation under the user's runtime constraint: **start with B + C** (cheapest, fast iteration), reserve A for future work once B + C plateau OR if the static-boost heuristic approach proves brittle in other campaigns.

---

## 6. Foundation alignment matrix

| Foundation | A — Cross-phase preview | B — Heuristic state features | C — Phase-cycle awareness |
|---|---|---|---|
| §1 Engine Agnosticism | Strict — phase-id must be generic; no hardcoded `coup` | Strict — aggregators use generic predicates | Strict — `phaseId` must come from GameSpecDoc |
| §6 Schema Ownership Stays Generic | Phase-id enum lives in game data | Zone-property names live in game data | Same as A |
| §7 Specs Are Data, Not Code | Declarative `untilPhase` trigger; no arbitrary code | Pure declarative aggregator | Pure declarative ref reads |
| §10 Bounded Computation | Strict budgeting required; new cap class | Trivially bounded (O(zones)) | Trivially bounded (O(1)) |
| §17 Strongly Typed Domain Identifiers | `phaseId` typed scalar | Zone properties already typed | `phaseId` typed scalar |
| §20 Preview Signal Integrity | Strict — must signal unavailable when budget exhausted | Not applicable (no preview) | Not applicable (no preview) |
| §12 Compiler-Kernel Validation | Compiler rejects unknown phase-ids; rejects cross-phase refs when `outer.crossPhaseProjection` is not opted in | Compiler rejects unknown zone properties | Compiler rejects unknown phase-ids |
| §14 No Backwards Compatibility | Cleanly versioned new cap class | New stateFeature is additive | New ref family is additive |
| §19 Decision-Granularity Uniformity | Parity argument: today's `preview.victory.*` projects through inner-preview frontiers; A extends through phase frontiers (analogous extension) | N/A | N/A |

All three options have plausible Foundation-aligned designs. Option A is the most constrained because it touches preview integrity and bounded computation; options B and C are essentially additive extensions of the existing state-feature / ref-family surface.

---

## 7. Open research questions for ChatGPT-Pro

The following questions would benefit from external deep research alongside `docs/FOUNDATIONS.md`:

### 7.1 Architectural foundations

1. **Is Option A (cross-phase preview) genuinely necessary, or is the static-boost heuristic an acceptable long-term answer?** What does the COIN-series board-game agent literature say about projection horizons vs. encoded priors? Is there a principled argument for one over the other?

2. **What is the right generic abstraction for "phase boundary" across games?** FITL has Coup phases triggered by card-deck positions; other games may have round endings, scheduled events, or eligibility-window resets. A generic mechanism needs a uniform vocabulary — possibilities include `untilPhase`, `untilTurnCount`, `untilEligibilityWindow`, `untilRoundEnd`, etc. Which abstractions cover the design space without committing to game-specific shapes?

3. **How should opponent policy be encoded for cross-phase projection?** A deterministic simulation requires each faction's "stand-in policy" — the projection's accuracy depends on the policy's fidelity to the actual agent. Options: (a) re-use each faction's baseline profile, (b) require a `projectionPolicy` field in GameSpecDoc, (c) use a simplified heuristic (random-move, greedy-move). What's the right trade-off?

### 7.2 Performance & WASM acceleration

4. **What is the right granularity of WASMification for the kernel?** Today `policy-vm/preview_drive.rs` handles per-option projected-state evaluation. To support Option A, would WASMifying `applyEffect` + `enumerateLegalMoves` + `advanceToDecisionPoint` be sufficient, or does the full simulator loop also need to be in Rust? How does this interact with `docs/FOUNDATIONS.md` §10 Bounded Computation (the Rust port must remain bounded and deterministic by construction)?

5. **Is there a bytecode-only mid-tier between B and A?** Specifically: could a bytecode-evaluated state-feature traverse opponent turns at the bytecode VM level without leaving the WASM sandbox? This would require exposing kernel apply-effect primitives as WASM intrinsics callable from policy bytecode. Is that compatible with Foundation #7 (Specs Are Data)?

### 7.3 Heuristic state-feature design (Option B)

6. **What heuristic state-features have the highest signal for COIN-series victory tracks?** Candidates: `zonesNearCoinFlip` (≤1 piece from flip), `coinFragileControl` (controlled but contested), `populationAtRisk` (controlled zones with ≥2 enemy presence), `unprotectedSaigon` (high-value zone exposed). Which produce the largest expected-utility lift?

7. **Are there mid-game vs. late-game heuristics worth distinguishing?** ARVN's optimal strategy likely shifts as Patronage approaches threshold. What features encode "we're in the consolidation phase" vs. "we're in the build-up phase"?

### 7.4 Phase-cycle awareness (Option C)

8. **What timing structure does FITL specifically expose, and is it generalizable?** The Coup phase fires every N event cards in FITL; other games may have different schedules. Is the right generic surface `cardsUntilNextPhase` (deck-position-based), `turnsUntilNextPhase` (turn-count-based), or something more abstract (a `phaseSchedule` declaration in GameSpecDoc)?

9. **Does spec 158's microturn-scope ref family (`microturn.option.tags`) extend cleanly to phase-cycle awareness, or is this a new surface entirely?** What ref-family naming would minimize confusion (`turn.*`, `phase.*`, `cycle.*`, `schedule.*`)?

### 7.5 Empirical validation

10. **How would we know if Option A actually subsumes the static-boost prior?** A clean test: implement A with full opponent-policy projection, then ablate `preferGovernWeighted`. If the metric stays at the post-A level (no regression like exp-010), the projection has correctly captured the prior. What's the right experiment design and seed-corpus size to detect this with confidence?

11. **What metric signal would distinguish "preview undervalues Train" from "Train is actually a bad action at this state"?** Some Train picks ARE actually bad; some are good-but-undervalued. The static boost forces ARVN to play Train (or not) based on global state, not per-zone state. How to distinguish overfitting from genuine value discovery?

---

## 8. Cross-references

### 8.1 Source files relevant to this gap

- **Preview drive (TypeScript)**: `packages/engine/src/agents/policy-eval.ts` (action-selection scope), `packages/engine/src/agents/policy-preview-drive.ts` (inner preview)
- **Preview drive (Rust/WASM)**: `packages/engine-wasm/policy-vm/src/preview_drive.rs` (379 lines)
- **Policy VM (Rust/WASM)**: `packages/engine-wasm/policy-vm/src/lib.rs` (1298 lines, ABI in lines 107-228)
- **WASM ABI / opcode slots**: `packages/engine/src/agents/policy-wasm-runtime.ts`
- **Ref resolution (TypeScript fallback)**: `packages/engine/src/agents/policy-runtime.ts`
- **Compiler — ref kind validation**: `packages/engine/src/cnl/compile-agents.ts`
- **Cap-class registry**: `packages/engine/src/cnl/compile-agents.ts:100-106` (`CapClass`, `CAP_CLASS_BUDGETS`)
- **Inner-preview budget formula**: `docs/agent-dsl-cookbook.md:670-689`
- **State-feature aggregators**: `packages/engine/src/agents/policy-runtime.ts` (search `globalTokenAgg`)
- **Phase / coup mechanics in FITL**: `data/games/fire-in-the-lake/30-rules-actions.md` (search "coup"), `data/games/fire-in-the-lake/90-terminal.md`

### 8.2 Related specs and reports

- **Spec 158** — microturn policy scope (`microturn.option.value` etc.) — structural precedent for new ref families
- **Spec 162** — preview signal integrity (Foundation #20)
- **Spec 163** — generic microturn state-feature lookups — generic-typed-key precedent
- **Spec 164** — `continuedDeepening` + cap-class registry; depth extension within an action's effect tree
- **Spec 165** — projected-state lookup refs (`lookup.surface: previewOptionState`); the surface-union-extension precedent
- **Spec 166** — `candidate.params.<name>` typed-scalar refs at action-selection (this report's near-neighbor)
- **`reports/agent-candidate-param-discrimination-gap-2026-05-11.md`** — preceding gap report addressed by spec 166
- **`reports/preview-inner-choosenstep-architectural-gap-2026-05-07.md`** — preceding gap report addressed by spec 164
- **`reports/fitl-arvn-post-spec-166-plateau-2026-05-12.md`** — the immediately-preceding campaign-state document recommending exp-005's Option B path

### 8.3 Campaign artifacts

- Worktree: `.claude/worktrees/improve-fitl-arvn-agent-evolution/`
- Branch: `improve/fitl-arvn-agent-evolution`
- Current HEAD commit: `bff2babcc` (exp-005 ACCEPT — `continuedDeepening + deep1024`)
- Best state: `compositeScore=-3.5333, wins=3/15, avgMargin=-5.5333` at tier 15
- Stashed near-misses: exp-004, exp-006, exp-008, exp-009 (zero-effect tuning experiments)
- Full experiment ledger: `campaigns/fitl-arvn-agent-evolution/results.tsv`
- Per-experiment narratives: `campaigns/fitl-arvn-agent-evolution/musings.md`
- Local lesson store: `campaigns/fitl-arvn-agent-evolution/lessons.jsonl`

---

## 9. Status & next steps

- Campaign loop is **paused at exp-010** pending user direction on whether to pursue any of options A/B/C in this session, or to wrap and promote `arvn-evolved` → `arvn-baseline` at -3.5333.
- The arvn-evolved profile at the current commit (`bff2babcc`) is the documented tier-15 best. All subsequent experiment changes have been rolled back or stashed.
- This report is the deliverable for ChatGPT-Pro deep research. Pair it with `docs/FOUNDATIONS.md` for foundation-aligned solution proposals.
