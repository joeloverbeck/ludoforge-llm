# 155PERGAMCOM-005 Residual Diagnosis

Date: 2026-05-05

## Summary

Ticket 005 reduced the persistent-hot production-spec helper path by storing parsed production bundle metadata in the persistent GameDef cache and by deriving the source fingerprint without composing the full GameSpecDoc. The original 30 s cumulative startup budget remains red on the per-file `node --test` seam because process startup and module/test registration still happen 192 times.

## Commands

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/integration/gamedef-cache-equivalence.test.js dist/test/integration/gamedef-cache-invalidation.test.js
pnpm -F @ludoforge/engine cache:gamedef:warm
node -e "<helper timing probe>"
node -e "<representative file timing probe>"
```

The `node -e` probes were bounded diagnostic probes over the same compiled `dist/` and warmed-cache seam. They did not rewrite repository files.

## Residual Owner Split

Before the v2 cache change, a persistent-hot helper probe showed:

| Component | Time |
|---|---:|
| `loadGameSpecBundleFromEntrypoint` | 1424 ms |
| `readGameDefCache` | 7 ms |
| `assertValidatedGameDef` | 39 ms |
| `validateGameSpec` | 18 ms |
| `runGameSpecStagesFromBundle` after parse | 265 ms |

After the v2 cache change and cache warm:

| Component | Time |
|---|---:|
| `loadGameSpecBundleSourcesFromEntrypoint` | 388 ms |
| `readGameDefCache` | 82 ms |
| `assertValidatedGameDef` | 54 ms |
| `compileProductionSpec` persistent-hot | 441 ms |
| `compileProductionSpec` in-process repeat | 321 ms |
| `loadGameSpecBundleFromEntrypoint` baseline | 1422 ms |

Interpretation:

1. Persistent cache hits are active and now avoid full GameSpecDoc composition on the hot production-spec helper path.
2. Cache JSON size grew from the ticket-004 v1 FITL entry size of about 1.5 MB to the v2 FITL entry size of 17.9 MB because the parsed bundle metadata is now cached with the GameDef.
3. The remaining helper cost is mostly source import/fingerprint collection, JSON read/parse of the larger cache entry, GameDef validation, and unavoidable Node process/module startup outside the helper.

## Representative Per-File Timings

All samples used warmed cache and compiled `dist/` files.

| File | Mode | Before | After |
|---|---|---:|---:|
| `fitl-events-1965-us.test.js` | no-tests | 1775 ms | 842 ms |
| `fitl-events-1965-us.test.js` | full | 1774 ms | 813 ms |
| `fitl-events-1968-vc.test.js` | no-tests | 5682 ms | 1810 ms |
| `fitl-events-1968-vc.test.js` | full | 5596 ms | 1811 ms |
| `fitl-production-map-cities.test.js` | no-tests | 2957 ms | 1295 ms |
| `fitl-production-map-cities.test.js` | full | 2999 ms | 1352 ms |

The three-file no-test sample improved from 10414 ms to 3947 ms, a 6467 ms reduction or 62.10%.

## Budget Verdict

The 30 s aggregate budget remains red for the current per-file process seam. The fastest post-change no-test sample was 842 ms; applying that fastest observed sample as a lower bound across all 192 files gives:

```text
192 * 842 ms = 161664 ms
```

That lower bound is 131664 ms over the 30000 ms target, or 438.88% over budget. Therefore the remaining owner is not the production GameDef cache-hit path; it is runner/process topology and module/test registration repeated once per file.

Successor owner: `tickets/155PERGAMCOM-006.md`.
