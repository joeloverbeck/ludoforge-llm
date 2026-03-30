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

---

## EVALUATION #4

**Date**: 2026-03-30
**Screenshots analyzed**: fitl-game-map.png, fitl-game-map-overview.png, fitl-map-editor.png, fitl-map-editor-overview.png

### Screenshot Analysis

#### fitl-game-map.png — Game Canvas Close-Up
**What's shown**: Dark-themed game canvas showing a cluster of large irregular polygons in the central-northern region. Visible provinces: Central Laos (dark green), Southern Laos (dark green), a large tan/khaki province (Quang Nam area), Quang Tin Quang Ngai (bright green), and several additional tan provinces extending south. Da Nang city as a blue-gray circle on the right edge. Tokens visible as colored squares (orange, yellow near Da Nang) and red circles (in Laos provinces). Dashed teal coast line on the right. Brown/gray route lines cross the map.
**Issues observed**:
- Polygon territory rendering now covers many more provinces than Eval #3 — the close-up reveals at least 8-10 polygon provinces with shared borders, up from ~5-6
- Three distinct terrain fill colors are clearly visible: dark green (jungle/Laos), tan/khaki (lowlands), and bright green (a third terrain category)
- Province labels have dark semi-transparent background pills ("Central Laos", "Southern Laos", "Quang Tin Quang Ngai") — improved legibility over previous evaluations
- Polygon shapes remain angular/geometric with straight-line borders — no organic curves
- Route lines (brown) are visible but still feel like graph edges connecting polygon borders rather than geographic features flowing through territory
- City circle (Da Nang) still sits at the polygon border edge rather than being embedded within surrounding territory
- Token icons are small but faction colors (red, orange, yellow, blue) are distinguishable at this zoom level — an improvement from previous evaluations

#### fitl-game-map-overview.png — Game Canvas Full Map
**What's shown**: Full map at zoomed-out level on dark theme. The map is now dominated by polygon territories covering the majority of visible area. The upper portion shows Northeast Cambodia, Central Laos areas (dark green), with tan/khaki provinces in the north-central area. The middle section shows large dark green polygons (Southern Laos, The Fishhook) alongside tan provinces. The southern portion around Saigon shows a cluster of lighter green polygons, with some congestion where many provinces and route lines overlap. Cities as blue circles along the right edge. "Out of Play" and "Trucks Base Staging" boxes on the far right.
**Issues observed**:
- Dramatic improvement: polygon territory rendering now covers the vast majority of the map — approximately 25-30 province zones rendered as territories, up from ~5-6 in Eval #3
- Three terrain colors visible map-wide: dark green, tan/khaki, and light/bright green
- The southern Saigon area is visually congested — many small polygons, overlapping route lines, and a darker rendering area where province boundaries are hard to distinguish
- Labels are present but very small at overview zoom — province names are barely legible
- The overall map shape is now roughly vertically elongated (north-south), which better approximates Vietnam's geography than previous evaluations, though it still doesn't clearly suggest the S-curve of the physical map
- Route lines are visible connecting cities but styling details (road vs. river) are hard to distinguish at this zoom
- Some dark rendering artifacts around Saigon area where polygon fills, route lines, and adjacency lines overlap

#### fitl-map-editor.png — Map Editor Close-Up
**What's shown**: Light cream-background editor view showing the same central region. Provinces as large irregular polygons: Quang Nam (tan), Southern Laos (dark green), Quang Tin Quang Ngai (bright green), Binh Dinh (tan). Da Nang and Qui Nhon as blue circles. Brown route lines connecting cities. Clean, uncluttered view without tokens.
**Issues observed**:
- Polygon shapes match the game canvas — consistent rendering between views (positive)
- Labels are more readable on the light background than the dark game canvas ("Southern Laos", "Quang Nam", "Binh Dinh" clearly visible)
- Province borders share edges cleanly in this region — good tessellation
- Route lines (brown) connect between cities but still terminate at polygon edges rather than flowing through territory
- Qui Nhon city circle sits at the far-right border edge, disconnected from surrounding territory
- Polygon shapes still have straight-line angular borders — geometric rather than organic

#### fitl-map-editor-overview.png — Map Editor Full Map
**What's shown**: Full map in editor view on light cream background. This is the most revealing screenshot. The entire map is now covered with polygon territories from top (North Vietnam) to bottom (Mekong Delta area). Provinces visible include: North Vietnam (tan), Quang Tri (tan), Central Laos (dark green), Southern Laos (dark green), Northeast Cambodia (dark green), Northwest Cambodia (dark green), The Fishhook (dark green), Quang Tin Quang Ngai (bright green), Cam Lien Can Tho (bright green), and many more. Cities (blue circles): Hue, Da Nang, Qui Nhon, Cam Ranh, Saigon visible along the right edge. "Available", "Out of Play", and "Trucks Base Staging" boxes on the right side.
**Issues observed**:
- ALL province zones are now rendered as polygon territories with shared borders — no more isolated green rectangles. This resolves the CRITICAL recommendation from Eval #3
- Three terrain colors applied map-wide: dark green (jungle/forest — Laos, Cambodia, southern forests), tan/khaki (lowlands — coastal Vietnam, northern plains), bright green (specific provinces — Quang Tin Quang Ngai, Cam Lien Can Tho, others)
- One province near the bottom appears white/cream colored — possibly missing terrain assignment or representing a distinct terrain type (Tay Ninh area?)
- The vertically elongated layout approximates Vietnam's geography — Laos/Cambodia provinces on the left, coastal Vietnam on the right with cities along the edge
- Labels are readable throughout on the light background — small but legible at this zoom
- Route lines (brown) connect cities along the coast — all appear as the same brown color; road/river distinction is not visible in the editor
- Some polygon border seams visible where provinces meet, particularly in the southern congested area
- The overall impression is now of a contiguous territory map rather than isolated zones — a fundamental quality improvement

### Cross-View Consistency

Game canvas and editor views are consistent for the overlapping areas — same polygon shapes, same terrain colors (dark green, tan, bright green), same city placement. The editor overview confirms full polygon coverage that was partially visible in the game canvas overview. One discrepancy: route type distinction (roads vs. rivers) appears clearer in the game canvas (different line weights/colors) than in the editor overview where routes appear uniformly brown. The congested Saigon area in the game canvas has darker rendering artifacts not present in the cleaner editor view.

### Resolved Since Previous

- **Limited polygon coverage (~5-6 provinces)** — was CRITICAL in Eval #3, now fully resolved. All province zones are rendered as polygon territories with shared borders. This was the highest-impact recommendation and has been comprehensively addressed.
- **Uniform dark green for non-polygon zones** — was HIGH in Eval #3 (LoC zones, Laos/Cambodia all identical dark green rectangles). Now all zones have terrain-appropriate polygon fills with three distinct colors applied map-wide.
- **Vietnam geographic outline** — was LOW in Eval #3. The vertically elongated layout with Laos/Cambodia on the left and coastal Vietnam on the right now better approximates the physical map geography, though the S-curve is not pronounced.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Adjacency Clarity | 7 | 5 | +2 | All provinces now share borders as polygon territories — adjacency is implied by geography map-wide, not just for a small cluster. Shapes are still angular/geometric rather than organic, which prevents a higher score. Some border congestion in the Saigon area. |
| 2 | Road/River Integration | 5 | 5 | 0 | Unchanged. Routes are visible and road/river distinction exists in the game canvas, but routes still terminate at polygon edges rather than flowing through territory. Editor view shows less route type distinction. |
| 3 | Terrain Distinction | 6 | 4 | +2 | Three terrain colors now applied across the entire map (dark green, tan/khaki, bright green). Major improvement from the full-map uniform dark green in Eval #3. Still lacks finer terrain granularity (e.g., highlands vs. lowlands use the same tan) and one province may have a missing terrain assignment (white/cream fill). |
| 4 | Label/Token Readability | 5 | 4 | +1 | Labels now have dark background pills in the game canvas, improving legibility. Editor labels readable on light background. At overview zoom, labels are still very small. Tokens are small but faction colors are more distinguishable than before. |
| | **Average** | **5.75** | **4.5** | **+1.25** | |

**Polygon coverage**: ~28-30/35 province zones rendered as territories (vs. ~5-6 in Eval #3). Effectively full coverage.

### Score Trend (4 evaluations — included early for visibility)

| Eval | Avg | Delta |
|------|-----|-------|
| #1   | 2.5 | — |
| #2   | 5.0 | +2.5 |
| #3   | 4.5 | -0.5 |
| #4   | 5.75 | +1.25 |

### Prioritized Recommendations

1. **[HIGH]** Soften province polygon shapes — replace straight-line borders with slightly curved or irregular edges to give provinces an organic, territorial feel rather than the current geometric/crystalline appearance. The physical board uses curved boundaries following geographic features. *(Recurring: 3 consecutive evaluations)*
2. **[HIGH]** Make routes flow through province territory rather than terminating at polygon edges. Route type distinction (roads vs. rivers) is visible in the game canvas but routes still feel like graph edges, not geographic features. Ensure road/river distinction is consistent in the editor view as well. *(Recurring: 4 consecutive evaluations)*
3. **[HIGH]** Add finer terrain granularity — the 3 base colors are good but FITL distinguishes more terrain types. Consider shade variations within the three categories (e.g., lighter tan for coastal lowlands vs. darker tan for inland plains, or subtle pattern overlays). Investigate the white/cream-filled province near the bottom of the editor overview — likely a missing terrain assignment.
4. **[MEDIUM]** Increase label font size at overview zoom. Labels are legible at close-up but become very small at zoomed-out levels. Consider adaptive font sizing or minimum size clamping. *(Recurring: 3 consecutive evaluations)*
5. **[MEDIUM]** Reduce visual congestion in the Saigon area — the game canvas overview shows dark rendering artifacts where many small polygon provinces, route lines, and adjacency lines overlap. Consider simplifying line rendering or adjusting polygon opacity in dense areas.
6. **[MEDIUM]** Embed city circles within their parent province shapes rather than placing them at the border edge. Da Nang and Qui Nhon still appear disconnected from surrounding territory. *(Recurring: 3 consecutive evaluations)*
7. **[MEDIUM]** Increase token size and add faction-specific visual markers so pieces are identifiable at default zoom. Faction colors are more distinguishable now but tokens remain small. *(Recurring: 4 consecutive evaluations)*
8. **[LOW]** Clean up polygon border seams in dense areas where adjacent provinces meet imprecisely. *(Recurring: 3 consecutive evaluations)*

---

## EVALUATION #5

**Date**: 2026-03-30
**Screenshots analyzed**: fitl-game-map.png, fitl-game-map-overview.png, fitl-map-editor.png, fitl-map-editor-overview.png

### Screenshot Analysis

#### fitl-game-map.png — Game Canvas Close-Up
**What's shown**: Dark-themed game canvas showing ~6 provinces rendered as smooth, rounded organic blob shapes with curved borders. Visible provinces: Southern Laos (large dark green), Quang Tin Quang Ngai (bright green, elongated ellipse), an unnamed large tan/golden province (likely Pleiku/Darlac or Quang Nam), Northeast Cambodia (dark green, lower-left), Phu Bon Phu Yen (bright green, lower-right), and a tan/golden province in the center (likely Binh Dinh). A small steel blue/lavender sliver is visible between the central provinces (Kontum?). Qui Nhon city as a blue-gray circle at the far right. Tokens: red circle (Southern Laos), blue circles (Quang Tin Quang Ngai, central tan province), orange and olive-green squares near Qui Nhon. Labels with dark semi-transparent background pills. Dashed teal coast line on the right. Brown/white route lines visible behind provinces.
**Issues observed**:
- Province shapes are now smooth, rounded blobs with organic curved borders — a dramatic improvement from the angular/geometric polygons of Eval #4. This addresses the top recurring recommendation from 3 consecutive evaluations
- Provinces overlap and share borders through proximity, creating a more natural territorial feel. However, some dark background gaps are visible between non-adjacent provinces
- Three terrain colors maintained: dark green (jungle/Laos), tan/golden (lowlands), bright green (third category)
- Labels with background pills are clearly readable at close-up zoom: "Southern Laos", "Quang Tin Quang Ngai", "Northeast Cambodia", "Phu Bon Phu Yen" all legible
- One label ("Binh Dinh" area) appears partially obscured by its background pill — some characters are cut off or rendered over colored squares
- Route lines (brown, white/dashed) are visible but still appear as thin lines connecting between provinces rather than flowing through territory
- Qui Nhon city circle sits at the far-right border, still somewhat disconnected from surrounding territory
- Tokens are small colored squares/circles — faction colors (red, blue, orange, olive) are distinguishable at this zoom but piece type (troop vs. guerrilla) is not

#### fitl-game-map-overview.png — Game Canvas Full Map
**What's shown**: Full map at zoomed-out level on dark theme. The entire map is covered with rounded organic blob provinces. Dark green blobs (Laos, Cambodia, jungle regions) dominate the left side. Tan/golden blobs fill the central-north area. Bright green and lime blobs cluster in the southern Mekong Delta area. Cities as blue-gray circles along the right coast. Blue wavy lines visible in the southern area connecting Saigon-region cities (rivers). Brown route lines connect provinces throughout. "Out of Play" and "Trucks Base Staging" boxes on the far right. Labels with background pills visible but very small.
**Issues observed**:
- All province zones rendered as organic rounded shapes — full coverage maintained from Eval #4 with dramatically improved shape quality
- The overall layout is vertically elongated with a slight S-curve shape — the best geographic approximation of Vietnam seen so far
- Blue wavy river lines are clearly visible in the southern Saigon/Can Tho area, distinct from brown road lines — route type distinction is positive
- At overview zoom, labels with background pills are identifiable as labels but text is too small to read province names
- Southern area shows visual congestion where many small bright green provinces cluster with overlapping boundaries and route lines
- Some dark background gaps visible between non-adjacent provinces, but the overall impression is of contiguous territory rather than isolated shapes
- The organic shapes create natural visual groupings — Laos/Cambodia jungle regions feel like a distinct geographic block, coastal Vietnam feels like a separate coastal strip

#### fitl-map-editor.png — Map Editor Close-Up
**What's shown**: Light cream-background editor view showing the same region as the game canvas close-up. Provinces as smooth rounded blobs: Central Laos (dark green, upper-left), Quang Nam (tan/golden), Quang Tin Quang Ngai (bright green, horizontal ellipse), Southern Laos (large dark green), Binh Dinh (tan/golden, lower-right). Da Nang and Qui Nhon as blue circles. Brown route lines connecting cities. Small blue/lavender shape (Kontum) partially visible. Clean view without tokens or overlays.
**Issues observed**:
- Organic rounded blob shapes match the game canvas — consistent rendering between views
- Labels are more readable on the light background: "Central Laos", "Southern Laos", "Quang Nam", "Quang Tin Quang Ngai", "Binh Dinh" all clearly legible
- Province borders share edges through proximity/overlap — organic and natural feel
- Route lines (brown) connect between cities but still terminate at shape edges rather than flowing through territory
- Da Nang city circle sits at the upper-right edge, connected to provinces by route lines but not embedded within territory
- Qui Nhon at the far-right edge, similarly disconnected
- The cream background showing through between non-adjacent provinces is acceptable and helps define territory boundaries

#### fitl-map-editor-overview.png — Map Editor Full Map
**What's shown**: Full map on light cream background. All provinces rendered as organic rounded blobs from top to bottom. Visible provinces include: Southern Laos (large dark green), Northeast Cambodia, Northwest Cambodia, The Fishhook, The Parrot's Beak (dark green on left). Quang Tri, Quang Nam, Binh Dinh (tan/golden in center-right). Quang Tin Quang Ngai, Cam Lien Can Tho (bright green). Southern provinces: Kien Giang An Xuyen, Ba Xuyen, Kien Hoa Vinh Binh (lime green, Mekong Delta). Blue wavy river lines visible in southern area connecting Saigon and Can Tho. Brown route lines throughout. Cities: Qui Nhon, Cam Ranh, Saigon, Can Tho as blue circles. "Available" and "Out of Play" boxes on the right.
**Issues observed**:
- Full polygon coverage with organic shapes confirmed map-wide — consistent quality from top to bottom
- Blue wavy river lines in the Saigon/Mekong Delta area are clearly distinct from brown road lines — best route type distinction seen across all evaluations
- The vertically elongated layout with Laos/Cambodia on the left and coastal Vietnam on the right better approximates the physical map geography
- Labels are readable throughout on the light background at this zoom level
- Some provinces in the southern cluster are small and visually congested, but the organic shapes help them feel like geographic regions rather than graph nodes
- A few dark green provinces in the lower-center area (Tay Ninh, War Zone D) overlap heavily, making individual province boundaries hard to distinguish
- Three terrain colors still visible map-wide: dark green, tan/golden, bright/lime green — no finer granularity added since Eval #4

### Cross-View Consistency

Game canvas and editor views are consistent — same organic rounded blob shapes, same terrain colors (dark green, tan/golden, bright green), same city placement. River rendering (blue wavy lines) is visible in both views in the southern Saigon/Mekong Delta area. Road/river distinction is clearer in the editor overview than in previous evaluations — both brown road lines and blue river lines are distinguishable. The organic shape quality is uniform across all four screenshots.

### Resolved Since Previous

- **Angular/geometric polygon shapes** — was HIGH in Eval #4 (recurring for 3 consecutive evaluations), now resolved. Province shapes are now smooth, rounded organic blobs with curved borders, replacing the angular parallelogram/trapezoid shapes. This was the longest-running HIGH recommendation and has been comprehensively addressed.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Adjacency Clarity | 8 | 7 | +1 | Organic rounded shapes share borders naturally through proximity and overlap. Full coverage maintained. The curved borders create a territorial, geographic feel — adjacency is clearly implied by shared boundaries. Some dark gaps between non-adjacent provinces are acceptable and aid readability. |
| 2 | Road/River Integration | 5 | 5 | 0 | Routes remain as thin lines connecting province shapes at their edges. Road/river distinction is good (brown roads vs. blue wavy rivers, especially visible in southern areas). However, routes still don't flow through province territory — they connect between shapes rather than being embedded in the landscape. |
| 3 | Terrain Distinction | 6 | 6 | 0 | Three terrain colors (dark green, tan/golden, bright/lime green) applied map-wide — unchanged from Eval #4. No finer terrain granularity added (e.g., highlands vs. lowlands still use the same tan, no pattern/texture variation). |
| 4 | Label/Token Readability | 5 | 5 | 0 | Labels with dark background pills are readable at close-up in both views. At overview zoom, labels remain too small to read. Tokens are small colored squares/circles — faction colors are distinguishable but piece types are not. Fundamentally unchanged from Eval #4. |
| | **Average** | **6.0** | **5.75** | **+0.25** | |

**Polygon coverage**: ~28-30/35 province zones rendered as organic territories. Full coverage maintained from Eval #4.

### Score Trend

| Eval | Avg | Delta |
|------|-----|-------|
| #1   | 2.5 | — |
| #2   | 5.0 | +2.5 |
| #3   | 4.5 | -0.5 |
| #4   | 5.75 | +1.25 |
| #5   | 6.0 | +0.25 |

### Prioritized Recommendations

1. **[HIGH]** Make routes flow through province territory rather than terminating at shape edges. Route type distinction (brown roads vs. blue wavy rivers) is now good across both views, but routes still connect between shapes as graph edges. Consider rendering routes as paths that pass through province fills, with road/river styling visible inside territory boundaries. *(Recurring: 5 consecutive evaluations — per-metric stagnation: Road/River Integration has been unchanged at 5 for 4 consecutive evaluations. The `map-representation-plan` skill should research alternative rendering approaches before the next implementation cycle.)*
2. **[HIGH]** Add finer terrain granularity beyond the current 3 base colors. FITL distinguishes highlands, lowlands, jungle, LoCs, and other terrain types. Consider shade variations within categories (e.g., lighter tan for coastal lowlands vs. darker tan for inland plains) or subtle texture/pattern overlays. *(Recurring: 2 consecutive evaluations — per-metric stagnation: Terrain Distinction unchanged at 6 for 2 evaluations, approaching stagnation threshold.)*
3. **[MEDIUM]** Increase label font size at overview zoom or implement adaptive font sizing with a minimum size clamp. Labels are legible at close-up but become unreadable at zoomed-out levels. Background pills help visibility but can't compensate for tiny font size. *(Recurring: 4 consecutive evaluations)*
4. **[MEDIUM]** Embed city circles within their parent province shapes rather than placing them at the border edge. Da Nang, Qui Nhon, and other cities still appear disconnected from surrounding territory — they sit on province edges connected by route lines. *(Recurring: 4 consecutive evaluations)*
5. **[MEDIUM]** Increase token size and add faction-specific visual markers (shape outlines, icons, or size variation for troop vs. guerrilla) so pieces are identifiable at default zoom. *(Recurring: 5 consecutive evaluations)*
6. **[MEDIUM]** Reduce visual congestion in the southern Mekong Delta area where many small bright green provinces overlap heavily, making individual province boundaries hard to distinguish.
7. **[LOW]** Refine the overall map layout to more closely match Vietnam's S-curve geography. The current vertically elongated layout is better than previous evaluations but the S-curve is not pronounced. *(Recurring: 4 consecutive evaluations)*

---

## EVALUATION #6

**Date**: 2026-03-30
**Corrections**: [2026-03-30] Replaced initial "No Change" stub after closer inspection revealed route rendering improvements — routes now flow through province territory rather than terminating at edges.
**Screenshots analyzed**: fitl-game-map.png, fitl-game-map-overview.png, fitl-map-editor.png, fitl-map-editor-overview.png

### Screenshot Analysis

#### fitl-game-map.png — Game Canvas Close-Up
**What's shown**: Dark-themed game canvas showing ~7 provinces as smooth organic blob shapes. Visible provinces: Southern Laos (large dark green, upper-left), Northeast Cambodia (olive-green, left), The Fishhook (olive-green, bottom-left), a large tan/golden province cluster (Pleiku/Darlac center, Binh Dinh right-center), Quang Tin Quang Ngai (partially visible, upper), Phu Bon Phu Yen (bright green, right), Khanh Hoa (partially visible, lower-right). Blue sliver (Kontum) visible between provinces. Qui Nhon city as a gray-blue circle at the far right. Tokens: red circle (Southern Laos), cyan/blue circles, orange and olive squares near labels. Labels with dark semi-transparent background pills. Dashed teal coastline on the right.
**Issues observed**:
- Route lines (brown/gray) now visibly cross *through* province territory fills rather than just connecting at shape edges — this is a clear improvement over Eval #5. Lines pass over the tan/golden provinces and are visible traversing the blob shapes.
- Organic rounded blob shapes maintained — same quality as Eval #5.
- Three terrain colors maintained: dark green (jungle/Laos/Cambodia), tan/golden (lowlands), bright green (third category).
- Some labels are partially obscured by route lines crossing over them — "Pleiku Darlac" label has route lines passing through it, reducing readability slightly.
- Label background pills help but some labels still show garbled/overlapping characters where tokens or route lines intersect: "Phu Bo[n] [P]hu Yen" partially obscured.
- Tokens remain small colored squares/circles — faction colors distinguishable but piece types not.
- Qui Nhon city circle still sits at the far-right border edge, somewhat disconnected from surrounding territory.

#### fitl-game-map-overview.png — Game Canvas Full Map
**What's shown**: Full map at zoomed-out level on dark theme. All provinces rendered as organic rounded blobs. Dark green blobs (Laos, Cambodia, jungle) on the left. Tan/golden blobs in the center-right. Bright/lime green blobs in the southern Mekong Delta area. Cities as blue-gray circles along the right coast. Brown route lines and blue wavy river lines visible throughout — routes clearly pass through province territory fills, particularly visible in the central and southern regions. "Out of Play" boxes and "Trucks Base Staging" on the far right.
**Issues observed**:
- Routes now flow through province shapes — brown road lines cross over blob fills, visible as lines traversing territory rather than just connecting at edges. This is especially clear in the central highland region where routes pass through large tan provinces.
- Blue wavy river lines in the southern Saigon/Mekong Delta area remain clearly distinct from brown road lines — good route type distinction maintained.
- At overview zoom, labels with background pills are visible but text remains too small to read province names.
- Southern area still shows visual congestion where many small bright/lime green provinces cluster with overlapping boundaries and route lines.
- The vertically elongated S-curve layout is maintained — overall geographic approximation consistent with Eval #5.
- Some dark gaps between non-adjacent provinces remain, which is acceptable for readability.

#### fitl-map-editor.png — Map Editor Close-Up
**What's shown**: Light cream-background editor view. Provinces as smooth organic blobs: Central Laos (dark green, upper-left), Quang Nam (tan/golden), Quang Tin Quang Ngai (bright green, horizontal ellipse), Southern Laos (large dark green), Binh Dinh (tan/golden, lower-right). Da Nang and Qui Nhon as blue circles. Brown route lines connecting cities. Blue sliver (Kontum) partially visible. Clean view without tokens.
**Issues observed**:
- Route lines (brown) now clearly pass *through* province territory fills. The route from Da Nang passes through/over the Quang Nam blob, continues through Quang Tin Quang Ngai, and into Binh Dinh — visible as lines crossing over the colored fills rather than connecting at edges. This is the most visible improvement.
- Organic rounded blob shapes match the game canvas — consistent cross-view rendering.
- Labels are readable on the light background: "Central Laos", "Southern Laos", "Quang Nam", "Quang Tin Quang Ngai", "Binh Dinh" all legible.
- Da Nang city circle sits at the upper-right, connected by route lines passing through territory — slightly more integrated than before due to routes flowing through rather than to/from edges.
- Qui Nhon at the far-right edge, still somewhat disconnected.
- The cream background between non-adjacent provinces helps define boundaries.

#### fitl-map-editor-overview.png — Map Editor Full Map
**What's shown**: Full map on light cream background. All provinces rendered as organic rounded blobs from top to bottom. Dark green blobs (Laos, Cambodia) on the left. Tan/golden and bright green provinces throughout. Dark green (darker shade) provinces in the central-south War Zone area. Blue river lines visible in southern area. Brown route lines passing through province territory throughout. Cities as blue circles. "Casualties", "Out of Play", and "Trucks Base Staging" boxes on the right.
**Issues observed**:
- Route lines clearly pass through province territory fills map-wide. Brown road lines visibly cross over blob shapes — particularly clear in the editor's light background where the contrast between routes and territory fills is high.
- Blue river lines in the Saigon/Mekong Delta area are distinct from brown road lines — good route type distinction maintained.
- Full polygon coverage with organic shapes confirmed — all provinces rendered as blobs.
- A fourth terrain color is now visible: dark forest green (darker than the standard dark green) for War Zone D / Tay Ninh area provinces in the central-south region. This adds terrain granularity beyond the previous 3 colors.
- Labels are readable at this zoom on the light background.
- Some visual congestion in the southern cluster remains but is manageable.
- The overall vertically elongated layout with Laos/Cambodia on the left and coastal Vietnam on the right is maintained.

### Cross-View Consistency

Game canvas and editor views are consistent — same organic rounded blob shapes, same terrain colors, same city placement. The key improvement (routes flowing through territory) is visible in both views. Route type distinction (brown roads vs. blue rivers) is clear in both. The editor's light background makes routes-through-territory more visually apparent, but the game canvas dark theme also shows this improvement. The editor overview reveals a possible fourth terrain shade (dark forest green) that is harder to distinguish on the dark game canvas.

### Resolved Since Previous

- **Routes terminating at shape edges rather than flowing through territory** — was HIGH in Eval #5 (recurring for 5 consecutive evaluations, per-metric stagnation flagged at 4 evaluations). Now resolved. Route lines visibly pass through/over province territory fills in all four screenshots. This was the longest-running recommendation in the evaluation history and breaks the per-metric stagnation on Road/River Integration.

### Scores

| # | Metric | Score | Previous | Delta | Justification |
|---|--------|-------|----------|-------|---------------|
| 1 | Adjacency Clarity | 8 | 8 | 0 | Unchanged. Organic rounded shapes share borders naturally through proximity and overlap. Full coverage maintained. Adjacency clearly implied by shared boundaries. |
| 2 | Road/River Integration | 7 | 5 | +2 | Major improvement. Routes now flow through province territory fills rather than terminating at edges. Road/river distinction maintained (brown vs. blue wavy). Routes feel like geographic features embedded in the landscape rather than abstract graph edges. Not yet 8 because routes are straight lines passing through fills — they don't follow terrain contours or river paths organically. |
| 3 | Terrain Distinction | 6 | 6 | 0 | Three main terrain colors (dark green, tan/golden, bright/lime green) maintained. A possible fourth shade (dark forest green) visible in the editor overview for War Zone provinces, but the distinction is subtle. No texture/pattern variation or finer granularity within categories. |
| 4 | Label/Token Readability | 5 | 5 | 0 | Labels with dark background pills readable at close-up. At overview zoom, labels remain too small. Route lines now passing through territory occasionally cross over labels, slightly reducing readability in some areas (e.g., "Pleiku Darlac"). Tokens unchanged — small colored squares/circles. |
| | **Average** | **6.5** | **6.0** | **+0.5** | |

**Territory coverage**: ~28-30/35 province zones rendered as organic territories. Full coverage maintained.

### Score Trend

| Eval | Avg | Delta |
|------|-----|-------|
| #1   | 2.5 | — |
| #2   | 5.0 | +2.5 |
| #3   | 4.5 | -0.5 |
| #4   | 5.75 | +1.25 |
| #5   | 6.0 | +0.25 |
| #6   | 6.5 | +0.5 |

### Prioritized Recommendations

1. **[HIGH]** Add finer terrain granularity beyond the current 3-4 base colors. FITL distinguishes highlands, lowlands, jungle, LoCs, and other terrain types. Consider shade variations within categories (e.g., lighter tan for coastal lowlands vs. darker tan for inland plains) or subtle texture/pattern overlays. The possible fourth shade (dark forest green) in War Zone provinces is a step in the right direction — extend this approach. *(Recurring: 3 consecutive evaluations — per-metric stagnation: Terrain Distinction unchanged at 6 for 3 evaluations.)*
2. **[MEDIUM]** Make routes follow terrain contours or curve naturally between cities rather than rendering as straight lines through territory. The improvement from edge-termination to through-territory is significant, but routes still feel like straight graph edges overlaid on the map rather than geographic paths. Consider Bezier curves or waypoints.
3. **[MEDIUM]** Increase label font size at overview zoom or implement adaptive font sizing with a minimum size clamp. Labels are legible at close-up but unreadable at zoomed-out levels. *(Recurring: 5 consecutive evaluations)*
4. **[MEDIUM]** Manage route-label overlap — now that routes pass through territory, they occasionally cross over label background pills, reducing readability. Consider rendering labels above route lines in the z-order, or adding slight offsets to avoid collisions.
5. **[MEDIUM]** Embed city circles within their parent province shapes rather than placing them at the border edge. Da Nang, Qui Nhon, and other cities still appear at province edges. *(Recurring: 5 consecutive evaluations)*
6. **[MEDIUM]** Increase token size and add faction-specific visual markers so pieces are identifiable at default zoom. *(Recurring: 6 consecutive evaluations)*
7. **[MEDIUM]** Reduce visual congestion in the southern Mekong Delta area where many small bright green provinces overlap with route lines.
8. **[LOW]** Refine the overall map layout to more closely match Vietnam's S-curve geography. *(Recurring: 5 consecutive evaluations)*
