# Board Layout Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three board layout issues: viewport bounds clipping edge zones, graph layout overlap from insufficient spacing, and aux zone overlap from undersized vertical spacing.

**Architecture:** Extract shared zone-size constants into a new `layout-constants.ts` module. All layout and rendering code imports from this single source of truth. Bounds computation pads by half-zone dimensions. Graph layout scales extent and spacing dynamically with node count. Aux layout uses zone-height-aware spacing.

**Tech Stack:** TypeScript, Vitest, ForceAtlas2 (graphology-layout-forceatlas2), pixi.js

---

### Task 1: Create shared zone size constants

**Files:**
- Create: `packages/runner/src/layout/layout-constants.ts`
- Test: `packages/runner/test/layout/layout-constants.test.ts`

**Step 1: Write the failing test**

Create `packages/runner/test/layout/layout-constants.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  ZONE_RENDER_WIDTH,
  ZONE_RENDER_HEIGHT,
  ZONE_HALF_WIDTH,
  ZONE_HALF_HEIGHT,
} from '../../src/layout/layout-constants';

describe('layout-constants', () => {
  it('exports positive zone dimensions', () => {
    expect(ZONE_RENDER_WIDTH).toBeGreaterThan(0);
    expect(ZONE_RENDER_HEIGHT).toBeGreaterThan(0);
  });

  it('half dimensions are exactly half of full dimensions', () => {
    expect(ZONE_HALF_WIDTH).toBe(ZONE_RENDER_WIDTH / 2);
    expect(ZONE_HALF_HEIGHT).toBe(ZONE_RENDER_HEIGHT / 2);
  });

  it('zone width is 180 and height is 110', () => {
    expect(ZONE_RENDER_WIDTH).toBe(180);
    expect(ZONE_RENDER_HEIGHT).toBe(110);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/layout-constants.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `packages/runner/src/layout/layout-constants.ts`:

```typescript
/** Zone rendering width in pixels. Shared by layout, bounds, and renderer. */
export const ZONE_RENDER_WIDTH = 180;

/** Zone rendering height in pixels. Shared by layout, bounds, and renderer. */
export const ZONE_RENDER_HEIGHT = 110;

/** Half of zone rendering width. Used for bounds padding. */
export const ZONE_HALF_WIDTH = ZONE_RENDER_WIDTH / 2;

/** Half of zone rendering height. Used for bounds padding. */
export const ZONE_HALF_HEIGHT = ZONE_RENDER_HEIGHT / 2;
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/layout-constants.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runner/src/layout/layout-constants.ts packages/runner/test/layout/layout-constants.test.ts
git commit -m "feat: add shared zone size constants in layout-constants.ts"
```

---

### Task 2: Update zone-renderer to import from layout-constants

**Files:**
- Modify: `packages/runner/src/canvas/renderers/zone-renderer.ts` (lines 13-14)

**Step 1: Run existing tests to confirm green baseline**

Run: `pnpm -F @ludoforge/runner test -- --run`
Expected: All tests PASS

**Step 2: Replace hardcoded constants in zone-renderer**

In `packages/runner/src/canvas/renderers/zone-renderer.ts`, replace lines 13-14:

```typescript
// REMOVE these two lines:
const ZONE_WIDTH = 180;
const ZONE_HEIGHT = 110;

// ADD this import at the top of the file (after existing imports):
import { ZONE_RENDER_WIDTH as ZONE_WIDTH, ZONE_RENDER_HEIGHT as ZONE_HEIGHT } from '../../layout/layout-constants.js';
```

The `as` aliases keep every downstream usage unchanged — no need to touch the rest of the file.

**Step 3: Run tests to verify no regression**

Run: `pnpm -F @ludoforge/runner test -- --run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/runner/src/canvas/renderers/zone-renderer.ts
git commit -m "refactor: zone-renderer imports zone dimensions from layout-constants"
```

---

### Task 3: Fix viewport bounds with zone-size padding

**Files:**
- Modify: `packages/runner/src/layout/layout-cache.ts` (function `computeUnifiedBounds`, ~line 53)
- Test: `packages/runner/test/layout/layout-cache.test.ts`

**Step 1: Write failing tests**

Add these tests to the existing `describe('layout-cache', ...)` block in `packages/runner/test/layout/layout-cache.test.ts`:

```typescript
import { ZONE_HALF_WIDTH, ZONE_HALF_HEIGHT } from '../../src/layout/layout-constants';

// ... inside existing describe block ...

it('unified bounds pad by half zone dimensions beyond position extremes', () => {
  const def = makeDef('bounds-pad', [
    zone('board-a', { zoneKind: 'board', owner: 'none' }),
    zone('board-b', { zoneKind: 'board', owner: 'none' }),
  ], 'table');

  const result = getOrComputeLayout(def);
  const rawPositions = [...result.positionMap.positions.values()];
  const rawMinX = Math.min(...rawPositions.map((p) => p.x));
  const rawMaxX = Math.max(...rawPositions.map((p) => p.x));
  const rawMinY = Math.min(...rawPositions.map((p) => p.y));
  const rawMaxY = Math.max(...rawPositions.map((p) => p.y));

  expect(result.positionMap.bounds.minX).toBeLessThanOrEqual(rawMinX - ZONE_HALF_WIDTH);
  expect(result.positionMap.bounds.maxX).toBeGreaterThanOrEqual(rawMaxX + ZONE_HALF_WIDTH);
  expect(result.positionMap.bounds.minY).toBeLessThanOrEqual(rawMinY - ZONE_HALF_HEIGHT);
  expect(result.positionMap.bounds.maxY).toBeGreaterThanOrEqual(rawMaxY + ZONE_HALF_HEIGHT);
});

it('single-position unified bounds still pads by half zone dimensions', () => {
  const def = makeDef('bounds-single', [
    zone('solo', { zoneKind: 'board', owner: 'none' }),
  ], 'table');

  const result = getOrComputeLayout(def);
  const pos = result.positionMap.positions.get('solo')!;

  expect(result.positionMap.bounds.minX).toBe(pos.x - ZONE_HALF_WIDTH);
  expect(result.positionMap.bounds.maxX).toBe(pos.x + ZONE_HALF_WIDTH);
  expect(result.positionMap.bounds.minY).toBe(pos.y - ZONE_HALF_HEIGHT);
  expect(result.positionMap.bounds.maxY).toBe(pos.y + ZONE_HALF_HEIGHT);
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/layout-cache.test.ts`
Expected: FAIL — bounds don't include padding yet

**Step 3: Implement zone-size padding in computeUnifiedBounds**

In `packages/runner/src/layout/layout-cache.ts`, add the import and modify `computeUnifiedBounds`:

```typescript
// Add at top of file:
import { ZONE_HALF_HEIGHT, ZONE_HALF_WIDTH } from './layout-constants.js';

// Replace the return statement in computeUnifiedBounds (around line 67):
  return {
    minX: minX - ZONE_HALF_WIDTH,
    minY: minY - ZONE_HALF_HEIGHT,
    maxX: maxX + ZONE_HALF_WIDTH,
    maxY: maxY + ZONE_HALF_HEIGHT,
  };
```

**Step 4: Run tests**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/layout-cache.test.ts`
Expected: New tests PASS. Check that existing test "merges board and aux positions into a unified ZonePositionMap and bounds" still passes — its assertion checks that positions are >= minX and <= maxX, which will still hold because padding only widens the bounds.

**Step 5: Run full test suite**

Run: `pnpm -F @ludoforge/runner test -- --run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/runner/src/layout/layout-cache.ts packages/runner/test/layout/layout-cache.test.ts
git commit -m "fix: pad viewport bounds by half-zone dimensions to prevent edge clipping"
```

---

### Task 4: Fix graph layout — dynamic extent and zone-aware spacing

**Files:**
- Modify: `packages/runner/src/layout/compute-layout.ts`
- Test: `packages/runner/test/layout/compute-layout.test.ts`

**Step 1: Write failing tests**

Add these tests to `packages/runner/test/layout/compute-layout.test.ts` inside the `describe('computeLayout graph mode', ...)` block:

```typescript
import {
  ZONE_RENDER_WIDTH,
  ZONE_RENDER_HEIGHT,
} from '../../src/layout/layout-constants';

// ... inside existing describe('computeLayout graph mode', ...) block ...

it('minimum spacing between placed nodes exceeds zone diagonal', () => {
  const zoneIDs = Array.from({ length: 12 }, (_, index) => `z${index}`);
  const zones = zoneIDs.map((id, index) => zone(id, {
    zoneKind: 'board',
    adjacentTo: zoneIDs.filter((candidate) => candidate !== id && (Math.abs(index - Number(candidate.slice(1))) <= 1)),
  }));
  const layout = computeLayout(makeDef(zones), 'graph');
  const entries = [...layout.positions.values()];
  const zoneDiagonal = Math.hypot(ZONE_RENDER_WIDTH, ZONE_RENDER_HEIGHT);

  for (let left = 0; left < entries.length - 1; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const a = entries[left];
      const b = entries[right];
      if (a === undefined || b === undefined) {
        continue;
      }
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(zoneDiagonal - 1);
    }
  }
});

it('graph extent scales with node count — 20 nodes have wider bounds than 4', () => {
  const small = computeLayout(makeDef(buildLinearChain(4)), 'graph');
  const large = computeLayout(makeDef(buildLinearChain(20)), 'graph');
  const smallSpan = (small.boardBounds.maxX - small.boardBounds.minX)
    + (small.boardBounds.maxY - small.boardBounds.minY);
  const largeSpan = (large.boardBounds.maxX - large.boardBounds.minX)
    + (large.boardBounds.maxY - large.boardBounds.minY);

  expect(largeSpan).toBeGreaterThan(smallSpan * 1.5);
});
```

Also add the `buildLinearChain` helper at the bottom of the file (alongside existing helpers):

```typescript
function buildLinearChain(length: number): readonly ZoneDef[] {
  return Array.from({ length }, (_, index) => {
    const id = `n${index}`;
    const adjacentTo: string[] = [];
    if (index > 0) {
      adjacentTo.push(`n${index - 1}`);
    }
    if (index < length - 1) {
      adjacentTo.push(`n${index + 1}`);
    }
    return zone(id, { zoneKind: 'board', adjacentTo });
  });
}
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/compute-layout.test.ts`
Expected: FAIL — spacing is only 60, well below zone diagonal (~211)

**Step 3: Implement dynamic extent and zone-aware spacing**

In `packages/runner/src/layout/compute-layout.ts`:

1. Add import at top:
```typescript
import { ZONE_RENDER_HEIGHT, ZONE_RENDER_WIDTH } from './layout-constants.js';
```

2. Replace the fixed constants (lines 10-13):
```typescript
// REMOVE:
const GRAPH_ITERATIONS = 100;
const GRAPH_MIN_SPACING = 60;
const GRAPH_NORMALIZED_EXTENT = 1000;
const GRAPH_SPACING_RELAXATION_PASSES = 6;

// ADD:
const GRAPH_ITERATIONS = 100;
const GRAPH_NODE_SPACING_FACTOR = 2.5;
const GRAPH_MIN_SPACING_FACTOR = 1.3;
const GRAPH_SPACING_RELAXATION_PASSES = 10;
const GRAPH_MIN_EXTENT = 1000;
```

3. Add two helper functions after the constant block:
```typescript
function computeGraphExtent(nodeCount: number): number {
  const zoneDiagonal = Math.hypot(ZONE_RENDER_WIDTH, ZONE_RENDER_HEIGHT);
  const perNodeSpace = zoneDiagonal * GRAPH_NODE_SPACING_FACTOR;
  return Math.max(GRAPH_MIN_EXTENT, Math.ceil(Math.sqrt(nodeCount)) * perNodeSpace);
}

function computeGraphMinSpacing(): number {
  return Math.ceil(Math.hypot(ZONE_RENDER_WIDTH, ZONE_RENDER_HEIGHT) * GRAPH_MIN_SPACING_FACTOR);
}
```

4. Update `computeGraphLayout` to use dynamic values (replace lines 101-102):
```typescript
// REPLACE:
  normalizeToExtent(positions, GRAPH_NORMALIZED_EXTENT);
  enforceMinimumSpacing(positions, GRAPH_MIN_SPACING, GRAPH_SPACING_RELAXATION_PASSES);

// WITH:
  normalizeToExtent(positions, computeGraphExtent(nodeIDs.length));
  enforceMinimumSpacing(positions, computeGraphMinSpacing(), GRAPH_SPACING_RELAXATION_PASSES);
```

**Step 4: Run tests**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/compute-layout.test.ts`
Expected: New tests PASS.

**Important**: The existing test "enforces minimum spacing between all placed nodes" (line 71) checks `>= 60 - 1e-6`. The new minimum spacing is ~275, so this will still pass (275 >= 59.999...).

**Step 5: Run full test suite**

Run: `pnpm -F @ludoforge/runner test -- --run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/runner/src/layout/compute-layout.ts packages/runner/test/layout/compute-layout.test.ts
git commit -m "fix: graph layout uses dynamic extent and zone-aware minimum spacing"
```

---

### Task 5: Fix graph layout — attribute-enhanced seeding

**Files:**
- Modify: `packages/runner/src/layout/compute-layout.ts` (function `seedInitialPositions`)
- Test: `packages/runner/test/layout/compute-layout.test.ts`

**Step 1: Write failing tests**

Add to the `describe('computeLayout graph mode', ...)` block in `compute-layout.test.ts`:

```typescript
it('groups same-country zones into the same angular sector via attribute seeding', () => {
  const zones = [
    zone('a1', { zoneKind: 'board', adjacentTo: ['a2'], attributes: { country: 'alpha' }, category: 'city' }),
    zone('a2', { zoneKind: 'board', adjacentTo: ['a1', 'b1'], attributes: { country: 'alpha' }, category: 'province' }),
    zone('b1', { zoneKind: 'board', adjacentTo: ['a2', 'b2'], attributes: { country: 'beta' }, category: 'city' }),
    zone('b2', { zoneKind: 'board', adjacentTo: ['b1'], attributes: { country: 'beta' }, category: 'province' }),
  ];
  const layout = computeLayout(makeDef(zones), 'graph');

  const centroidAlpha = centroid([layout.positions.get('a1')!, layout.positions.get('a2')!]);
  const centroidBeta = centroid([layout.positions.get('b1')!, layout.positions.get('b2')!]);
  const interGroupDist = Math.hypot(centroidAlpha.x - centroidBeta.x, centroidAlpha.y - centroidBeta.y);

  const intraAlphaDist = Math.hypot(
    layout.positions.get('a1')!.x - layout.positions.get('a2')!.x,
    layout.positions.get('a1')!.y - layout.positions.get('a2')!.y,
  );

  expect(interGroupDist).toBeGreaterThan(intraAlphaDist * 0.5);
});

it('falls back to category-only seeding when zones lack grouping attributes', () => {
  const zones = [
    zone('x1', { zoneKind: 'board', adjacentTo: ['x2'], category: 'city' }),
    zone('x2', { zoneKind: 'board', adjacentTo: ['x1', 'y1'], category: 'city' }),
    zone('y1', { zoneKind: 'board', adjacentTo: ['x2', 'y2'], category: 'province' }),
    zone('y2', { zoneKind: 'board', adjacentTo: ['y1'], category: 'province' }),
  ];
  const layout = computeLayout(makeDef(zones), 'graph');

  expect(layout.positions.size).toBe(4);
  for (const position of layout.positions.values()) {
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
  }
});
```

Also add the `centroid` helper at the bottom:
```typescript
function centroid(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  return { x: sumX / points.length, y: sumY / points.length };
}
```

**Step 2: Run tests to verify behavior**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/compute-layout.test.ts`
Expected: The first test may or may not pass with current code (category-only seeding already creates some clustering). Check results.

**Step 3: Implement attribute-enhanced seeding**

In `packages/runner/src/layout/compute-layout.ts`, modify the `seedInitialPositions` function. Replace the category bucket building loop (lines 118-128) with:

```typescript
function seedInitialPositions(
  graph: ReturnType<typeof buildLayoutGraph>,
  sortedNodeIDs: readonly string[],
): void {
  const categoryBuckets = new Map<string, string[]>();

  for (const nodeID of sortedNodeIDs) {
    const key = buildSeedGroupKey(graph, nodeID);
    const bucket = categoryBuckets.get(key);
    if (bucket === undefined) {
      categoryBuckets.set(key, [nodeID]);
      continue;
    }
    bucket.push(nodeID);
  }

  // ... rest of the function stays the same (lines 130-158)
}
```

Add the helper function:
```typescript
function buildSeedGroupKey(
  graph: ReturnType<typeof buildLayoutGraph>,
  nodeID: string,
): string {
  const category = graph.getNodeAttribute(nodeID, 'category');
  const categoryStr = typeof category === 'string' && category.length > 0 ? category : '';
  const attributes = graph.getNodeAttribute(nodeID, 'attributes') as Record<string, unknown> | undefined;
  const country = typeof attributes?.country === 'string' ? attributes.country : '';
  if (country.length > 0) {
    return categoryStr.length > 0 ? `${country}:${categoryStr}` : country;
  }
  return categoryStr.length > 0 ? categoryStr : '__ungrouped__';
}
```

**Step 4: Run tests**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/compute-layout.test.ts`
Expected: All PASS

**Step 5: Run full test suite**

Run: `pnpm -F @ludoforge/runner test -- --run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/runner/src/layout/compute-layout.ts packages/runner/test/layout/compute-layout.test.ts
git commit -m "feat: attribute-enhanced seeding groups zones by country for graph layout"
```

---

### Task 6: Fix aux zone spacing

**Files:**
- Modify: `packages/runner/src/layout/aux-zone-layout.ts` (lines 5-7)
- Test: `packages/runner/test/layout/aux-zone-layout.test.ts`

**Step 1: Write failing tests**

Add these tests to the `describe('computeAuxLayout', ...)` block in `packages/runner/test/layout/aux-zone-layout.test.ts`:

```typescript
import { ZONE_RENDER_HEIGHT, ZONE_RENDER_WIDTH } from '../../src/layout/layout-constants';

// ... inside existing describe block ...

it('vertical spacing between consecutive zones exceeds zone height', () => {
  const result = computeAuxLayout([
    zone('a:none', { layoutRole: 'forcePool' }),
    zone('b:none', { layoutRole: 'forcePool' }),
    zone('c:none', { layoutRole: 'forcePool' }),
  ], BOARD_BOUNDS);

  const positions = ['a:none', 'b:none', 'c:none'].map((id) => result.positions.get(id)!);
  for (let i = 1; i < positions.length; i += 1) {
    const gap = Math.abs(positions[i]!.y - positions[i - 1]!.y);
    expect(gap).toBeGreaterThanOrEqual(ZONE_RENDER_HEIGHT);
  }
});

it('group spacing between different groups exceeds zone height', () => {
  const result = computeAuxLayout([
    zone('deck:none', { ordering: 'stack' }),
    zone('pool:none', { layoutRole: 'forcePool' }),
  ], BOARD_BOUNDS);

  const deckPos = result.positions.get('deck:none')!;
  const poolPos = result.positions.get('pool:none')!;
  const gap = Math.abs(poolPos.y - deckPos.y);
  expect(gap).toBeGreaterThan(ZONE_RENDER_HEIGHT);
});

it('sidebar X provides clearance so aux zones do not overlap board edge zones', () => {
  const result = computeAuxLayout([
    zone('deck:none', { ordering: 'stack' }),
  ], BOARD_BOUNDS);

  const deckPos = result.positions.get('deck:none')!;
  // The aux zone center minus half-width should not overlap with the board maxX plus half-width
  const auxLeftEdge = deckPos.x - ZONE_RENDER_WIDTH / 2;
  const boardRightEdge = BOARD_BOUNDS.maxX + ZONE_RENDER_WIDTH / 2;
  expect(auxLeftEdge).toBeGreaterThanOrEqual(boardRightEdge);
});

it('no two aux zones overlap when many zones are present', () => {
  const zones = Array.from({ length: 8 }, (_, i) => zone(`fp${i}:none`, { layoutRole: 'forcePool' }));
  const result = computeAuxLayout(zones, BOARD_BOUNDS);
  const entries = [...result.positions.values()];

  for (let left = 0; left < entries.length - 1; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const a = entries[left]!;
      const b = entries[right]!;
      // Zones are on the same X, so check vertical separation
      const verticalGap = Math.abs(a.y - b.y);
      expect(verticalGap).toBeGreaterThanOrEqual(ZONE_RENDER_HEIGHT);
    }
  }
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/aux-zone-layout.test.ts`
Expected: FAIL — current spacing (80) is less than zone height (110)

**Step 3: Implement zone-height-aware spacing**

In `packages/runner/src/layout/aux-zone-layout.ts`:

1. Add import at the top:
```typescript
import { ZONE_RENDER_HEIGHT, ZONE_RENDER_WIDTH } from './layout-constants.js';
```

2. Replace the spacing constants (lines 5-7):
```typescript
// REMOVE:
const SIDEBAR_MARGIN_X = 120;
const ZONE_VERTICAL_SPACING = 80;
const GROUP_VERTICAL_SPACING = 140;

// ADD:
const SIDEBAR_MARGIN_X = ZONE_RENDER_WIDTH + 40;
const ZONE_VERTICAL_SPACING = ZONE_RENDER_HEIGHT + 20;
const GROUP_VERTICAL_SPACING = ZONE_RENDER_HEIGHT + 60;
```

**Step 4: Run tests**

Run: `pnpm -F @ludoforge/runner test -- --run test/layout/aux-zone-layout.test.ts`
Expected: New tests PASS.

**Important**: The existing test "works with zero-area board bounds" (line 118) expects `{ x: 120, y: 0 }`. This will need to be updated to `{ x: 220, y: 0 }` (since SIDEBAR_MARGIN_X changed from 120 to 220). Update that assertion in the same step.

**Step 5: Fix the existing test expectation**

In `packages/runner/test/layout/aux-zone-layout.test.ts`, update line 125:
```typescript
// REPLACE:
    expect(result.positions.get('deck:none')).toEqual({ x: 120, y: 0 });
// WITH:
    expect(result.positions.get('deck:none')).toEqual({ x: ZONE_RENDER_WIDTH + 40, y: 0 });
```

**Step 6: Run full test suite**

Run: `pnpm -F @ludoforge/runner test -- --run`
Expected: All PASS

**Step 7: Commit**

```bash
git add packages/runner/src/layout/aux-zone-layout.ts packages/runner/test/layout/aux-zone-layout.test.ts
git commit -m "fix: aux zone spacing accounts for zone rendering dimensions"
```

---

### Task 7: Run full runner test suite and typecheck

**Step 1: Run all runner tests**

Run: `pnpm -F @ludoforge/runner test -- --run`
Expected: All PASS

**Step 2: Run typecheck**

Run: `pnpm -F @ludoforge/runner typecheck`
Expected: No errors

**Step 3: Run lint**

Run: `pnpm -F @ludoforge/runner lint`
Expected: No errors

**Step 4: Commit if any fixes were needed**

Only commit if Steps 1-3 required code fixes.

---

### Task 8: Final verification — visual check

**Step 1: Start the dev server**

Run: `pnpm -F @ludoforge/runner dev`

**Step 2: Load FITL in the browser**

Open http://localhost:5173 and load the FITL game definition. Verify:
1. All graph zones are visible without overlap
2. Aux zones on the right sidebar are clearly separated
3. You can pan to see all zones including edge zones (no clipping)
4. Zooming works correctly with the new bounds

**Step 3: Take a screenshot for comparison**

Save to `screenshots/fitl-map-fixed.png` for before/after comparison.

**Step 4: Commit screenshot**

```bash
git add screenshots/fitl-map-fixed.png
git commit -m "docs: add screenshot of fixed FITL board layout"
```
