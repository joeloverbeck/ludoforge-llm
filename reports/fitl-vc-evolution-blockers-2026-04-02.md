# FITL VC Agent Evolution — Blocker Report (2026-04-02)

## Context

The `fitl-vc-agent-evolution` campaign attempted to evolve the VC PolicyAgent for FITL using the improve-loop skill. After specs 102-106 (shared observer model, action tags, unified considerations, explicit preview contracts, zone-token observer integration) landed, the prior campaign's optimized compositeScore of 10.5333 (14/15 wins) regressed to approximately -4.0 (0/15 wins, all games hitting maxTurns at 500 moves).

Investigation revealed two engine/game-spec issues that must be fixed before the evolution campaign can proceed.

## Bug 1: preview.victory.currentMargin.self returns `hidden` despite public visibility config

### Symptoms

- The `projectedSelfMargin` candidate feature uses `preview.victory.currentMargin.self` with a coalesce fallback to `feature.selfMargin`.
- Despite the observability config (`93-observability.md`) declaring `victory.currentMargin.preview.visibility: public`, the preview surface resolution returns `unknown` with reason `hidden` for ALL candidates.
- This causes the coalesce to fall back to `selfMargin`, which is identical for all candidates at a decision point — providing zero differentiation.

### Evidence

From `diagnose-seed.mjs` output on seed 1000 with `preferProjectedSelfMargin` enabled (weight 5):
```
Preview: mode=tolerateStochastic, evaluated=30, ready=0, stochastic=0
Unknown preview refs: victoryCurrentMargin.currentMargin.self(hidden)
```

- `evaluated=30` confirms preview IS running (candidates are being evaluated).
- `ready=0, stochastic=0` confirms NO preview succeeded — all returned `unknown`.
- Reason `hidden` means the surface visibility check rejected the access.

### Observability Config (93-observability.md)

```yaml
observability:
  observers:
    currentPlayer:
      surfaces:
        victory:
          currentMargin:
            current: public
            preview:
              visibility: public
              allowWhenHiddenSampling: false
```

This should allow preview access to `victory.currentMargin` for the `currentPlayer` observer. The `hidden` result suggests a mismatch between the ref path used by the agent system and the surface path expected by the observer visibility check.

### Likely Root Cause

The ref path `preview.victory.currentMargin.self` includes a role selector `.self` that resolves to the current player. The observer visibility system may not correctly resolve the role selector when checking preview access, OR the surface family name in the compiled observer profile doesn't match the family used by the policy preview runtime.

### Files to Investigate

- `packages/engine/src/agents/policy-preview.ts` — `resolveSurface()` method (line ~120-160). The visibility check at line 145: `if (preview.requiresHiddenSampling && !visibility.preview.allowWhenHiddenSampling)` — this is the check that returns `hidden`. But `allowWhenHiddenSampling` is `false` in the config, and `requiresHiddenSampling` must be `true` for this to fire. Why is the preview state flagged as requiring hidden sampling in a public-information game?
- `packages/engine/src/kernel/observation.ts` — `derivePlayerObservation()` (line ~110-161). This function sets `requiresHiddenSampling = true` when the observer can't see all tokens in a zone. In FITL, the deck zone has hidden token order — the observer can't see the deck order. This causes `requiresHiddenSampling = true` even though the victory margin is fully public.
- `packages/engine/src/agents/policy-preview.ts` — line 136-147 in `resolveSurface()`. The `isSurfaceVisibilityAccessible` check AND the `requiresHiddenSampling` check are both applied. The surface IS accessible (public), but the preview state's `requiresHiddenSampling` flag is `true` because of the hidden deck, and `allowWhenHiddenSampling: false` blocks it.

### Proposed Fix

The `requiresHiddenSampling` flag is a whole-state flag — it's `true` if ANY zone has hidden tokens (like the deck). But this blocks ALL preview surface access, even for fully public surfaces like victory margin. The fix should be:

**Option A**: Make `allowWhenHiddenSampling: true` in the FITL observability config for surfaces that are public regardless of hidden zones. This is safe because the victory margin computation doesn't depend on hidden information.

**Option B**: Make the `requiresHiddenSampling` check per-surface rather than whole-state. This is more architecturally correct but requires Tier 2 engine changes.

**Option C** (quick validation): Change `allowWhenHiddenSampling: false` to `true` in `93-observability.md` for the victory surfaces and test if preview then works. This is a Tier 4 change (game spec).

### Impact

Without this fix, `preferProjectedSelfMargin` is useless — the agent cannot score moves by their projected impact on the victory formula. This was the #1 lever identified for making VC competitive.

---

## Bug 2: coupAgitatePass lacks `pass` tag — pruning rule cannot drop it

### Symptoms

- During Coup support phase, VC has 3 legal moves: `coupAgitateVC` (actual agitate), `coupAgitatePass` (do nothing), and possibly another agitate target.
- The `dropPassWhenOtherMovesExist` pruning rule checks `candidate.tag.pass` — but `coupAgitatePass` has NO tags defined in `30-rules-actions.md`.
- As a result, the pruning rule sees all 3 candidates as non-pass and doesn't drop anything.
- Since no consideration matches coup-phase actions (they have no matching tags like `rally`, `tax`, etc.), all 3 score 0.
- The tiebreaker picks `coupAgitatePass` (a no-op) instead of the actual agitate action.

### Evidence

From `diagnose-seed.mjs` output, VC Decision 5:
```
Action: coupAgitatePass
Final score: -20 (negative from margin contribution, 0 from action considerations)
Pruning: dropPassWhenOtherMovesExist → 3 remaining (all kept!)
TieBreak: preferCheapTargetSpaces: 3 → 1
```

### Game Spec (30-rules-actions.md)

```yaml
# Main pass action — HAS the pass tag:
- { id: pass, tags: [pass], actor: active, ... }

# Coup agitate pass — MISSING the pass tag:
- id: coupAgitatePass
  actor: active
  phase: [coupSupport]
  params: []
  pre: { op: '==', left: { ref: activePlayer }, right: 3 }
  # NO tags field!
```

### Proposed Fix

Add tags to coup-phase actions in `30-rules-actions.md`:
```yaml
- id: coupAgitatePass
  tags: [pass]           # ← ADD THIS
  actor: active
  ...

- id: coupAgitateVC
  tags: [agitate]        # ← ADD THIS (enables agent considerations to match it)
  actor: active
  ...
```

Also check ALL other coup-phase pass actions (coupPacifyPass, coupRedeployPass, etc.) for the same missing tag issue.

### Impact

Without this fix, VC wastes its Coup agitate opportunity by passing instead of shifting support→opposition. Agitate is VC's primary mechanism for increasing Total Opposition during Coup — missing it directly reduces the victory margin.

---

## Additional Observations

### VC gets very few decision opportunities

Seed 1000: VC made only 5 decisions in 500 total moves (7 turns). This is expected COIN mechanics — factions become ineligible after acting. But it means every VC decision is critical. Wasting a decision on `coupAgitatePass` (Bug 2) or failing to differentiate moves by projected margin (Bug 1) is devastating.

### Empty Rally targets

VC Decision 4 selected Rally with `$targetSpaces: []` — a no-op that wastes the move. This may be a completion scoring issue where the `preferPopulousTargets` consideration doesn't have enough signal to avoid zero-target selection, or a legal move enumeration issue where zero-target Rally is generated as a valid move.

### Game dynamics changed significantly

The new compiled GameDef from specs 102-106 changed the PRNG stream (different initial state hash → different deck shuffle). The same seeds (1000-1014) now produce fundamentally different game states. Prior campaigns benefited from favorable shuffles where coup cards appeared early (games ending in 7-39 moves). Current shuffles may place coup cards later, requiring more turns for victory checks.

### Diagnostic tooling created

`campaigns/fitl-vc-agent-evolution/diagnose-seed.mjs` — runs a single seed and dumps detailed state at each VC decision point. Useful for future debugging.

## Recommended Fix Order

1. **Bug 2** (tags fix) — Quick Tier 4 change, immediately enables pruning of coup-phase passes
2. **Bug 1** (preview hidden) — Try Option C first (`allowWhenHiddenSampling: true` in 93-observability.md), validate with diagnose-seed.mjs, then evaluate if Option B (per-surface check) is needed
3. Re-run seed 1000 with both fixes to validate VC can win
4. Resume evolution campaign with full 15-seed harness

## Files Modified During Investigation

- `packages/engine/test/integration/considerations-e2e.test.ts` — Made vc-evolved consideration list assertion resilient to evolution changes (no longer hardcodes exact list, checks library membership instead). This is a permanent improvement.
- `campaigns/fitl-vc-agent-evolution/diagnose-seed.mjs` — Diagnostic tool for single-seed analysis (campaign file, not committed).
- `campaigns/fitl-vc-agent-evolution/musings.md` — Campaign musings with investigation notes.
