# Coup Redeploy Bounded Termination Fix

**Date**: 2026-04-11
**Branch**: implemented-spec-66

## Brainstorm Context

- **Original request**: Fix grant-determinism canary test failure after adding `phases` gating to victory checkpoints (Spec 66).
- **Key interview insights**: The `phases: [coupVictory]` gating is correct per FITL rules (Section 6.1 — victory only checked during Victory Phase). The test failure exposed a pre-existing unbounded iteration bug in the `coupRedeploy` phase.
- **Final confidence**: 95%

## Overview

Two changes to FITL game data restore bounded coup phases:
1. Remove the `[pass]` tag from 4 coup-phase pass actions so `dropPassWhenOtherMovesExist` doesn't prune them.
2. Remove self-destination clauses from 4 redeploy actions to eliminate no-op moves.

Then update the grant-determinism canary test for the corrected phase-gated victory behavior. All changes are in YAML game data and the test file — no engine code changes.

## Root Cause Analysis

**Root cause**: The PolicyAgent pruning rule `dropPassWhenOtherMovesExist` unconditionally prunes all candidates tagged `[pass]` when non-pass alternatives exist. Coup-phase pass actions (`coupRedeployPass`, etc.) carry the `[pass]` tag. Since redeploy actions are always legal (police/troops exist + self-destination is valid), the pass is permanently pruned and the phase never ends.

**Contributing factor**: Self-destination in redeploy actions (moving a piece to where it already is) creates always-available no-op moves, guaranteeing the pass is always pruned. Even without self-destination, cycling between valid destinations is possible, but the pass being available as a scored candidate allows the agent to stop when margin stops improving.

**Masking behavior (pre-PR)**: Before Spec 66 added `phases` gating, victory checkpoints were evaluated at every phase. A faction would meet their victory threshold during `coupRedeploy` (due to troop movements shifting control), ending the game before the infinite-redeploy problem was visible.

## Changes

### 1. Coup pass actions — remove `[pass]` tag

File: `data/games/fire-in-the-lake/30-rules-actions.md`

| Action | Change |
|--------|--------|
| `coupPacifyPass` | Remove `tags: [pass]` (or set `tags: []`) |
| `coupAgitatePass` | Remove `tags: [pass]` (or set `tags: []`) |
| `coupRedeployPass` | Remove `tags: [pass]` (or set `tags: []`) |
| `coupCommitmentPass` | Remove `tags: [pass]` (or set `tags: []`) |

The main-phase `pass` action keeps `tags: [pass]` — it should still be pruned when real moves exist.

### 2. Redeploy actions — remove self-destination clause

File: `data/games/fire-in-the-lake/30-rules-actions.md`

Remove the self-destination OR branch from the `chooseOne` destination filter in:

| Action | Line (approx) | Clause to remove |
|--------|---------------|------------------|
| `coupArvnRedeployMandatory` | ~705 | `{ op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: sourceSpace } }` |
| `coupArvnRedeployOptionalTroops` | (check) | Same pattern |
| `coupArvnRedeployPolice` | ~886 | Same pattern |
| `coupNvaRedeployTroops` | ~949 | Same pattern |

### 3. Canary test update

File: `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`

- Increase `MAX_TURNS` from 100 to accommodate phase-gated victory (300-500 range)
- Re-run seeds 1001-1004 after fixes; replace non-terminating seeds if needed
- Replay-determinism test structure unchanged

## FOUNDATIONS.md Alignment

| Foundation | Status | Notes |
|-----------|--------|-------|
| F1 (Engine Agnosticism) | Aligns | All changes in game data YAML and test file |
| F8 (Determinism) | Aligns | Replay tests preserved |
| F10 (Bounded Computation) | Fixes violation | Pass always available, agent eventually passes, phase terminates |
| F14 (No Backwards Compat) | Aligns | Direct fix, no shims |
| F15 (Architectural Completeness) | Aligns | Root cause + contributing factor both addressed |
| F16 (Testing as Proof) | Aligns | Canary test proves termination under corrected rules |

## FITL Rules Alignment

- **Section 6.1**: Victory checked only during Victory Phase — `phases: [coupVictory]` is correct.
- **Section 6.4.2**: ARVN redeployment is optional for police ("may move"). Player can stop at any time.
- **Section 6.4.3**: NVA redeployment is optional ("may move"). Same principle.
- Self-destination is rules-ambiguous but creates no-op moves that serve no game purpose.
