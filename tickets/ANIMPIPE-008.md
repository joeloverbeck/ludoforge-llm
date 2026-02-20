# ANIMPIPE-008: Integration tests + Texas Hold'em visual-config update

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003, ANIMPIPE-004, ANIMPIPE-005, ANIMPIPE-006, ANIMPIPE-007

## Problem

No integration tests verify the full animation pipeline (store → traceToDescriptors → buildTimeline → queue). The Texas Hold'em visual-config also needs sequencing and timing configuration for card deal animations to use staggered timing.

## Assumption Reassessment (2026-02-20)

1. No integration test file exists for the animation pipeline — confirmed via search.
2. `data/games/texas-holdem/visual-config.yaml` has no `sequencing` or `timing` config — confirmed.
3. All upstream tickets (001-007) must be complete before this ticket — by design.

## Architecture Check

1. Integration tests verify the pipeline end-to-end using mocked GSAP, ensuring all components work together.
2. Texas Hold'em visual-config changes are game-specific presentation data (visual-config.yaml), not engine/GameDef changes.
3. No backwards-compatibility shims needed.

## What to Change

### 1. Create animation pipeline integration tests

New file `packages/runner/test/animation/animation-pipeline-integration.test.ts`:

Tests:
1. **Full pipeline**: store effectTrace → traceToDescriptors → buildTimeline → queue receives timeline
2. **Subscriber ordering**: canvas updater fires before animation controller in same setState
3. **Per-descriptor error isolation**: one throwing preset doesn't kill other descriptors
4. **Canvas-ready gating**: deferred processing until canvas reports ready
5. **Stagger sequencing**: multiple cardDeal descriptors produce overlapping tweens
6. **forceFlush recovery**: stuck animation can be force-flushed, new traces process after

### 2. Update Texas Hold'em visual-config

Modify `data/games/texas-holdem/visual-config.yaml`:

Add sequencing and timing config:
```yaml
animations:
  sequencing:
    cardDeal: { mode: stagger, staggerOffset: 0.15 }
  timing:
    cardDeal: { duration: 0.3 }
    cardFlip: { duration: 0.3 }
```

## Files to Touch

- `packages/runner/test/animation/animation-pipeline-integration.test.ts` (new)
- `data/games/texas-holdem/visual-config.yaml` (modify)

## Out of Scope

- Fixing any issues found by integration tests (those would be bugs in 001-007)
- FITL visual-config changes (FITL doesn't use card animations)
- Manual browser testing (documented in verification section but not automated)

## Acceptance Criteria

### Tests That Must Pass

1. Full pipeline integration test passes end-to-end
2. Subscriber ordering test confirms correct initialization order
3. Error isolation test confirms one bad descriptor doesn't kill others
4. Canvas-ready gating test confirms deferred processing
5. Stagger test confirms overlapping tween positions
6. forceFlush test confirms recovery and continued processing
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All integration tests use mocked GSAP (no real animation runtime needed)
2. Texas Hold'em visual-config validates against the schema

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/animation-pipeline-integration.test.ts` — comprehensive integration tests

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/animation-pipeline-integration.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`

### Manual Verification

```bash
pnpm -F @ludoforge/runner dev
# Open localhost:5173, load Texas Hold'em, observe pre-flop dealing animation
# Cards should arc from deck to each player's hand with staggered timing
# Phase transitions should show banner animation
# Score changes should show counter animation
```
