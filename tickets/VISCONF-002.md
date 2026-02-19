# VISCONF-002: Create FITL and Texas Hold'em visual-config.yaml files

**Spec**: 42 (Per-Game Visual Config)
**Priority**: P1
**Depends on**: VISCONF-001 (types define the schema these files must conform to)
**Blocks**: VISCONF-010 (game spec YAML stripping needs the visual data moved first)

---

## Summary

Extract all visual/presentation data from the FITL and Texas Hold'em game spec Markdown files and compile them into standalone `visual-config.yaml` files. These files are the **authoritative visual config** for each game going forward.

---

## Files to create

| File | Purpose |
|------|---------|
| `data/games/fire-in-the-lake/visual-config.yaml` | FITL visual configuration |
| `data/games/texas-holdem/visual-config.yaml` | Texas Hold'em visual configuration |

## Files NOT touched

No existing files are modified in this ticket. The game spec `.md` files are NOT edited here (that happens in VISCONF-010).

---

## Detailed requirements

### FITL visual-config.yaml

Extract the following data from current game spec files:

**Factions** (source: `40-content-data-assets.md`, pieceCatalog factions):
- us: color=#e63946, displayName="United States"
- arvn: color=#457b9d, displayName="ARVN"
- nva: color=#2a9d8f, displayName="NVA"
- vc: color=#e9c46a, displayName="Viet Cong"

**Layout**:
- mode: `graph` (FITL has zone adjacency)

**Zone categoryStyles** (source: `40-content-data-assets.md`, map spaces):
- `city`: shape=circle, width=90, height=90, color="#5b7fa5"
- `province`: shape=rectangle, width=160, height=100, color="#3d5c3a"
- `loc`: shape=line, width=120, height=30, color="#8b7355"

**Zone attributeRules** (derived from map space visual rules in `40-content-data-assets.md`):
- highland provinces: match category=[province], attributeContains terrainTags=highland -> color="#6b5b3e"
- coastal provinces: match category=[province], attributeContains terrainTags=coastal -> color="#4a7a8c"
- cambodian/laotian provinces: match category=[province], attributeContains country=cambodia or country=laos -> color="#5a7a52"

**Zone overrides** (source: map spaces with explicit labels different from ID):
- Include label overrides for all 47 map spaces where the display name differs from the zone ID (e.g., `"hue:none": { label: "Hue" }`, `"saigon:none": { label: "Saigon" }`).

**Zone layoutRoles** (source: `10-vocabulary.md`, zones with layoutRole):
- deck: card
- leader: card
- lookahead: card
- played: card
- available-US: forcePool
- available-ARVN: forcePool
- available-NVA: forcePool
- available-VC: forcePool
- out-of-play-US: forcePool
- out-of-play-ARVN: forcePool
- casualties-US: forcePool

**Token types** (source: `40-content-data-assets.md`, pieceTypes with visual):
- us-troops: shape=cube, color="#e63946", size=24
- us-bases: shape=round-disk, color="#e63946", size=28
- us-irregulars: shape=cylinder, color="#e63946", size=24, symbol="star"
- arvn-troops: shape=cube, color="#457b9d", size=24
- arvn-police: shape=cube, color="#e9a030", size=24
- arvn-rangers: shape=cylinder, color="#457b9d", size=24, symbol="star"
- arvn-bases: shape=round-disk, color="#457b9d", size=28
- nva-troops: shape=cube, color="#2a9d8f", size=24
- nva-guerrillas: shape=cylinder, color="#2a9d8f", size=24, symbol="star"
- nva-bases: shape=round-disk, color="#2a9d8f", size=28
- vc-guerrillas: shape=cylinder, color="#e9c46a", size=24, symbol="star"
- vc-bases: shape=round-disk, color="#e9c46a", size=28

### Texas Hold'em visual-config.yaml

**Factions** (source: `40-content-data-assets.md`):
- neutral: color=#6c757d, displayName="Neutral"

**Layout**:
- mode: `table` (no zone adjacency)

**Zone layoutRoles** (source: `10-vocabulary.md`):
- deck: card
- burn: other
- community: other
- muck: other
- hand:0 through hand:9: hand

**Card animation** (source: `00-metadata.md`, `metadata.cardAnimation`):
- cardTokenTypes: idPrefixes: ["card-"]
- zoneRoles:
  - draw: ["deck"]
  - hand: ["hand:0", "hand:1", ..., "hand:9"]
  - shared: ["community"]
  - burn: ["burn"]
  - discard: ["muck"]

(No zone visual styles, no token visual styles — Texas Hold'em doesn't define these.)

---

## Out of scope

- Editing any game spec `.md` files (VISCONF-010)
- Editing any engine or runner source code
- Loading or validating these files at runtime (VISCONF-003)
- Modifying bootstrap JSON files (VISCONF-011)

---

## Acceptance criteria

### Tests that must pass

No new test files in this ticket. Validation is done manually and via VISCONF-003's loader tests.

### Manual verification

1. Each YAML file parses as valid YAML 1.2 (no tabs, quoted strings where ambiguous)
2. Each YAML file validates against the Zod schema from VISCONF-001 (verified by running a one-off script or in the VISCONF-003 loader tests)
3. Every faction color, displayName, zone visual, and token visual in the YAML matches the current values in the compiled `fitl-game-def.json` / `texas-game-def.json` bootstrap files
4. No game-rule data (zones, variables, token properties, phases, actions) is present in the YAML — only visual/presentation data

### Invariants

- Files are pure data (YAML) with no code or logic
- `version: 1` is the first key in each file
- All zone IDs referenced in `layoutRoles` and `overrides` match zone IDs in the corresponding game's spec
- All faction IDs referenced in `factions` match faction IDs in the corresponding game's spec
- All token type IDs referenced in `tokenTypes` match token type IDs in the corresponding game's spec
