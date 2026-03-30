# Map Representation Evaluation

Iterative evaluation of the FITL game map rendering quality. Each evaluation scores the current state from screenshots against 4 metrics and tracks progress across iterations.

## Screenshot Reference

- `screenshots/fitl-game-map.png` — Game canvas rendering of the FITL map, close-up view (primary evaluation target)
- `screenshots/fitl-game-map-overview.png` — Game canvas rendering of the FITL map, zoomed-out full map view (added Eval #2)
- `screenshots/fitl-map-editor.png` — Map editor rendering of the FITL map, close-up view (secondary evaluation target)
- `screenshots/fitl-map-editor-overview.png` — Map editor rendering of the FITL map, zoomed-out full map view (added Eval #3)
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

---

## EVALUATION #2

**Date**: 2026-03-30
**Screenshots analyzed**: fitl-game-map.png, fitl-map-editor.png, fitl-game-map-overview.png
**Screenshot set change**: Expanded from 2 to 3 scored screenshots. `fitl-game-map-overview.png` captures the full map at zoomed-out level, revealing route styling and overall layout that close-up shots obscured.

### Screenshot Analysis

#### fitl-game-map.png — Game Canvas Map
**What's shown**: A dark-themed game canvas showing approximately 6 provinces rendered as irregular polygons with shared borders. Three distinct terrain fill colors are visible: steel blue (highlands — Kontum), tan/khaki (lowlands — Binh Dinh, Pleiku/Darlac, Khanh Hoa), and muted green (jungle — Phu Bon Phu Yen). Cities are rendered as blue-gray circles (Qui Nhon visible). Tokens appear as small colored squares and circles inside provinces. Brown route lines cross the dark background. "Out of Play" boxes and a "Trucks Base Staging" area are visible on the right side. Faint region watermark text is barely visible.
**Issues observed**:
- Province polygon shapes are angular/geometric (parallelograms, trapezoids) rather than organic territorial outlines — they look like Voronoi cells cut with straight lines, not like the curved, natural shapes on the physical board
- Provinces share borders, which is a major improvement, but some borders produce awkward wedge-shaped gaps or overlaps rather than clean tessellation
- Roads are visible as thin brown lines and rivers as distinct lighter/blue-toned lines — route types are visually differentiated (confirmed at overview zoom)
- At close-up zoom, route styling differences are less obvious due to province fills partially occluding the lines — routes don't clearly flow through provinces
- Province labels use a small bitmap font that is difficult to read, especially on the darker terrain fills (blue highlands)
- Tokens are small and faction colors are still hard to distinguish at default zoom
- The dashed teal line running vertically on the right edge may represent the coast or a region boundary, but its purpose is unclear

#### fitl-map-editor.png — Map Editor
**What's shown**: A light cream-background editor view showing the same provinces as irregular polygons with the same three terrain colors. Brown route lines are visible connecting and crossing through provinces. City (Qui Nhon) rendered as a blue circle on the right edge. Clean, uncluttered view without tokens or overlays.
**Issues observed**:
- Same angular polygon shapes — straight-line borders without curves give provinces a geometric rather than geographic feel
- Route lines are visible but thin and connect between provinces rather than flowing naturally through territory — they still feel like graph edges
- Rivers and roads use distinct styling (color/weight), which is a positive improvement; however, both route types still terminate at province edges rather than flowing through territory
- Labels use small dark bitmap text that blends into the terrain fills, particularly on the tan/khaki provinces
- Qui Nhon city circle sits at the far right edge, disconnected from the surrounding province shape rather than embedded within it
- Some province border seams are visible where polygons meet imprecisely

#### fitl-game-map-overview.png — Game Canvas Full Map
**What's shown**: The full FITL game map at zoomed-out level. The upper portion shows the irregular polygon provinces (highlands, lowlands, jungle) with shared borders. The lower portion reveals many smaller green rectangular zones (LoC nodes/cities) connected by route lines in a graph layout. Route line styling differences are clearly visible at this zoom: roads and rivers use distinct colors/weights.
**Issues observed**:
- Route type distinction (roads vs. rivers) is clearly visible at overview zoom — this is a significant improvement from Eval #1
- LoC zones in the lower map are still rendered as small green rectangles rather than as route segments or embedded nodes — they break the territorial feel established by the province polygons
- The overall layout does not suggest the S-curve geography of Vietnam — the force-directed layout clusters provinces at the top with LoC rectangles scattered below
- At overview zoom, province labels become illegible — the bitmap font does not scale well
- The dashed teal boundary line (coast?) is more visible and adds useful geographic context

### Resolved Since Previous

- **Isolated rectangle provinces** — was CRITICAL in Eval #1, now addressed. Provinces are rendered as irregular polygons that share borders, replacing the floating green rectangles.
- **Single terrain color** — was CRITICAL in Eval #1, now partially addressed. Three distinct terrain fill colors (blue, tan, green) replace the uniform green, corresponding roughly to highlands, lowlands, and jungle.
- **Region watermark text** — was MEDIUM in Eval #1, now largely resolved. Watermarks are barely visible/absent compared to the prominent overlays in Eval #1.
- **Route type distinction** — was HIGH in Eval #1 (roads and rivers looked identical). Rivers and roads now use distinct colors/weights, clearly visible at overview zoom.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Adjacency Clarity | 6 | 2 | +4 | Provinces now share borders as irregular polygons — adjacency is implied by geography rather than requiring line-tracing. However, shapes are angular/geometric rather than organic, and some border joints are imprecise. |
| 2 | Road/River Integration | 5 | 3 | +2 | Roads and rivers are now visually distinct (different colors/weights, confirmed at overview zoom). However, routes still terminate at province edges rather than flowing through territory, and at close-up zoom the distinction is less clear due to province fill occlusion. |
| 3 | Terrain Distinction | 5 | 2 | +3 | Three terrain colors now visible (blue highlands, tan lowlands, green jungle). Big improvement but still lacks distinction for all FITL terrain types (e.g., no separate treatment for LoCs, no pattern/texture variation within categories). |
| 4 | Label/Token Readability | 4 | 3 | +1 | Labels are still small bitmap text. Slightly improved context from province shapes, but text remains hard to read especially on darker fills. Tokens are small with indistinct faction colors. |
| | **Average** | **5.0** | **2.5** | **+2.5** | |

**Comparability note**: This evaluation covers 3 screenshots (previous: 2). Score changes may partly reflect expanded coverage revealing pre-existing issues rather than regressions introduced since the last evaluation.

### Prioritized Recommendations

1. **[HIGH]** Soften province polygon shapes — replace straight-line borders with slightly curved or irregular edges to give provinces an organic, territorial feel rather than geometric/crystalline shapes. The physical board uses curved province boundaries that follow geographic features.
2. **[HIGH]** Increase label font size and add contrast treatment (text outline, drop shadow, or semi-transparent background pill) so province names are readable at default zoom on all terrain colors. Labels become illegible at overview zoom.
3. **[HIGH]** Add terrain variation within categories — the 3 base colors are a good start but FITL has nuanced terrain. Consider subtle texture/pattern overlays or shade variations (e.g., darker green for dense jungle vs. lighter green for mixed terrain).
4. **[HIGH]** Make routes flow through province territory rather than terminating at edges. Route type distinction (roads vs. rivers) is now good, but routes still connect to polygon borders as graph edges rather than flowing naturally through the landscape.
5. **[MEDIUM]** Restyle LoC zones from small green rectangles to a more integrated representation (e.g., route segments with embedded labels, or smaller territory-like shapes) so the lower map matches the territorial quality of the province polygons.
6. **[MEDIUM]** Embed city circles within their parent province shapes rather than placing them at the border edge. Qui Nhon appears disconnected from its surrounding territory.
7. **[MEDIUM]** Increase token size and add faction-specific visual markers (shapes or icons) so pieces are identifiable at default zoom. *(Recurring: 2 consecutive evaluations)*
8. **[LOW]** Clean up polygon border seams where adjacent provinces meet — small gaps/overlaps are visible at borders.
9. **[LOW]** Consider using the Vietnam geographic outline as a layout constraint so the overall map shape is recognizable. *(Recurring: 2 consecutive evaluations)*

---

## EVALUATION #3

**Date**: 2026-03-30
**Screenshots analyzed**: fitl-game-map.png, fitl-game-map-overview.png, fitl-map-editor.png, fitl-map-editor-overview.png
**Screenshot set change**: Expanded from 3 to 4 scored screenshots. `fitl-map-editor-overview.png` captures the full map in editor view, revealing the extent of polygon coverage vs. rectangle zones across the entire map layout.

### Screenshot Analysis

#### fitl-game-map.png — Game Canvas Close-Up
**What's shown**: Dark-themed game canvas showing ~5-6 provinces as irregular polygons with shared borders in the central highlands region. Three terrain fill colors: steel blue (Kontum — highlands), tan/khaki (Binh Dinh, Pleiku/Darlac, Khanh Hoa — lowlands), and green (Phu Bon Phu Yen — jungle). Qui Nhon rendered as a blue-gray circle at the right border. Tokens are small colored squares/circles inside provinces. "Out of Play" boxes and "Trucks Base Staging" on the right side. Brown route lines cross the dark background. Faint region watermarks barely visible.
**Issues observed**:
- Province polygon shapes unchanged from Eval #2 — still angular/geometric with straight-line borders (parallelograms, trapezoids) rather than organic territorial outlines
- Shared borders are maintained, but border joints still show imprecise seams in places
- Route lines (brown) still terminate at polygon edges rather than flowing through territory
- Labels remain small bitmap font, difficult to read on darker terrain fills (blue highlands especially)
- Tokens remain small with indistinct faction colors — the orange and blue squares are distinguishable, but subtle differences between faction types (e.g., guerrilla vs. troop) are not clear
- Qui Nhon city circle still sits at the far-right edge, disconnected from surrounding province territory

#### fitl-game-map-overview.png — Game Canvas Full Map
**What's shown**: Zoomed-out full map view on dark theme. The upper-center cluster of ~5-6 polygon provinces is visible. Below and around the polygon cluster, numerous small green rectangles represent LoC zones and cities (connected by route lines and thin adjacency lines). Dashed teal boundary line (coast) visible on the right. Several blue city circles scattered among the lower zones.
**Issues observed**:
- The polygon territory treatment covers only ~5-6 provinces — the vast majority of the ~30+ FITL zones remain as small green rectangles, creating a jarring visual split between the two rendering styles
- At overview zoom, province labels are completely illegible — the bitmap font does not scale
- LoC rectangles in the lower portion are uniform dark green with dashed borders, indistinguishable from each other by terrain type
- Route type distinction (roads vs. rivers) is visible at this zoom as different line colors/weights — this remains a positive
- Overall layout does not suggest Vietnam's S-curve geography

#### fitl-map-editor.png — Map Editor Close-Up
**What's shown**: Light cream-background editor view of the same ~5-6 polygon provinces. Labels are more legible on the light background: Kontum, Binh Dinh, Phu Bon Phu Yen, Pleiku Darlac, Khanh Hoa are readable. Qui Nhon city as a blue circle. Brown and light-gray route lines connect provinces. No tokens or overlays.
**Issues observed**:
- Same angular polygon shapes with straight-line borders — unchanged from Eval #2
- Labels are more readable than on the dark game canvas, but still use a small font that will not scale well at normal zoom
- Route lines still terminate at polygon edges rather than flowing through provinces
- Qui Nhon city circle still disconnected from its surrounding territory
- Clean, uncluttered view is positive for editing, but border seams between polygons remain visible

#### fitl-map-editor-overview.png — Map Editor Full Map (NEW)
**What's shown**: Full map in editor view on light cream background. The polygon province cluster (~5-6 zones) is in the upper-center area. Surrounding and below it: many dark green rectangles representing LoC zones and other provinces (Northern Laos, Southern Cambodia, Northwest Cambodia, The Fishhook, The Flatlands, etc.). Cities as blue circles (Da Nang, An Loc, Can Ranh). "Available" and "Out of Play" faction boxes along the right edge. Brown route lines connect zones throughout.
**Issues observed**:
- The editor overview clearly reveals the extent of the problem: only ~5-6 provinces have polygon territorial shapes; the remaining 20+ zones are uniform dark green rectangles with no terrain distinction or shared borders
- LoC zones (Northern Laos, Southern Cambodia, etc.) are identical dark green rectangles — no terrain or geographic differentiation
- The layout is vertically elongated but does not follow Vietnam's geography — Laos and Cambodia zones are scattered to the left, but spatial relationships are approximate at best
- Labels are readable on the light background at this zoom level (positive)
- Route lines are visible connecting zones, but all appear as the same brown color — the road/river distinction visible in the game canvas is less clear in the editor overview

### Cross-View Consistency

Game canvas and editor views are consistent for the overlapping polygon province area — same shapes, same terrain colors (steel blue, tan, green), same city placement. The editor overview reveals zones not visible in the game canvas close-up that are rendered as rectangles in both views. One discrepancy: route type distinction (road vs. river color/weight) is clearer in the game canvas than in the editor, where routes appear more uniformly brown.

### Resolved Since Previous

No issues from the previous evaluation were resolved. The rendering appears unchanged since Eval #2; the only difference is the expanded screenshot coverage.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Adjacency Clarity | 5 | 6 | -1 | The polygon provinces still share borders (unchanged from Eval #2), but the editor overview reveals that only ~5-6 of 30+ zones have this treatment. The vast majority remain isolated rectangles. Adjusting downward to reflect the full map reality now visible. *(Not a regression in code — a comparability adjustment from expanded screenshot coverage.)* |
| 2 | Road/River Integration | 5 | 5 | 0 | Unchanged. Roads and rivers remain visually distinct in the game canvas but routes still terminate at polygon/rectangle edges rather than flowing through territory. Editor overview shows less road/river distinction than the game canvas. |
| 3 | Terrain Distinction | 4 | 5 | -1 | The ~5-6 polygon provinces still use 3 terrain colors. However, the editor overview reveals 20+ zones rendered as identical dark green rectangles with no terrain differentiation whatsoever. Adjusting downward to reflect the full map reality. *(Not a regression in code — a comparability adjustment.)* |
| 4 | Label/Token Readability | 4 | 4 | 0 | Unchanged. Labels are small bitmap font, hard to read on dark theme, somewhat readable on editor light theme. Tokens remain small with indistinct faction markers. Editor overview labels are readable (positive). |
| | **Average** | **4.5** | **5.0** | **-0.5** | |

**Comparability note**: This evaluation covers 4 screenshots (previous: 3). The editor overview (`fitl-map-editor-overview.png`) revealed that polygon territory rendering covers only ~5-6 provinces out of 30+. The score decreases in Adjacency Clarity and Terrain Distinction reflect this expanded visibility, not code regressions — the rendering itself appears unchanged since Eval #2.

### Prioritized Recommendations

1. **[CRITICAL]** Extend polygon territory rendering to ALL province zones, not just the current ~5-6. The editor overview reveals that the vast majority of FITL zones are still uniform dark green rectangles with no shared borders. This is the highest-impact gap — the territorial polygon treatment proved effective for the central highlands cluster and needs to be applied map-wide. *(New — revealed by expanded screenshot coverage)*
2. **[HIGH]** Soften province polygon shapes — replace straight-line borders with slightly curved or irregular edges to give provinces an organic, territorial feel. The physical board uses curved province boundaries. *(Recurring: 2 consecutive evaluations)*
3. **[HIGH]** Increase label font size and add contrast treatment (text outline, drop shadow, or semi-transparent background pill) so province names are readable at all zoom levels and on all terrain colors. *(Recurring: 2 consecutive evaluations)*
4. **[HIGH]** Add terrain-specific colors for ALL zone types. LoC zones, Laos/Cambodia areas, and other non-polygon zones are all identical dark green — they need terrain-appropriate fills. *(Recurring: 2 consecutive evaluations — previously noted for LoC zones, now confirmed across the full map)*
5. **[HIGH]** Make routes flow through province territory rather than terminating at edges. Route type distinction (roads vs. rivers) is good in game canvas but needs to be consistent in the editor view as well. *(Recurring: 3 consecutive evaluations)*
6. **[MEDIUM]** Embed city circles within their parent province shapes rather than placing them at the border edge. *(Recurring: 2 consecutive evaluations)*
7. **[MEDIUM]** Increase token size and add faction-specific visual markers so pieces are identifiable at default zoom. *(Recurring: 3 consecutive evaluations)*
8. **[LOW]** Clean up polygon border seams where adjacent provinces meet. *(Recurring: 2 consecutive evaluations)*
9. **[LOW]** Use Vietnam's geographic outline as a layout constraint so the overall map shape is recognizable to FITL players. *(Recurring: 3 consecutive evaluations)*
