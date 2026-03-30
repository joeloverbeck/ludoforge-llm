# Map Representation Evaluation

Iterative evaluation of the FITL game map rendering quality. Each evaluation scores the current state from screenshots against 4 metrics and tracks progress across iterations.

## Screenshot Reference

- `screenshots/fitl-game-map.png` — Game canvas rendering of the FITL map (primary evaluation target)
- `screenshots/fitl-map-editor.png` — Map editor rendering of the FITL map (secondary evaluation target)
- `screenshots/FITL_SC1.jpg` — Physical FITL board game (reference only, not scored)

## Scoring Guide

- **1-3**: Unusable — rectangles with disconnected lines, no spatial relationship between provinces
- **4-5**: Poor — some improvement but provinces still feel like isolated boxes
- **6-7**: Adequate — provinces have territory-like shapes, adjacencies partially implied by borders
- **8-9**: Good — provinces share borders naturally, routes flow through territories, terrain is clear
- **10**: Excellent — a player familiar with the physical board would recognize the map immediately

## Metrics

| # | Metric | What It Measures |
|---|--------|-----------------|
| 1 | Adjacency Clarity | Do province borders/shared edges imply adjacency without relying solely on dashed lines? |
| 2 | Road/River Integration | Do routes flow through/between province shapes naturally rather than connecting to rectangle edges? |
| 3 | Terrain Distinction | Are terrain types (highlands, lowlands, jungle, etc.) visually distinguishable? |
| 4 | Label/Token Readability | Are zone names and game pieces clearly visible inside province shapes? |

## What to Look For

- Provinces rendered as isolated rectangles with no shared borders
- Adjacency lines that connect to rectangle edges rather than flowing between territories
- Roads and rivers that terminate at rectangle corners instead of flowing through provinces
- Terrain types that are indistinguishable (all same shade of green)
- Province labels obscured by shape borders, tokens, or adjacency lines
- Token stacks that overflow province boundaries
- Wasted space between provinces where borders should be shared
- Missing or misleading adjacency connections
- Routes that cross provinces they shouldn't pass through
- **Regressions** — issues absent in previous evaluations that appeared after recent changes

---

## EVALUATION #1

**Date**: 2026-03-30
**Screenshots analyzed**: fitl-game-map.png, fitl-map-editor.png

### Screenshot Analysis

#### fitl-game-map.png — Game Canvas Map
**What's shown**: A dark-themed game canvas showing approximately 8-10 provinces rendered as isolated green rectangles with dashed teal borders. Cities are rendered as blue circles. Thin cyan/teal lines connect provinces to indicate adjacency. Large faded text watermarks ("Central", "South") overlay parts of the map. Token pieces appear as small colored squares inside provinces. A toolbar/scoreboard occupies the top of the screen.
**Issues observed**:
- Provinces are uniform green rectangles with no shared borders — every province is an isolated box floating in dark space with large gaps between them
- Adjacency is shown exclusively through thin dashed/solid lines connecting rectangle edges — there is no spatial implication of adjacency from province shapes
- Roads and rivers are not distinguishable from generic adjacency lines — all connections look the same (thin cyan lines)
- Terrain types are indistinguishable — all provinces appear as the same shade of muted green regardless of whether they represent highlands, lowlands, jungle, or other terrain
- Province labels are extremely small and placed below rectangles, making them difficult to read against the dark background
- Token pieces (small colored squares) are visible but very small, and their faction affiliation is hard to discern
- Large watermark text ("Central", "South") overlays the map and competes with actual game information
- The overall layout has no resemblance to the Vietnam geography of the physical FITL board — provinces are scattered in a force-directed graph layout

#### fitl-map-editor.png — Map Editor
**What's shown**: A light-themed editor view showing a subset of provinces as green rectangles and cities as blue circles. The layout is similar to the game canvas but with a cream/beige background. Blue wavy lines indicate rivers, and thin brown/gray lines indicate other connections. Province names are rendered in a serif font below each shape.
**Issues observed**:
- Same isolated rectangle problem — provinces are green boxes with no shared borders or territorial shapes
- River rendering (blue wavy lines) is a positive distinction from other connection types, but rivers connect to rectangle corners rather than flowing naturally through terrain
- Road connections (thin brown lines radiating from Saigon) are distinguishable from adjacency but terminate at rectangle edges
- Only two shades of green visible (dark green and olive green) — insufficient terrain distinction for the 4+ terrain types in FITL
- Labels are rendered in a small serif font that is somewhat legible on the light background but would not scale well at normal zoom levels
- Significant wasted space between provinces — the force-directed layout spreads zones too far apart
- Cities (circles) feel disconnected from their surrounding provinces rather than being embedded within territorial boundaries

### Resolved Since Previous

No previous evaluation exists — this is the baseline evaluation.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Adjacency Clarity | 2 | — | — | Provinces are isolated rectangles with no shared borders. Adjacency is conveyed only through thin connecting lines, requiring the player to trace lines rather than seeing spatial relationships. |
| 2 | Road/River Integration | 3 | — | — | Rivers have a distinct wavy style (visible in editor) which is a positive start, and roads use a different color. However, all routes connect to rectangle edges/corners rather than flowing through territory. Routes feel like graph edges, not geographic features. |
| 3 | Terrain Distinction | 2 | — | — | Only 1-2 shades of green are used across all provinces. Highlands, lowlands, jungle, and other FITL terrain types are visually identical. A player cannot determine terrain type from the rendering. |
| 4 | Label/Token Readability | 3 | — | — | Labels exist but are very small. In the game canvas (dark theme), labels are nearly illegible. In the editor (light theme), labels are slightly better but still small. Tokens are tiny colored squares whose faction is hard to identify. |
| | **Average** | **2.5** | **—** | **—** | |

### Prioritized Recommendations

1. **[CRITICAL]** Replace rectangle province shapes with irregular polygons or Voronoi-style territories that share borders with adjacent provinces. This is the single most impactful change — the current isolated rectangles are the root cause of low scores across all four metrics. The physical FITL board uses organic province shapes that share borders, making adjacency implicit from geography.
2. **[CRITICAL]** Implement terrain-specific fill colors/patterns. FITL uses distinct terrain types (highlands, lowlands, jungle, cities, LoCs) that need visually distinct treatment. Use a color palette inspired by the physical board: tan/brown for highlands, green for lowlands, dark green for jungle, distinct markers for LoCs.
3. **[HIGH]** Make routes (roads, rivers) flow through province territory rather than connecting rectangle edges. Rivers should follow natural-looking paths between/through provinces. Roads should be rendered as distinct line styles (e.g., solid brown for roads vs. blue wavy for rivers).
4. **[HIGH]** Increase label font size and use high-contrast text rendering. Province names should be clearly readable at default zoom. Consider text outlines or background pills for legibility on varied backgrounds.
5. **[MEDIUM]** Remove or significantly reduce the opacity of the region watermark text ("Central", "South"). These large text overlays compete with actual game information and obscure provinces.
6. **[MEDIUM]** Increase token size and add faction-specific visual markers (shapes, icons, or distinct color coding) so pieces are identifiable at a glance.
7. **[LOW]** Consider using the Vietnam geographic outline as a layout constraint so the overall map shape is recognizable to FITL players.
