# VISCONF-010: Strip visual data from game spec YAML files

**Spec**: 42 (Per-Game Visual Config), D12
**Priority**: P1
**Depends on**: VISCONF-002 (visual-config.yaml files must exist first), VISCONF-008 (engine types removed)
**Blocks**: Nothing (can run in parallel with VISCONF-011, 012)

---

## Summary

Remove all visual/presentation data from the FITL and Texas Hold'em game spec Markdown files. After VISCONF-009, the compiler's validator must reject these fields as compile-blocking errors — this ticket removes them so compilation succeeds.

---

## Files to modify

| File | Change |
|------|--------|
| `data/games/fire-in-the-lake/10-vocabulary.md` | Remove `layoutRole` from all zone definitions |
| `data/games/fire-in-the-lake/40-content-data-assets.md` | Remove `visual:` blocks from map spaces, `color:`/`displayName:` from factions, `visual:` from piece types, `visualRules:` from map payloads |
| `data/games/fire-in-the-lake/00-metadata.md` | Remove `layoutMode:` if present |
| `data/games/texas-holdem/00-metadata.md` | Remove `cardAnimation:` block and `layoutMode:` |
| `data/games/texas-holdem/10-vocabulary.md` | Remove `layoutRole:` from all zone definitions |
| `data/games/texas-holdem/40-content-data-assets.md` | Remove `color:`/`displayName:` from factions |

---

## Detailed requirements

### FITL changes

**10-vocabulary.md** — Remove `layoutRole:` line from these zone defs:
- `deck` (was: `layoutRole: card`)
- `leader` (was: `layoutRole: card`)
- `lookahead` (was: `layoutRole: card`)
- `played` (was: `layoutRole: card`)
- `available-US` (was: `layoutRole: forcePool`)
- `available-ARVN` (was: `layoutRole: forcePool`)
- `available-NVA` (was: `layoutRole: forcePool`)
- `available-VC` (was: `layoutRole: forcePool`)
- `out-of-play-US` (was: `layoutRole: forcePool`)
- `out-of-play-ARVN` (was: `layoutRole: forcePool`)
- `casualties-US` (was: `layoutRole: forcePool`)

**40-content-data-assets.md** — Remove from pieceCatalog factions:
- `color:` and `displayName:` from each of the 4 factions (us, arvn, nva, vc)

**40-content-data-assets.md** — Remove from pieceCatalog pieceTypes:
- `visual:` block (containing `color:`, `shape:`, `activeSymbol:`) from each of the 12 piece types

**40-content-data-assets.md** — Remove from map payload:
- `visual:` block from each of the 47 map spaces
- `visualRules:` array from the map payload (if present as a top-level rules block)

**00-metadata.md** — Remove `layoutMode: graph` if present.

### Texas Hold'em changes

**00-metadata.md** — Remove the entire `cardAnimation:` block:
```yaml
cardAnimation:
  cardTokenTypes:
    idPrefixes:
      - "card-"
  zoneRoles:
    draw: [deck]
    hand: [hand:0, hand:1, ..., hand:9]
    shared: [community]
    burn: [burn]
    discard: [muck]
```

Remove `layoutMode: table` if present.

**10-vocabulary.md** — Remove `layoutRole:` from these zone defs:
- `deck` (was: `layoutRole: card`)
- `burn` (was: `layoutRole: other`)
- `community` (was: `layoutRole: other`)
- `muck` (was: `layoutRole: other`)
- `hand:0` through `hand:9` (was: `layoutRole: hand`)

**40-content-data-assets.md** — Remove from pieceCatalog factions:
- `color:` and `displayName:` from the `neutral` faction

---

## Out of scope

- Creating visual-config.yaml files (VISCONF-002 — already done)
- Engine type/compiler changes (VISCONF-008, 009 — already done)
- Bootstrap JSON changes (VISCONF-011)
- Engine test updates (VISCONF-012)
- Any runner changes

---

## Acceptance criteria

### Tests that must pass

1. After this ticket + VISCONF-009, compiling FITL and Texas Hold'em game specs produces valid GameDef JSON without visual fields
2. `pnpm -F @ludoforge/engine test` — production spec compilation tests pass (no "unknown key" diagnostics for visual fields)

### Verification

1. `grep -r 'layoutRole:' data/games/` returns zero hits
2. `grep -r 'layoutMode:' data/games/` returns zero hits
3. `grep -r 'cardAnimation:' data/games/` returns zero hits
4. `grep -r 'displayName:' data/games/*/40-content-data-assets.md` returns zero hits (in faction context)
5. `grep -rn '  color:' data/games/*/40-content-data-assets.md` returns zero hits (in faction/visual context — be careful not to match game-rule color attributes if any exist)
6. `grep -r 'visual:' data/games/` returns zero hits
7. `grep -r 'visualRules:' data/games/` returns zero hits

### Invariants

- Game spec files retain all rule-related data (zones, variables, token properties, phases, actions, triggers, scenarios)
- Zone definitions retain: `id`, `zoneKind`, `owner`, `visibility`, `ordering`, `adjacentTo`, `category`, `attributes`
- Faction definitions retain: `id` (no other fields remain after removing color/displayName)
- Piece type definitions retain: `id`, `statusDimensions`, `transitions` (no visual block)
- No visual data of any kind remains in `data/games/` spec files
