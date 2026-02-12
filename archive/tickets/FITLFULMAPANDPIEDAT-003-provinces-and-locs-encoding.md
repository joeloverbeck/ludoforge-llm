# FITLFULMAPANDPIEDAT-003: Encode all 22 provinces and 17 LoCs in the MapPayload

**Spec**: 23, Tasks 23.1 and 23.5
**Priority**: P0
**Depends on**: FITLFULMAPANDPIEDAT-002
**Blocks**: FITLFULMAPANDPIEDAT-004 (adjacency depends on all spaces existing)
**Status**: ✅ COMPLETED

## Description

Current baseline in this repository:
- `data/games/fire-in-the-lake.md` already exists and already encodes the 8 city spaces from ticket 002.
- Existing unit tests already cover scaffold parsing and city map encoding:
  - `test/unit/fitl-production-data-scaffold.test.ts`
  - `test/unit/fitl-production-map-cities.test.ts`

Add the 22 province and 17 LoC `MapSpaceDef` entries to the existing map data asset payload in `data/games/fire-in-the-lake.md`. Zone IDs use kebab-case with `:none` suffix.

### Provinces (22)

**Foreign provinces (7)**:

| Brainstorming ID | Canonical Zone ID | Terrain | Pop | Coastal | Country |
|---|---|---|---|---|---|
| CentralLaos | `central-laos:none` | jungle | 0 | false | laos |
| SouthernLaos | `southern-laos:none` | jungle | 0 | false | laos |
| NortheastCambodia | `northeast-cambodia:none` | jungle | 0 | false | cambodia |
| TheFishhook | `the-fishhook:none` | jungle | 0 | false | cambodia |
| TheParrotsBeak | `the-parrots-beak:none` | jungle | 0 | false | cambodia |
| Sihanoukville | `sihanoukville:none` | jungle | 0 | true | cambodia |
| NorthVietnam | `north-vietnam:none` | highland | 0 | true | northVietnam |

**South Vietnamese provinces (15)**:

| Brainstorming ID | Canonical Zone ID | Terrain | Pop | Coastal |
|---|---|---|---|---|
| QuangTri_ThuaThien | `quang-tri-thua-thien:none` | highland | 2 | true |
| QuangNam | `quang-nam:none` | highland | 1 | true |
| QuangTin_QuangNgai | `quang-tin-quang-ngai:none` | lowland | 2 | true |
| BinhDinh | `binh-dinh:none` | highland | 2 | true |
| Pleiku_Darlac | `pleiku-darlac:none` | highland | 1 | false |
| PhuBon_PhuYen | `phu-bon-phu-yen:none` | lowland | 1 | true |
| KhanhHoa | `khanh-hoa:none` | highland | 1 | true |
| PhuocLong | `phuoc-long:none` | jungle | 0 | false |
| QuangDuc_LongKhanh | `quang-duc-long-khanh:none` | jungle | 1 | false |
| BinhTuy_BinhThuan | `binh-tuy-binh-thuan:none` | jungle | 1 | true |
| TayNinh | `tay-ninh:none` | jungle | 2 | false |
| KienPhong | `kien-phong:none` | lowland | 2 | false |
| KienHoa_VinhBinh | `kien-hoa-vinh-binh:none` | lowland | 2 | true |
| BaXuyen | `ba-xuyen:none` | lowland | 1 | true |
| KienGiang_AnXuyen | `kien-giang-an-xuyen:none` | lowland | 2 | true |

All provinces have `spaceType: 'province'`, `econ: 0`, `country: 'southVietnam'` (unless foreign), and `adjacentTo: []` (populated in ticket 004). Terrain goes in `terrainTags` array (e.g. `['highland']`).

### LoCs (17)

| Brainstorming ID | Canonical Zone ID | Type Tags | Econ | Coastal |
|---|---|---|---|---|
| LOC_Hue_KheSanh | `loc-hue-khe-sanh:none` | ['highway'] | 1 | true |
| LOC_Hue_DaNang | `loc-hue-da-nang:none` | ['highway'] | 1 | true |
| LOC_DaNang_DakTo | `loc-da-nang-dak-to:none` | ['highway'] | 0 | false |
| LOC_DaNang_QuiNhon | `loc-da-nang-qui-nhon:none` | ['highway'] | 1 | true |
| LOC_Kontum_DakTo | `loc-kontum-dak-to:none` | ['highway'] | 1 | false |
| LOC_Kontum_QuiNhon | `loc-kontum-qui-nhon:none` | ['highway'] | 1 | false |
| LOC_Kontum_BanMeThuot | `loc-kontum-ban-me-thuot:none` | ['highway'] | 1 | false |
| LOC_QuiNhon_CamRanh | `loc-qui-nhon-cam-ranh:none` | ['highway'] | 1 | true |
| LOC_CamRanh_DaLat | `loc-cam-ranh-da-lat:none` | ['highway'] | 1 | false |
| LOC_BanMeThuot_DaLat | `loc-ban-me-thuot-da-lat:none` | ['highway'] | 0 | false |
| LOC_Saigon_CamRanh | `loc-saigon-cam-ranh:none` | ['highway'] | 1 | true |
| LOC_Saigon_DaLat | `loc-saigon-da-lat:none` | ['highway'] | 1 | false |
| LOC_Saigon_AnLoc_BanMeThuot | `loc-saigon-an-loc-ban-me-thuot:none` | ['highway'] | 1 | false |
| LOC_Saigon_CanTho | `loc-saigon-can-tho:none` | ['mekong'] | 2 | false |
| LOC_CanTho_ChauDoc | `loc-can-tho-chau-doc:none` | ['mekong'] | 1 | false |
| LOC_CanTho_BacLieu | `loc-can-tho-bac-lieu:none` | ['mekong'] | 0 | true |
| LOC_CanTho_LongPhu | `loc-can-tho-long-phu:none` | ['mekong'] | 1 | true |

All LoCs have `spaceType: 'loc'`, `population: 0`, `country: 'southVietnam'`, and `adjacentTo: []` (populated in ticket 004).

**ID mapping table**: Include a comment block documenting brainstorming-ID-to-canonical-ID correspondence for all 39 spaces in this ticket (22 provinces + 17 LoCs). The existing city mapping block from ticket 002 remains unchanged.

## File list

| File | Action |
|------|--------|
| `data/games/fire-in-the-lake.md` | **Edit** (add province + LoC entries to map payload) |
| `test/unit/fitl-production-map-provinces-locs.test.ts` | **Create** |

## Out of scope

- Cities (ticket 002)
- Adjacency (ticket 004)
- Piece catalog (tickets 005–006)
- Tracks and lattices (tickets 007–008)
- Any changes to `src/` code
- Any changes to existing test fixtures

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes
- Existing city/scaffold tests continue to pass unchanged:
  - `test/unit/fitl-production-data-scaffold.test.ts`
  - `test/unit/fitl-production-map-cities.test.ts`
- New unit test `test/unit/fitl-production-map-provinces-locs.test.ts`:
  - Parses the map asset from `data/games/fire-in-the-lake.md`
  - Asserts exactly 22 spaces with `spaceType: 'province'`
  - Asserts exactly 17 spaces with `spaceType: 'loc'`
  - Asserts total space count = 47 (8 cities + 22 provinces + 17 LoCs)
  - **Country assignments**: Central Laos, Southern Laos → `laos`; NE Cambodia, Fishhook, Parrot's Beak, Sihanoukville → `cambodia`; North Vietnam → `northVietnam`; all others → `southVietnam`
  - **Terrain tags**: Each province has exactly one of `highland`, `lowland`, `jungle`
  - **LoC type tags**: Every LoC has at least one of `highway` or `mekong`; the 4 Mekong LoCs are Saigon–Can Tho, Can Tho–Chau Doc, Can Tho–Bac Lieu, Can Tho–Long Phu; all other LoCs are `highway`-only
  - **Population bounds**: Provinces 0–2, LoCs always 0
  - **Econ**: LoCs have econ per the table above (0, 1, or 2); provinces have econ 0
  - **Coastal**: Sihanoukville and North Vietnam are coastal foreign provinces; South Vietnamese coastal provinces per table
  - All zone IDs follow `kebab-case:none` pattern

### Invariants that must remain true

- No existing test file is modified
- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged

## Outcome

- **Completion date**: 2026-02-12
- **What changed**:
  - Added all 22 province and 17 LoC entries to `fitl-map-production` in `data/games/fire-in-the-lake.md`
  - Added the required 39-entry brainstorming-to-canonical ID mapping comment block for provinces + LoCs
  - Added `test/unit/fitl-production-map-provinces-locs.test.ts` covering counts, country assignment, terrain tags, LoC type tags, population/econ bounds, coastal flags, and ID format
- **Deviations from original plan**:
  - Ticket assumptions were corrected before implementation to match repo reality (existing city/scaffold data/tests from ticket 002, and dependency updated from 001 to 002)
- **Verification results**:
  - `npm run build` passed
  - `npm test` passed
