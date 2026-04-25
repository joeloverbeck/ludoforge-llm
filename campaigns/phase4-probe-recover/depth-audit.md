# Spec 144 I1 Probe-Depth Audit

Date: 2026-04-24

Scope: FITL authored action/profile/macro surfaces that contain `chooseN`, nested `chooseOne`, or `forEach` bodies with sub-choices. The audit is source-derived from `data/games/fire-in-the-lake/20-macros.md` and `data/games/fire-in-the-lake/30-rules-actions.md`, using:

```bash
rg -n "^\\s*- id:|chooseN:|chooseOne:|forEach:" data/games/fire-in-the-lake/20-macros.md data/games/fire-in-the-lake/30-rules-actions.md
```

Event-card bodies also contain many chooser/`forEach` patterns under `data/games/fire-in-the-lake/41-events/`, but they lower through the same generic chooser and macro machinery audited here. This artifact records the action/profile/macro surfaces that own reusable publication-probe depth risk.

## Result

Default `MICROTURN_PROBE_DEPTH_BUDGET = 3` remains sufficient for the currently audited constructibility class.

The deepest currently relevant authored chain is NVA/VC March:

`$targetSpaces` chooseN -> `resolve-per-destination` forEach -> `$movingGuerrillas@{$destSpace}` / `$movingTroops@{$destSpace}` chooseN -> optional trail-chain chooseN/forEach follow-up.

The seed-1001 failure is caught at depth 2. The optional trail-chain continuation remains within `K=3` for the audited static source shape. No audited action/profile/macro surface requires `K > 3`; residual deeper dynamic branches remain rollback-protected by ticket 002.

## Action/Profile Rows

| Surface | Source anchor | Deepest nested chooser chain observed | Probe depth that catches induced dead end | `K > 3` needed? | Notes |
| --- | --- | --- | ---: | --- | --- |
| `train-us-profile` | `30-rules-actions.md:1500` | select spaces chooseN -> per-space chooseOne -> nested base/train chooseOne or cube chooseN -> sub-action chooseN/chooseOne | 3 | No | US Train has nested train and pacification choices; no branch exceeds K=3. |
| `train-arvn-profile` | `30-rules-actions.md:1770` | select spaces chooseN -> per-space chooseOne -> sub-action chooseN/chooseOne | 3 | No | ARVN Train mirrors US Train without deeper chain. |
| `patrol-us-profile` | `30-rules-actions.md:1996` | select LoC/space chooseN -> per-space chooseN/forEach cleanup | 2 | No | Patrol choices are selection plus per-space resolution. |
| `patrol-arvn-profile` | `30-rules-actions.md:2158` | select LoC/space chooseN -> per-space chooseN/forEach cleanup | 2 | No | Same shape as US Patrol. |
| `sweep-us-profile` | `30-rules-actions.md:2320` | target chooseN -> nested sweep piece chooseN -> per-space activation/move forEach | 3 | No | Source includes nested chooseN at `30-rules-actions.md:2350` and `2364`. |
| `sweep-arvn-profile` | `30-rules-actions.md:2473` | target chooseN -> nested sweep piece chooseN -> per-space activation/move forEach | 3 | No | Same probe-depth shape as US Sweep. |
| `assault-us-profile` | `30-rules-actions.md:2645` | target chooseN -> nested removal chooseN -> per-space removal forEach | 3 | No | Includes removal and bonus-removal choices. |
| `assault-arvn-profile` | `30-rules-actions.md:2890` | target chooseN -> removal chooseN -> per-space removal forEach | 3 | No | Same shape as US Assault. |
| `rally-nva-profile` | `30-rules-actions.md:3019` | per-space forEach -> chooseOne branch -> placement/removal chooseN | 3 | No | Rally has nested branch choices but no deeper published chooser chain. |
| `rally-vc-profile` | `30-rules-actions.md:3187` | per-space forEach -> chooseOne branch -> placement/removal chooseN -> cadres sub-choice | 3 | No | VC Rally includes Cadres agitate choice; still within K=3. |
| `march-nva-profile` | `30-rules-actions.md:3360` | target chooseN -> per-destination forEach -> moving guerrillas/troops chooseN -> optional trail-chain chooseN/forEach | 2 for seed-1001 class; 3 for trail-chain follow-up | No | Deepest live witness. |
| `march-vc-profile` | `30-rules-actions.md:3625` | target chooseN -> per-destination forEach -> moving guerrillas/troops chooseN | 2 | No | Same March core without the NVA trail-country free-cost branch. |
| `attack-nva-profile` | `30-rules-actions.md:3658` | per-space forEach -> target/removal chooseOne -> removal forEach | 2 | No | Removal ordering delegates to audited macros. |
| `attack-vc-profile` | `30-rules-actions.md:3942` | per-space forEach -> target/removal chooseOne -> removal forEach | 2 | No | Same attack shape as NVA. |
| `terror-nva-profile` | `30-rules-actions.md:4003` | per-space forEach with no deeper chooser than source selector macro | 2 | No | Selection macro carries the chooser risk. |
| `terror-vc-profile` | `30-rules-actions.md:4032` | per-space forEach with no deeper chooser than source selector macro | 2 | No | Same terror shape as NVA. |
| `advise-profile` | `30-rules-actions.md:4062` | per-space forEach -> chooseOne -> nested chooseOne | 3 | No | Advising choices remain bounded. |
| `air-lift-cambodia-destination-profile` | `30-rules-actions.md:4200` | origin/destination chooseN -> per-piece chooseOne | 3 | No | Air Lift Cambodia branch has separate origin/destination selectors. |
| `air-lift-profile` | `30-rules-actions.md:4345` | origin/destination chooseN -> per-piece chooseOne | 3 | No | Same Air Lift core. |
| `air-strike-profile` | `30-rules-actions.md:4461` | target chooseN -> casualty/removal chooseOne -> removal chooseN/forEach | 3 | No | Includes bombing/removal follow-ups but no K>3 owner. |
| `govern-profile` | `30-rules-actions.md:4947` | space chooseN -> per-space chooseOne | 2 | No | Simple special-activity branch. |
| `transport-profile` | `30-rules-actions.md:5100` | chooseOne branch -> per-piece forEach -> destination chooseOne | 3 | No | Movement choices are staged, not recursively unbounded. |
| `raid-profile` | `30-rules-actions.md:5367` | per-space forEach -> guerrilla chooseN -> target chooseOne/forEach | 3 | No | Raid removal choices remain within K=3. |
| `infiltrate-profile` | `30-rules-actions.md:5471` | per-space forEach -> chooseOne branch -> chooseN/forEach removal or replacement | 3 | No | Deep but finite special-activity branch. |
| `bombard-profile` | `30-rules-actions.md:5812` | per-space forEach -> chooseOne branch -> chooseN/forEach removal | 3 | No | Similar to Infiltrate without deeper recursion. |
| `tax-profile` | `30-rules-actions.md:6030` | per-space forEach -> nested forEach resource effects | 1 | No | No chooser after selected spaces. |
| `subvert-profile` | `30-rules-actions.md:6102` | per-space forEach -> chooseOne branch -> chooseN/forEach replacement | 3 | No | Similar special-activity branch shape. |

## Macro Rows

| Surface | Source anchor | Deepest nested chooser chain observed | Probe depth that catches induced dead end | `K > 3` needed? | Notes |
| --- | --- | --- | ---: | --- | --- |
| `piece-removal-ordering` | `20-macros.md:231` | chooseOne removal ordering | 1 | No | Shared single-choice removal order. |
| `piece-removal-ordering-targeted-pipeline` | `20-macros.md:266` | target-specific chooseOne -> forEach removal | 2 | No | Shared targeted removal helper. |
| `coin-assault-removal-order` | `20-macros.md:393` | forEach removal pipeline | 1 | No | Delegates target choices to caller. |
| `insurgent-attack-removal-order` | `20-macros.md:505` | forEach removal pipeline | 1 | No | Same as COIN removal helper. |
| `insurgent-ambush-select-spaces-base` | `20-macros.md:619` | chooseN selected spaces | 1 | No | Selector only. |
| `insurgent-ambush-select-spaces-any-activity` | `20-macros.md:682` | chooseN selected spaces | 1 | No | Selector only. |
| `insurgent-ambush-resolve-spaces` | `20-macros.md:747` | selected spaces forEach -> nested chooseOne -> chooseN removal | 3 | No | Ambush is one of the deeper macro shapes, still within K=3. |
| `insurgent-attack-select-spaces` | `20-macros.md:1003` | chooseN selected spaces | 1 | No | Selector only. |
| `pt76-select-enhanced-space` | `20-macros.md:1056` | chooseOne enhanced space | 1 | No | Selector only. |
| `insurgent-terror-select-spaces` | `20-macros.md:1069` | chooseN selected spaces | 1 | No | Selector only. |
| `insurgent-rally-select-spaces` | `20-macros.md:1199` | chooseN selected spaces | 1 | No | Selector only. |
| `insurgent-terror-resolve-space` | `20-macros.md:1258` | per-space forEach -> chooseN sabotage/removal | 2 | No | Terror resolution stays shallow. |
| `insurgent-march-resolve-destination` | `20-macros.md:1392` | moving guerrillas chooseN + moving troops chooseN -> movement/activation forEach | 1 from destination resolver; 2 from March selector | No | Seed-1001 dead-end owner. |
| `insurgent-march-select-destinations` | `20-macros.md:1591` | targetSpaces chooseN -> destination resolver opens moving-piece chooseN | 2 | No | Confirms selected destinations before resolver choices. |
| `bombard-select-spaces` | `20-macros.md:1759` | chooseN selected spaces | 1 | No | Selector only. |
| `advise-select-spaces` | `20-macros.md:1832` | chooseN selected spaces | 1 | No | Selector only. |
| `govern-select-spaces-standard` | `20-macros.md:1853` | chooseN selected spaces | 1 | No | Selector only. |
| `raid-select-spaces` | `20-macros.md:1900` | chooseN selected spaces | 1 | No | Selector only. |
| `infiltrate-select-spaces` | `20-macros.md:1917` | chooseN selected spaces | 1 | No | Selector only. |
| `tax-select-spaces` | `20-macros.md:1970` | chooseN selected spaces | 1 | No | Selector only. |
| `subvert-select-spaces` | `20-macros.md:2025` | chooseN selected spaces | 1 | No | Selector only. |
| `place-from-available-or-map` | `20-macros.md:2100` | per-piece forEach -> chooseN or placement forEach | 2 | No | Shared placement helper. |
| `sweep-loc-hop` | `20-macros.md:2167` | chooseN target LoCs -> per-space forEach | 2 | No | Movement helper. |
| `sweep-activation` | `20-macros.md:2225` | activation forEach | 1 | No | No nested chooser after caller selection. |
| `cap-sweep-cobras-unshaded-removal` | `20-macros.md:2267` | chooseN removal -> forEach | 2 | No | Capability helper. |
| `cap-assault-m48-unshaded-bonus-removal` | `20-macros.md:2471` | chooseN removal -> forEach | 2 | No | Capability helper. |
| `cap-train-caps-unshaded-bonus-police` | `20-macros.md:2509` | chooseOne -> chooseN placement -> nested forEach | 3 | No | Capability helper with bounded nested placement. |
| `cap-patrol-m48-shaded-moved-cube-penalty` | `20-macros.md:2676` | chooseN moved cubes -> forEach penalty | 2 | No | Capability helper. |
| `coup-process-commitment` | `20-macros.md:2738` | chooseN commitment -> forEach chooseOne -> nested chooseN | 3 | No | Coup commitment is deep but bounded. |
| `coup-laos-cambodia-removal` | `20-macros.md:3062` | forEach removal | 1 | No | Coup helper. |
| `tet-general-uprising` | `20-macros.md:3914` | chooseN spaces -> forEach effects | 2 | No | Event macro with selector plus per-space resolution. |
| `easter-offensive-free-march-resolve` | `20-macros.md:4073` | chooseN destinations -> chooseN moving pieces -> forEach activation | 3 | No | Event macro uses March-like shape. |
| `easter-offensive-loc-troop-movement` | `20-macros.md:4199` | chooseN LoCs -> chooseOne movement branch -> forEach | 3 | No | Event macro stays within K=3. |
| `easter-offensive` | `20-macros.md:4241` | chooseN spaces -> forEach chooseOne branch -> forEach resolution | 3 | No | Event macro stays within K=3. |

## Explicit `K > 3` Callout

No FITL authored action/profile/macro surface in the audited source requires `K > 3` for the currently observed constructibility class. The deepest reproducible witness is the NVA/VC March family, and the publication probe catches the induced dead end within the existing budget. Ticket 002 remains responsible for rollback protection if a future dynamic branch exceeds this static audit.
