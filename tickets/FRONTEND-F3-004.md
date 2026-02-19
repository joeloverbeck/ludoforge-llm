# FRONTEND-F3-004: End-to-End Verification for Milestone F3 Card Animations

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Mixed (tests + docs + fixture scenarios)
**Deps**: FRONTEND-F3-002, FRONTEND-F3-003

## Problem

The F3 roadmap gate includes "`[ ] Card animations (deal, flip, burn) work`" but there is no end-to-end acceptance suite that proves those behaviors across the runner pipeline. Without explicit e2e validation, the checkbox can be flipped prematurely.

## What to Change

1. Add end-to-end runner validation scenarios that exercise:
   - deal flows,
   - flip flows,
   - burn flows,
   under realistic move sequences.
2. Use fixture/spec-driven setup (no test-only game-specific branching in runtime).
3. Validate both normal and reduced-motion paths.
4. Validate behavior under playback controls (speed/pause/skip).
5. Update roadmap/spec checklists only after tests are green and criteria are explicitly met.

## Invariants

1. Milestone F3 checkbox is updated only when objective test evidence exists.
2. E2E assertions verify observable behavior (timeline effects/state transitions), not implementation internals only.
3. Card animation coverage includes at least one full flow that contains all three semantics (deal, flip, burn).
4. Accessibility/reduced-motion behavior remains compliant during card animation flows.
5. No backwards-compatibility shims are required; tests target the new architecture directly.

## Tests

1. Runner integration/e2e: scripted move sequence demonstrating deal animation playback.
2. Runner integration/e2e: scripted move sequence demonstrating flip animation playback.
3. Runner integration/e2e: scripted move sequence demonstrating burn animation playback.
4. Runner integration/e2e: combined scenario verifying queue order and playback controls with card semantics.
5. Accessibility integration test: `prefers-reduced-motion` fast-forward path still processes card semantic descriptors correctly.

