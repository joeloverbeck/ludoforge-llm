# Spec 144 I1 Probe-Depth Audit

Date: 2026-04-24

Scope: FITL authored action/macro surfaces that contain `chooseN`, nested `chooseOne`, or `forEach` bodies with sub-choices. The audit is source-derived from `data/games/fire-in-the-lake/20-macros.md` and `data/games/fire-in-the-lake/30-rules-actions.md`, then cross-checked against the live publication probe contract.

## Result

Default `MICROTURN_PROBE_DEPTH_BUDGET = 3` is retained. The deepest currently relevant authored chain for the seed-1001 class is NVA/VC March:

`$targetSpaces` chooseN -> `resolve-per-destination` forEach -> `$movingGuerrillas@{$destSpace}` / `$movingTroops@{$destSpace}` chooseN.

That is a two-level player-choice chain after the action candidate. A depth budget of 3 gives one level of headroom before ticket 002's rollback safety net becomes responsible for residual deeper holes.

## Rows

| Surface | Authored owner | Nested chooser chain observed | Probe depth that catches induced dead end | Notes |
| --- | --- | ---: | ---: | --- |
| `march-nva-profile` | `30-rules-actions.md`, via `insurgent-march-select-destinations` and `insurgent-march-resolve-destination` in `20-macros.md` | 2 | 2 | Deepest known live witness. The failure is a `$targetSpaces` confirm whose resumed destination resolver opens an empty moving-pieces chooseN. |
| `march-vc-profile` | Same macro family as NVA March | 2 | 2 | Same structure with VC faction filters. |
| Insurgent attack / ambush / terror / rally / tax / subvert selection macros | `20-macros.md` and `30-rules-actions.md` | 1-2 | 2 | Selection chooseN followed by per-space or removal choices; no audited branch requires more than the March budget. |
| COIN assault / sweep / train / patrol / raid families | `20-macros.md` and `30-rules-actions.md` | 1-2 | 2 | Source scan shows chooseN plus forEach sub-choice patterns comparable to insurgent families. |
| Event-card action bodies with chooseN / chooseOne sub-choices | `41-events/*.md` | 1-2 | 2 | Event bodies contain many selection and per-target follow-up choices, but no static chain in the audited source exceeded the March shape. |
| Coup processing helpers | `20-macros.md` | 1-2 | 2 | Coup support/redeploy helpers use chooseN / chooseOne under forEach; no `K>3` owner identified. |

## Explicit `K > 3` Callout

No FITL authored action was identified as requiring `K > 3` for the currently audited constructibility class. Future tickets may still need rollback protection for dynamic branches deeper than this audit can prove statically; that remains ticket 002's scope.
