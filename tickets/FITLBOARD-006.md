# FITLBOARD-006: F2 Gate Assessment and Milestone Closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — spec update only
**Deps**: FITLBOARD-001, FITLBOARD-002, FITLBOARD-003, FITLBOARD-005

## Problem

Milestone F2 in `specs/35-00-frontend-implementation-roadmap.md:106` has one unchecked gate criterion:

```
- [ ] Can render FITL board (even without graph layout — manual or default positions)
```

After FITLBOARD-001 through FITLBOARD-005, the FITL board should render in the browser with:
- 47 zones visible in a grid layout (8 cities as circles, 22 provinces as rectangles, 17 LoCs as lines)
- Zones colored by category/terrain
- Human-readable labels (Saigon, Hue, etc.)
- Tokens visible in zones with faction colors
- Adjacency lines connecting zones
- Game state panels showing FITL variables
- Full game functionality (actions, choices, AI opponents)

## What to Change

### 1. Verify gate criterion

Perform manual verification:

1. Run `pnpm -F @ludoforge/runner bootstrap:fitl && pnpm -F @ludoforge/runner dev`
2. Open `http://localhost:5173/?game=fitl`
3. Verify:
   - [ ] 47 zones render on canvas (check zone count in dev tools or visual inspection)
   - [ ] Cities appear as circles (Saigon, Hue, etc.)
   - [ ] Provinces appear as rectangles
   - [ ] LoCs appear as narrow rectangles/lines
   - [ ] Zones have distinct colors by category
   - [ ] Adjacency lines connect adjacent zones
   - [ ] Tokens are visible inside zones
   - [ ] Pan/zoom works
   - [ ] Game state panel shows FITL-specific variables
   - [ ] At least one move can be made (game is playable)

### 2. Check the gate

**File**: `specs/35-00-frontend-implementation-roadmap.md`

Change line 106 from:
```
- [ ] Can render FITL board (even without graph layout — manual or default positions)
```
to:
```
- [x] Can render FITL board (even without graph layout — manual or default positions)
```

### 3. Add milestone outcome note

Below the F2 gate criteria section, add:

```markdown
**F2 Outcome**: All gate criteria met. FITL board renders in grid layout with category-based visual differentiation (circles for cities, rectangles for provinces, lines for LoCs). Graph layout deferred to Spec 41. Closed YYYY-MM-DD.
```

## Invariants

- All F2 gate criteria checked (12/12)
- `pnpm turbo build && pnpm turbo typecheck && pnpm turbo test && pnpm turbo lint` all pass
- Texas Hold'em still works at `http://localhost:5173/` (no regression)
- FITL renders at `http://localhost:5173/?game=fitl`

## Tests

- All existing engine tests pass (2142+)
- All existing runner tests pass (476+)
- Manual browser verification per checklist above
- No console errors in either game mode
