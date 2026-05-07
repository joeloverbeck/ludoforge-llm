# Spec 143 Heap Snapshot

## Environment

- Captured on `2026-04-23T18:37:37Z`
- `HEAD`: `92cef34fb58d813d1a4f02770ec15560595915e7`
- Node: `v22.17.0`
- V8: `12.4.254.21-node.27`
- Platform: `linux x64`
- Engine import seam: `packages/engine/dist/src/**`
- Stable artifact-capture command: `node --expose-gc campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed 1002`
- Higher-turn OOM repro command: `node --expose-gc campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed 1002 --max-turns 10`

## Why Two Commands

Current `HEAD` still reproduces the motivating memory bug, but the crashy higher-turn path is not a truthful default artifact-capture command.

- The `--max-turns 10` repro climbed into repeated mark-compact GC at roughly `4.04-4.06 GiB` and terminated with `Reached heap limit` after the last logged sample at `350` total decisions / `349` player decisions / turn `3`.
- That proves the live bug is still present.
- The checked-in diagnostic therefore defaults to `--max-turns 3`, which is the smallest stable capture bound that still surfaces the same rising-heap / rising-cost pattern and yields a `.heapsnapshot` plus structured summary JSON.

## Growth Curve

The stable capture run (`--max-turns 3`) stopped at turn `3` after `283` total decisions (`282` player decisions).

| Decision count | Turn | Heap used | RSS | Interval wall time | Zobrist key cache |
|---|---:|---:|---:|---:|---:|
| 0 | 0 | 129.21 MiB | 290.36 MiB | 0.00 s | 5,861 |
| 25 | 0 | 154.72 MiB | 289.28 MiB | 0.90 s | 6,494 |
| 50 | 0 | 159.40 MiB | 290.82 MiB | 0.77 s | 7,026 |
| 75 | 0 | 182.69 MiB | 290.29 MiB | 2.89 s | 7,539 |
| 100 | 0 | 203.08 MiB | 290.29 MiB | 3.87 s | 8,187 |
| 125 | 1 | 205.74 MiB | 300.04 MiB | 0.82 s | 8,629 |
| 150 | 1 | 210.89 MiB | 309.04 MiB | 1.22 s | 9,008 |
| 175 | 2 | 227.04 MiB | 316.33 MiB | 0.82 s | 9,567 |
| 200 | 2 | 224.33 MiB | 325.08 MiB | 1.03 s | 9,838 |
| 225 | 2 | 82.88 MiB | 327.11 MiB | 1.05 s | 10,094 |
| 250 | 2 | 100.15 MiB | 325.54 MiB | 0.99 s | 10,330 |
| 275 | 2 | 108.04 MiB | 325.39 MiB | 2.20 s | 10,637 |
| 283 | 3 | 113.47 MiB | 325.34 MiB | 0.28 s | 10,763 |

Observed shape:

- Heap growth is GC-sawtoothed, not smoothly linear.
- The envelope still matters: interval cost rose from sub-second slices to `2.89 s` and then `3.87 s` as heap climbed past `180-200 MiB`.
- Cost dropped after the first major GC, then began rising again.
- The runtime-owned `zobristTable.keyCache` grew monotonically across the same span (`5,861 -> 10,763` keys by turn `3`).

This is the concrete evidence behind Spec 143's claim that long-run memory pressure and long-run simulation cost are one architectural class.

## Top Retainers By Representative Retained Size

Methodology note: `Retained size` below is the **largest retained size of any representative instance** for that constructor in the final 3-turn heap snapshot. `Count` is the total live instance count for that constructor in the same snapshot.

| Rank | Retained size | Count | Constructor / type | Likely owner structure | Spec 143 Section 1 mapping |
|---|---:|---:|---|---|---|
| 1 | 10.11 MiB | 133,068 | `Object` | Parsed GameSpec document tree rooted at `parsed`; loader/parser/source-map scaffolding from `loadGameSpecBundleFromEntrypoint` + `parseGameSpec` + `GameSpecSourceMap.byPath` | Gap: not in the starter table; static compile/load surface |
| 2 | 3.00 MiB | 10,180 | `(object properties)` | Backing property array for the same parsed/source-map tree (`parsed -> sourceMap -> byPath -> properties`) | Gap: same parsed/source-map surface as row 1 |
| 3 | 2.73 MiB | 33,140 | `system / Context` | V8/module contexts retained around staged CNL load/compile work | Gap: not in the starter table; likely compile/load scaffolding |
| 4 | 1.97 MiB | 103 | `Map` | `zobristTable.keyCache` | Direct match: `zobristTable.keyCache` |
| 5 | 1.97 MiB | 11,386 | `(anonymous array)` | Backing storage for `zobristTable.keyCache.table` | Direct match: backing storage for `zobristTable.keyCache` |

Concrete source links for the mapped rows:

- Parsed/source-map tree: `packages/engine/src/cnl/load-gamespec-source.ts::loadGameSpecBundleFromEntrypoint`, `packages/engine/src/cnl/parser.ts::parseGameSpec`, `packages/engine/src/cnl/source-map.ts::GameSpecSourceMap`
- `zobristTable.keyCache`: `packages/engine/src/kernel/gamedef-runtime.ts::GameDefRuntime.zobristTable`, `packages/engine/src/kernel/zobrist.ts::createZobristTable`, `packages/engine/src/kernel/zobrist.ts::zobristKey`

## Top Constructors By Instance Count

| Rank | Count | Constructor / type | Max representative retained size | Likely owner structure |
|---|---:|---|---:|---|
| 1 | 160,627 | `(anonymous closure)` | 0.00 MiB | General module / schema / parser closure population; numerous but not a dominant retained region |
| 2 | 133,068 | `Object` | 10.11 MiB | Parsed GameSpec tree rooted at `parsed` |
| 3 | 33,140 | `system / Context` | 2.73 MiB | V8/module contexts around staged parsing / compilation |
| 4 | 21,637 | `(concatenated string)` | 0.00 MiB | Authored FITL text/card strings; numerous but not dominant retained regions |
| 5 | 20,759 | `Array` | 1.64 MiB | Mixed parser/runtime arrays; no single dominant engine-owned array in this ranking |

This matters because it rules out one stale hypothesis from the original investigation notes: the snapshot does **not** implicate giant authored strings as the primary retained region.

## 0-Turn Control vs 3-Turn Capture

The 0-turn control separates static load cost from per-run growth:

| Constructor / type | Turn 0 max retained | Turn 3 max retained | Delta | Interpretation |
|---|---:|---:|---:|---|
| `Map` (`zobristTable.keyCache`) | 1.11 MiB | 1.97 MiB | +0.86 MiB | Clear runtime growth inside a Spec-143-named structure |
| `(anonymous array)` backing `keyCache.table` | 1.11 MiB | 1.97 MiB | +0.86 MiB | Same runtime growth, same owner |
| `system / Context` | 2.72 MiB | 2.73 MiB | effectively flat per representative instance; count rose `30,955 -> 33,140` | Context population grows, but not as one dominant retained region |
| `Object` rooted at `parsed` | 10.11 MiB | 10.11 MiB | flat | Large static compile/load surface, not the long-run growth driver |
| `(object properties)` rooted at `sourceMap.byPath` | 3.00 MiB | 3.00 MiB | flat | Large static compile/load surface, not the long-run growth driver |

## Mapping Back To Spec 143 Section 1

Confirmed rows from the starter table:

- `zobristTable.keyCache` is a real top-N retainer and grows materially during the run.

Not confirmed as top-N in this capture:

- chooseN `probeCache` / `legalityCache`
- token-state index
- policy preview / evaluation contexts
- decision-stack-frame split surfaces

Surfaced by the snapshot but not named in the starter table:

- parsed GameSpec tree / `sourceMap.byPath` load scaffolding
- V8 `system / Context` populations around staged CNL loading / compilation

These are the explicit gaps for `143BOURUNMEM-002`: either classify them as non-runtime baseline cost outside the lifetime-class audit, or extend the audit table so the evidence and taxonomy stay aligned.

## Classification Extensions

The authoritative follow-on audit now lives in [docs/architecture.md](/home/joeloverbeck/projects/ludoforge-llm/docs/architecture.md) under `Runtime Ownership -> Lifetime Classes` and `Authoritative Classification`.

That audit does two things this report intentionally did not do on its own:

- confirms the starter-table rows from Spec 143 against concrete lifecycle paths in engine source
- classifies the snapshot-only gaps here as flat compile/load baseline cost (`run-local-structural`), not as the growing per-decision runtime owner behind the motivating OOM

## Bottom Line

- The motivating witness is still live: the higher-turn repro continues to OOM on current `HEAD`.
- The snapshot does not show giant authored strings as the primary retained region.
- The first clearly runtime-owned growing top-N retainer is `zobristTable.keyCache` and its backing table.
- The largest retained regions overall are still parse/load scaffolding (`parsed`, `sourceMap.byPath`) and V8 contexts, which were not named in the starter table and therefore must be called out explicitly for ticket `002`.
