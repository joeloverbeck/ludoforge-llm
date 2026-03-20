# Musings

## exp-001: Zone and marker lattice lookup maps (O(n) → O(1))
**Hypothesis**: Replacing 6 linear `.zones.find()` calls and 4 `.markerLattices.find()` calls with WeakMap-cached `Map<string, ZoneDef>` and `Map<string, MarkerLatticeDef>` should reduce per-evaluation overhead significantly, especially for FITL with 20+ zones evaluated thousands of times per turn.
**Result**: ACCEPT (17726 -> 16943 ms, -4.4%)
**Learning**: Linear find() on zones is a real hot path. WeakMap caching on the readonly arrays is a clean pattern. Also found 4 tokenTypes.find() calls that could benefit from the same treatment.

## exp-002: tokenTypes lookup map (O(n) → O(1))
**Hypothesis**: 4 linear `.tokenTypes.find()` scans in effects-token.ts can be replaced with a WeakMap-cached Map, following the same pattern as exp-001. Token type lookups happen per token move/draw/moveAll.
**Result**: REJECT (16943 -> 20239 ms, +19.4% regression)
**Learning**: Adding more WeakMap caches for smaller arrays (tokenTypes, globalVars, perPlayerVars, actions) hurt performance badly. These arrays are small enough that linear scan is faster than Map.get() + WeakMap overhead. The zone/lattice maps work because FITL has 20+ zones scanned thousands of times. Focus on algorithmic improvements, not micro-optimizations on small collections.

## exp-003: Cache sorted zone lists in eval-query
**Hypothesis**: `evalZonesQuery`, `evalMapSpacesQuery`, and `evalTokensInMapSpacesQuery` each create new sorted/filtered copies of `ctx.def.zones` on every call via spread+sort+filter. Caching these per GameDef should reduce allocation and CPU overhead in zone enumeration hot paths.
**Result**: REJECT (16943 -> 17486 ms, +3.2% regression)
**Learning**: The extra WeakMap lookup + frozen array overhead isn't worth it for sorted zone lists. The sort itself isn't the bottleneck — it's the condition evaluation inside `applyZonesFilter` that dominates. Should focus on reducing the number of condition evaluations instead.

## exp-004: Avoid object spread in zone condition evaluation
**Hypothesis**: In `applyZonesFilter`, the condition evaluation path does `{ ...ctx, bindings: { ...ctx.bindings, $zone: zone.id } }` for every zone. This creates 2 new objects per zone per filter call. Using Object.create() with property overrides or a pre-allocated reusable context object should reduce GC pressure significantly.
**Result**: ABANDONED — reverted before testing, approach was too hacky (mutating readonly contracts)

## exp-004: Add neighborSets to AdjacencyGraph for O(1) adjacency checks
**Hypothesis**: `evalCondition` for `adjacent` op uses `neighbors.includes(rightZoneId)` which is O(n) per check. Adding pre-built `Set` per zone to AdjacencyGraph makes adjacency checks O(1). The graph is built once and cached. This matters because adjacency checks happen inside condition evaluation which is called per-zone per-filter per-effect during event card processing.
**Result**: NEAR_MISS (16943 -> 16926 ms, -0.1% — within noise)
**Learning**: Array.includes() on 5-10 element arrays is already very fast. The adjacency check isn't the bottleneck — it's the condition evaluation and object creation around it that dominates. Stashed for potential combination with other changes.

## exp-005: Use Object.create() for bindings in forEach and zone filter hot loops
**Hypothesis**: The inner spread `{ ...ctx.bindings, [bind]: item }` in forEach loops and zone filter conditions creates a full copy of all bindings per iteration. Using `Object.create(ctx.bindings)` instead creates a lightweight prototype-chained object where only the new binding is a direct property. All binding access uses `ctx.bindings[key]` which resolves via prototype chain. This could significantly reduce GC pressure in hot forEach loops (20+ iterations per effect chain).
**Result**: ABANDONED — too many call sites use `{ ...ctx.bindings }` spread which breaks prototype chain semantics

## exp-005: Cache createZobristTable via WeakMap
**Hypothesis**: `createZobristTable(def)` is called per `applyMove` when no `GameDefRuntime` is cached (test helpers don't pass runtime). It computes `canonicalizeGameDefFingerprint(def)` which does extensive string manipulation every call. Caching via WeakMap on GameDef should eliminate redundant table creation. Additionally, `computeFullHash` is called per move with expensive bigint hashing — this is the REAL bottleneck.
**Result**: REJECT (16943 -> 22173 ms, +30% regression)
**Learning**: Severe regression. The ZobristTable type change (adding seedHex field) may have broken optimizations elsewhere. Adding a new field to a frequently-created object type can have V8 hidden class implications. Or the WeakMap lookup overhead on GameDef is heavier than recreating the small table. Need to be more surgical — try caching computeFullHash results instead, or find a way to avoid calling it so frequently.

## exp-006: Avoid unnecessary array allocation in effect dispatch loop
**Hypothesis**: In `applyEffectsWithBudget`, line 83: `emittedEvents.push(...(result.emittedEvents ?? []))` creates an empty array and spreads it every iteration when no events are emitted. Also, `applyEffectWithBudget` line 52: `emittedEvents: result.emittedEvents ?? []` does the same. Replacing with conditional push avoids unnecessary allocation in the hot loop.
**Result**: REJECT (16943 -> 18071 ms, +6.7% regression)
**Learning**: The conditional branch (if check + length check) is actually MORE expensive than the `?? []` pattern in V8. V8 likely optimizes the `?? []` + spread into a no-op when the array is empty, and the constant `EMPTY_EVENTS` shared array approach plus the extra `base` object + conditional spread made things worse. Don't fight V8's optimizations with "clever" alternatives.

## exp-007: RADICAL — Reduce conditional spread pattern in option matrix evaluation
**Hypothesis**: ABANDONED — realized V8 is already optimizing these patterns well, and adding complexity makes things worse.

## exp-007: Lazy stateHash computation via Object.defineProperty getter
**Hypothesis**: `computeFullHash()` is called unconditionally on every `applyMove`, computing a full Zobrist hash over ALL zones, tokens, and variables using expensive bigint operations. However, `stateHash` is only used for observability (trace logging, serialization, determinism tests) — never for kernel decisions. Making it a lazy getter that computes on first access means FITL event tests (which don't check stateHash) skip the entire bigint hashing overhead. This could be a massive win since bigint operations are 10-100x slower than regular number operations.
**Result**: REJECT (16943 -> 18054 ms, +6.5% regression)
**Learning**: Object.defineProperty with a getter breaks V8's hidden class optimizations. GameState objects with getters instead of data properties have completely different hidden classes, causing deoptimization across all code that touches GameState. Can't use this approach. Need to either cache zobristKey results, use incremental hashing, or find a way to avoid the hash without changing the object shape.

## exp-008: RADICAL — Cache zobristKey results via Map
**Hypothesis**: `zobristKey()` is called per feature per `computeFullHash()`, which runs per `applyMove()`. Each call does `fnv1a64()` — a character-by-character loop over a string with BigInt operations. For FITL with 200+ tokens + 50+ variables, that's 250+ `fnv1a64` calls per move. Since the table seed never changes and feature strings are often repeated (same token placement features appear across moves), caching `zobristKey()` results by feature encoding string should dramatically reduce BigInt computation.
**Result**: REJECT (16943 -> 18881 ms, +11.4% regression)
**Learning**: Map lookup + string concatenation for cache key is MORE expensive than computing fnv1a64. The feature encodings are mostly unique across calls (different slots, different values), so cache hit rate is low, and the overhead of creating cache key strings + Map.get() exceeds the cost of just computing the hash. Caching strategies consistently fail — V8 is very fast at the raw computation.

## Meta-observation after 10 experiments
Only exp-001 (zone/lattice Map lookup) worked. All other approaches consistently made things worse:
- WeakMap caching on small arrays: WORSE
- Cached sorted lists: WORSE
- Object.create for bindings: UNSAFE
- Object.defineProperty getters: WORSE
- Conditional branches instead of ?? []: WORSE
- Map caching for hashes: WORSE

V8 is incredibly well-optimized for the existing code patterns. The ONLY wins come from eliminating genuinely redundant O(n) work on large collections. Need to find more such patterns or accept that the low-hanging fruit is already picked.

## exp-009: Use getZoneMapFromArray in stacking.ts
**Hypothesis**: `checkStackingConstraints` in `stacking.ts` uses `zones.find()` to look up a zone def by id. This is called from every `moveToken` effect during event card execution. With FITL having hundreds of token moves per event, and 20+ zones to scan, replacing with `getZoneMap()` should improve performance. This follows the same successful pattern as exp-001.
**Result**: NEAR_MISS (16943 -> 17021 ms, +0.5% — within noise)
**Learning**: Stacking checks don't happen frequently enough to make a measurable difference. The zone map cache is shared with exp-001's, so the cache is already warmed.

## exp-010: Combine near-misses (exp-004 + exp-009)
**Hypothesis**: Two near-miss changes that were individually noise-level might combine for a meaningful improvement: neighborSets for O(1) adjacency and getZoneMapFromArray in stacking.
**Result**: ACCEPT (16943 -> 16746 ms, -1.2%)
**Learning**: Near-miss combination works! Two individually-marginal improvements stacked to exceed the 1% threshold. The neighborSets change reduces Set.has() overhead in adjacency condition checks, and getZoneMapFromArray in stacking avoids redundant zone lookup during token placement.

## exp-011: Cache listPlayers array per playerCount
**Hypothesis**: `listPlayers()` creates a new `Array.from({ length: playerCount }, (_, i) => asPlayerId(i))` array every call, which happens every `resolvePlayerSel` invocation. Since playerCount never changes within a game, caching the player list avoids redundant array creation. This is called from zone filters, move enumeration, and effect evaluation.
**Result**: NEAR_MISS (16746 -> 16919 ms, +1.0% — noise)
**Learning**: Creating a 4-element array is already cheap. The Map lookup overhead is comparable. The frequency of `resolvePlayerSel` calls may not be as high as expected in event card tests (which focus on effect execution rather than move enumeration).

## exp-012: Cache event deck card lookup via WeakMap
**Hypothesis**: `deck.cards.find()` is called from 5 places in the kernel, searching through FITL's 72 event cards linearly. `resolveCurrentEventCardState` in particular is called from `legalMoves` and `applyMove` on every turn with an event card context. A WeakMap-cached card-by-id Map per deck.cards array should give O(1) lookups instead of O(72).
**Result**: REJECT (16746 -> 17166 ms, +2.5% regression)
**Learning**: Even with 72 cards, `Array.find()` is faster than the WeakMap+Map lookup overhead. The card lookup only happens 1-2 times per move (not per zone like zone lookups). The overhead of importing `def-lookup.ts` into 3 new modules and doing WeakMap lookups exceeds the savings. Stop trying to cache arrays <100 elements when they're only accessed 1-2 times per call path.

## exp-013: Combine listPlayers cache with current state
**Result**: REJECT (16746 -> 17101 ms, +2.1%)
**Learning**: The listPlayers cache hurt when combined with other optimizations — possibly due to V8 hidden class deoptimization from the Map import or the extra code path in the module graph.

## exp-014: EARLY_ABORT — toSpliced blocked by ES2022 target
## exp-015: Index-based for loop in effect dispatch
**Result**: REJECT (16746 -> 17221 ms, +2.8%)
**Learning**: V8 optimizes for...of with .entries() perfectly. Manual index loops are no faster.

## exp-016: Replace BigInt Zobrist hashing with dual-uint32
**Hypothesis**: Research shows BigInt is 10-60x slower than uint32 pair arithmetic. Replace fnv1a64 BigInt with dual-uint32 FNV-1a using Math.imul.
**Result**: EARLY_ABORT — golden test fixtures contain hardcoded stateHash values (e.g., `17196055347919248442n`). Changing the algorithm produces different hashes, breaking golden tests which are immutable.
**Learning**: Zobrist hash algorithm is locked by golden fixtures. Can only optimize the IMPLEMENTATION of the existing algorithm, not replace it. Could still speed up `fnv1a64` by optimizing the BigInt operations within the same algorithm.

## exp-017: Pre-computed BigInt lookup for ASCII char codes in fnv1a64
**Hypothesis**: `fnv1a64` calls `BigInt(input.charCodeAt(i))` per character, allocating a new BigInt heap object every iteration. All Zobrist feature encodings use only ASCII characters (0-127). A pre-computed `BigInt[]` lookup table avoids per-character BigInt allocation. Since FITL feature strings average ~50 chars each and there are 250+ calls per computeFullHash, this eliminates ~12,500 BigInt allocations per move.
**Result**: NEAR_MISS (16746 -> 16799 ms, +0.3% — within noise)
**Learning**: The BigInt lookup table didn't measurably help. V8 may already optimize small-integer BigInt conversions internally (values 0-127 are "small BigInts" that V8 can represent inline). The real cost isn't the BigInt() conversion per char but the BigInt multiplication and masking per iteration. Stashed for combination.

## exp-018: Dual-uint32 FNV-1a + seedHex cache + prefix pre-hash
**Hypothesis**: Replace BigInt arithmetic in fnv1a64 with dual-uint32 Number arithmetic (10-60x faster per-byte ops). Also cache seed.toString(16) and pre-hash the zobristKey prefix string. Three optimizations stacked for maximum zobrist speedup.
**Result**: REJECT (16746 -> 17029 ms, +1.7% regression — median of 3 runs: 17059, 16902, 17029)
**Learning**: V8's BigInt implementation is highly competitive with manual dual-uint32 Number arithmetic for FNV-1a. The overhead of tuple allocation [hi,lo], modular arithmetic (% MOD32), and carry computation exceeds V8's optimized BigInt code path. Also attempted inlining feature encoding in computeFullHash — even worse (17067ms). The entire Zobrist hashing path is effectively at V8's optimization floor. **Zobrist is NOT the bottleneck.** Must look elsewhere for gains.

## Meta-observation: Zobrist path exhausted
Experiments 005, 007, 008, 016, 017, 018 all targeted Zobrist hashing. None improved performance. V8 optimizes BigInt operations well. The bottleneck is NOT in hashing. Need to explore condition evaluation, effect application, or move enumeration paths.

## exp-019: Replace redundant zone map allocation in applyTokenFilter
**Hypothesis**: `applyTokenFilter` in eval-query.ts creates `new Map(ctx.def.zones.map(...))` on every call, rebuilding a zone-by-id lookup map from scratch. The cached `getZoneMap(ctx.def)` from def-lookup.ts returns the same map via WeakMap cache, eliminating O(zones) allocation per token filter evaluation. Token filtering happens inside forEach loops over effect chains during event card processing — potentially hundreds of times per move.
**Result**: ACCEPT (16746 -> 15892 ms, -5.1%)
**Learning**: MASSIVE win from a 1-line change. The redundant Map allocation was the #1 hot path bottleneck. This confirms the pattern from exp-001: eliminating redundant O(n) work on FITL's ~60 zones yields huge gains. The applyTokenFilter function is called far more frequently than expected — likely inside forEach loops over tokens during event card effect execution. Should audit all other uncached Map/Set allocations in eval-query.ts and adjacent files.

## exp-020: Replace localeCompare with fast ASCII compare in hot paths
**Hypothesis**: `localeCompare` has ICU overhead. Replacing with `<`/`>` ternary comparisons should be 10-100x faster for ASCII strings.
**Result**: REJECT (15892 -> 16174 ms, +1.8% regression)
**Learning**: V8 optimizes `localeCompare` for ASCII strings. The ternary `a < b ? -1 : a > b ? 1 : 0` does TWO string comparisons per call vs one `localeCompare`. The overhead of the extra comparison outweighs any ICU savings. Don't fight V8's built-in string operations.

## exp-023: Cache listZoneIds per def.zones (V8 PROFILING GUIDED)
**Hypothesis**: V8 profiling revealed `StringFastLocaleCompare` (11.4%) + `ArrayTimSort` (9.2%) + `sortAndDedupeZones` (5.5%) = 26%+ of JS time. The `listZoneIds` function in resolve-selectors.ts calls `sortAndDedupeZones(ctx.def.zones.map(zone => zone.id))` on every zone resolution — creating a mapped array, Set, spread, and sort of 60+ zones. Caching the result per `def.zones` array via WeakMap eliminates ALL of this after the first call.
**Result**: ACCEPT (15892 -> 15136 ms, -4.8%)
**Learning**: V8 profiling was the breakthrough. Instead of guessing, the profile data clearly showed sorting/localeCompare consuming 26% of JS time. The `listZoneIds` function was called hundreds of times per test, each time creating 4 intermediate data structures (map → Set → spread → sort) for 60 zones. The WeakMap cache hits on every call after the first because `ctx.def.zones` is the same readonly array reference. This is the SAME pattern as exp-001 and exp-019: cache def-derived data that never changes.

## Post-exp-023 V8 Profile (after sorting caches)
With listZoneIds cached, the profile landscape changed dramatically:
- StringFastLocaleCompare: 11.4% → 0.5% (caching worked!)
- ArrayTimSort: 9.2% → 1.0% (caching worked!)
- CreateDataProperty: 5.8% → 14.5% (now #1 — object spread/creation dominates)
- Megamorphic ICs: 5.0% + 4.7% = 9.7% (polymorphic property access from varied object shapes)
- CloneObjectIC_Slow: 2.9% (slow object cloning)
Object creation/spreading is now 17.4% of JS time. This is the effect context spreading in forEach loops and effect dispatch. But past experiments (exp-004, 006, 007) show that alternatives to V8's object creation make things WORSE.

## exp-027: Pre-sorted hash keys on ZobristTable
**Result**: REJECT (15136 -> 15651 ms, +3.4% regression)
**Learning**: WeakMap.get() overhead + optional chaining exceeds the sort cost for 60 elements. V8 is extremely fast at Object.keys().sort() on small arrays. WeakMap caching only works when it eliminates LARGE redundant work (like the 60-element Map creation in exp-019 or the full sort+Set+map+spread in exp-023).

## Meta-observation: WeakMap caching threshold
WeakMap caching wins ONLY when eliminating work that creates 50+ Map entries or does 50+ element sort+dedup+map chains. For smaller work (10-element arrays, 60-element sorts without extra allocation), WeakMap.get() overhead exceeds the savings. The successful caches (exp-001, exp-019, exp-023) all eliminated O(n) ALLOCATION work, not just O(n log n) sorting.

## Meta-observation: V8 profiling is essential
Stop guessing and profile. The profile immediately revealed that sorting (20%+ of time) was the real bottleneck, not Zobrist hashing (<1%), not object creation (<2%), not any of the other hypotheses. USE PROFILING DATA.

## exp-024: Cache sorted zone lists in eval-query (REPEAT OF exp-003)
**Result**: REJECT (15136 -> 16151 ms, +6.7% regression)
**Learning**: Same as exp-003. WeakMap overhead for zone sorting in eval-query exceeds the sort cost. The sort is fast for 60 elements; the bottleneck is condition evaluation INSIDE applyZonesFilter, not the sort.