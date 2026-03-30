---
name: map-representation-plan
description: Use when the latest map evaluation is ready and a plan for improvements is needed. Reads the most recent EVALUATION from reports/map-representation-evaluation.md, researches rendering techniques, brainstorms solutions, and produces a concrete implementation plan in reports/map-representation-plan.md.
---

# Map Representation Planning

Read the latest evaluation, research rendering approaches, and produce a concrete implementation plan for the next improvement iteration.

**This skill produces `reports/map-representation-plan.md` as its sole artifact.** If invoked within plan mode, the plan mode file is a working scratchpad — the report file is the deliverable. Do not proceed to implementation after writing the report — the `map-representation-implement` skill consumes this plan in a separate invocation.

## Checklist

1. Read `reports/map-representation-evaluation.md` — focus on the latest EVALUATION #N. Note the scores, CRITICAL/HIGH recommendations, and any recurring or stagnating issues. Determine the iteration number: if the latest evaluation is #N, the plan iteration is N+1.
2. Read `docs/FOUNDATIONS.md` — **all proposals must align** with these principles. Pay special attention to:
   - **Foundation #1** (Engine Agnosticism): No game-specific logic in engine code
   - **Foundation #3** (Visual Separation): All visual changes in visual-config.yaml or runner code, never in GameSpecDoc or engine
   - **Foundation #7** (Immutability): State transitions return new objects
   - **Foundation #9** (No Backwards Compatibility): No shims or deprecated fallbacks
   - **Foundation #10** (Architectural Completeness): Solutions address root causes, not symptoms
3. Identify the CRITICAL and HIGH recommendations from the evaluation. If none exist, target the top 2-3 MEDIUM recommendations.
4. Read the renderer source files relevant to the identified problems (see Key Files). Extract: key type definitions with line numbers, function signatures that will be modified, data flow from config through presentation to renderer. Use Explore sub-agents for parallel codebase exploration when multiple renderer subsystems are involved. The goal is to populate the "Current Code Architecture" section of the plan output.
5. Optionally read the game's physical reference image (e.g., `screenshots/FITL_SC1.jpg`) for design inspiration when planning visual changes. Use it as a target aesthetic, not a rigid specification.
6. **Research phase** (if needed): If the identified problems require techniques not already present in the codebase, use Tavily web search and/or Context7 to research rendering techniques. Skip external research when the solution extends existing patterns — if skipped, note in the Research Sources section why it was unnecessary (e.g., "All solutions extend existing PixiJS Graphics and BitmapText patterns already in the codebase"). Examples of research topics:
   - Voronoi tessellation / Delaunay triangulation in PixiJS or 2D canvas
   - Polygon-based territory rendering in strategy games
   - Procedural map border generation algorithms
   - Terrain coloring and texture techniques in 2D renderers
   - Route rendering through irregular polygons
   - PixiJS Graphics polygon drawing, mesh rendering, or shader approaches
   - How other digital COIN-series implementations render maps
7. For the top 2-3 problems, brainstorm **2-3 solution approaches** each, with trade-offs:
   - Feasibility (how much code change, how many files)
   - Visual impact (how much does it improve the metric)
   - Risk (what could break, what regressions are possible)
   - Foundation alignment (does it respect all relevant principles)
8. Select the recommended approach for each problem, applying the **1-3-1 rule**: 1 clearly defined problem, 3 potential options, 1 recommendation. If the best recommendation combines elements of multiple approaches, present it as a hybrid with clear attribution (e.g., "Approach 1 + partial Approach 2"). Explain which elements are taken from each and why the combination is better than either alone.
9. **Map editor scope assessment**: For each proposed change, assess whether the map editor (`packages/runner/src/map-editor/`) needs updating in this iteration:
   - If the change is purely rendering (e.g., drawing polygons instead of rectangles from the same position data), the editor may just need to call the same drawing function — include it.
   - If the change requires new editor interaction patterns (e.g., vertex dragging for polygons), defer to a future iteration — note what's deferred and why.
10. Delete `reports/map-representation-plan.md` if it exists, then write the new plan to that path. The plan is **overwritten** each iteration, not appended.
11. **Stop.** This skill's sole output is `reports/map-representation-plan.md`. Do not proceed to implementation — the `map-representation-implement` skill consumes this plan in a separate invocation.

## Plan Output Format

Write `reports/map-representation-plan.md` with this structure:

```markdown
# Map Representation Plan — Iteration N

**Date**: YYYY-MM-DD
**Based on**: EVALUATION #N (average score: X.X)
**Problems targeted**: [list of CRITICAL/HIGH/MEDIUM items addressed]

## Context

[1-3 sentences: why this change is needed, what prompted it, and the intended outcome]

## Foundations Alignment

| Foundation | Relevance | How This Plan Respects It |
|-----------|-----------|--------------------------|
| #1 Engine Agnosticism | [relevant/not relevant] | [brief explanation] |
| #3 Visual Separation | Always relevant | [how changes stay in runner/visual-config] |
| #7 Immutability | [relevant/not relevant] | [brief explanation] |
| #9 No Backwards Compat | [relevant/not relevant] | [brief explanation] |
| #10 Architectural Completeness | Always relevant | [root cause vs symptom] |

## Current Code Architecture (reference for implementer)

Document the exact interfaces, function signatures, and data flow relevant to the
problems targeted. This section must make the plan self-sufficient — an implementer
reading only this file should not need to re-explore the codebase.

Include:
- Key type/interface definitions with file paths and line numbers
- Function signatures that will be modified
- Data flow from config → presentation → renderer
- Coordinate systems and conventions the implementer must follow
- Current code snippets showing what will change (before state)
- Schema inheritance relationships (e.g., override schemas extending base schemas)

## Problem 1: [Problem title from evaluation]

**Evaluation score**: Metric X = Y/10
**Root cause**: [Why this problem exists in the current rendering code]

### Approaches Considered

1. **[Approach A]**: [description]
   - Feasibility: [LOW/MEDIUM/HIGH]
   - Visual impact: [LOW/MEDIUM/HIGH]
   - Risk: [description of what could break]

2. **[Approach B]**: [description]
   - Feasibility: [LOW/MEDIUM/HIGH]
   - Visual impact: [LOW/MEDIUM/HIGH]
   - Risk: [description]

3. **[Approach C]**: [description]
   - Feasibility: [LOW/MEDIUM/HIGH]
   - Visual impact: [LOW/MEDIUM/HIGH]
   - Risk: [description]

### Recommendation: [Approach X]

**Why**: [reasoning]

[Repeat for Problem 2, 3...]

## Implementation Steps

Ordered steps with dependencies noted:

1. [Step description] — **File**: `path/to/file.ts` — **Depends on**: none
2. [Step description] — **File**: `path/to/file.ts` — **Depends on**: Step 1
...

## Map Editor Scope

**Included in this iteration**:
- [List of editor changes included, if any]

**Deferred to future iteration**:
- [List of editor changes deferred, with reasoning]

## Visual Config Changes

[If visual-config.yaml or visual-config-types.ts schema changes are needed, list them explicitly]

## Verification

1. `pnpm turbo typecheck` — must pass
2. `pnpm -F @ludoforge/runner test` — must pass
3. Visual check: [what to look for when running the game after implementation]

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| [risk description] | LOW/MEDIUM/HIGH | [what breaks] | [how to prevent or recover] |

## Research Sources

- [URL or description of research that informed the plan]
```

## Key Files

| File | What It Controls |
|------|-----------------|
| `packages/runner/src/canvas/renderers/zone-renderer.ts` | Game canvas zone rendering (shape, fill, stroke, labels, badges) |
| `packages/runner/src/canvas/renderers/shape-utils.ts` | Shape drawing primitives (`drawZoneShape()` — rectangle, circle, polygon, etc.) |
| `packages/runner/src/canvas/renderers/adjacency-renderer.ts` | Adjacency line rendering (dashed segments between zone edges) |
| `packages/runner/src/canvas/renderers/connection-route-renderer.ts` | Road/river route rendering (Bezier curves, wave effects) |
| `packages/runner/src/canvas/geometry/dashed-segments.ts` | Dashed line algorithm |
| `packages/runner/src/canvas/renderers/stroke-dashed-segments.ts` | Rendering dashed segments to PixiJS Graphics |
| `packages/runner/src/config/visual-config-types.ts` | Zod schemas for visual config (zone shapes, stroke styles) |
| `packages/runner/src/config/visual-config-defaults.ts` | ZoneShape type union, default dimensions |
| `packages/runner/src/config/visual-config-provider.ts` | Visual config accessor methods |
| `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` | Region boundary rendering (convex hull, labels, watermark alpha) |
| `packages/runner/src/layout/world-layout-model.ts` | Layout model types (zone positions) |
| `data/games/fire-in-the-lake/visual-config.yaml` | FITL-specific visual configuration |
| `packages/runner/src/presentation/presentation-scene.ts` | Label positioning, zone render spec construction, fill color resolution |
| `packages/runner/src/canvas/renderers/zone-presentation-visuals.ts` | Marker labels, badge visuals |
| `packages/runner/src/canvas/text/bitmap-font-registry.ts` | Bitmap font installation and configuration |
| `packages/runner/src/canvas/renderers/token-renderer.ts` | Token rendering, sizing, and positioning |
| `packages/runner/src/map-editor/map-editor-zone-renderer.ts` | Map editor zone rendering |
| `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` | Map editor adjacency lines |

## Research Guidelines

When using Tavily or Context7:
- Search for **PixiJS-specific** techniques first (the renderer uses PixiJS 8)
- Look for **strategy game map rendering** examples and open-source implementations
- Check for **lightweight libraries** that could provide Voronoi/Delaunay without heavy dependencies
- Prefer solutions that work with **Graphics primitives** (polygon, path) over shader-based approaches for maintainability
- Note the **license** of any library considered — the project is GPL-3.0

## Vertex Design Guidelines

When the plan proposes custom polygon shapes for zones:

- **Coordinate system**: Vertices are relative to zone center `(0, 0)`, matching how all existing shapes draw. The zone container is positioned at the zone's world `(x, y)` coordinates.
- **Format**: Flat alternating `[x1, y1, x2, y2, ...]` array matching `Graphics.poly()` input.
- **Shared borders**: Adjacent zones must share border edge coordinates (same vertex pair in reverse order) so territories tile without gaps.
- **Vertex count**: 5-8 vertices per zone is reasonable for territory shapes. More adds visual fidelity but increases YAML verbosity.
- **Incremental approach**: Start with a cluster of 4-5 adjacent zones to validate the rendering pipeline. Extend to full tessellation in subsequent iterations.
- **Size reference**: Current default province rectangles are 360x220. Polygon vertices should produce shapes of comparable area.

## Scope Constraints

- Do not propose engine code changes (`packages/engine/`) — Foundation #3
- Do not propose GameSpecDoc YAML changes — Foundation #1
- All rendering changes must be in runner source or visual-config
- Focus on the evaluation's top 2-3 recommendations — don't scope-creep
- If a proposed change is too large for one iteration, split it and note what's deferred
