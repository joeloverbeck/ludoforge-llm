# Musings

## Campaign Summary (after 11 experiments)

**Baseline**: 37914ms → **Best**: 33746ms → **Improvement**: 11.0%

### Accepted (2):
- exp-001: Zobrist key cache (37914 → 34481, -9.06%) — HIGH IMPACT
- exp-002: Pre-sorted key arrays (34481 → 33746, -2.13%)

### Near-misses (3):
- exp-003: Trigger event-type index (within noise)
- exp-009: Skip trigger dispatch validation (within noise)
- exp-011: Avoid state spread for stateHash (inconsistent)

### Rejected (5):
- exp-004: Inline zobrist encoding (-1.82%)
- exp-005: Mutable EffectContext (within noise)
- exp-006: Cached SeatResolutionIndex (+2.62%)
- exp-007: Split bigint [hi,lo] XOR (+5.88%)
- exp-008: Regex-free parseDecisionKey (+4.37%)

### Early Abort (1):
- exp-010: Combine stashes (conflicting)

### Key Learnings:
1. V8 JIT is very good at micro-optimizations — don't try to beat it at object allocation, regex, or BigInt XOR
2. Caching only helps when construction cost >> lookup cost
3. The zobrist key cache was the one big win — eliminated actual computational redundancy
4. Cross-campaign optimizations don't always transfer
5. Most remaining time is in core kernel game logic that V8 handles efficiently
6. Need fine-grained profiling inside applyMove to find the real sub-function bottlenecks

## Profiling Infrastructure (exp-012: committed as infrastructure, not experiment)

Added opt-in `PerfProfiler` to `ExecutionOptions`. Zero overhead when disabled. Profiling results:

### applyMove internal breakdown (23303ms total):
| Sub-function | Time | % |
|---|---|---|
| **actionEffects (applyEffects)** | **19238ms** | **82.6%** |
| advanceToDecisionPoint | 2277ms | 9.8% |
| computeFullHash | 1243ms | 5.3% |
| validateMove | 357ms | 1.5% |
| dispatchTriggers | 37ms | 0.2% |
| resolvePreflight | 1.4ms | ~0% |

**Critical insight**: Effect application is 82.6% of applyMove.

### Per-effect-type breakdown (within actionEffects):
| Effect | Time | Calls | Avg |
|---|---|---|---|
| **if** | 35000ms | 130886 | 0.27ms (inclusive of nested) |
| **gotoPhaseExact** | 17322ms | 4302 | **4.03ms** |
| forEach | 347ms | 24933 | 0.01ms |
| setVar | 122ms | 104949 | 0ms |

**gotoPhaseExact at 4.03ms per call is the real hotspot** — it calls dispatchLifecycleEvent WITHOUT cachedRuntime, forcing adjacency graph and runtime table index rebuild on every phase transition (8604 redundant rebuilds!).

## exp-013: Pass cachedRuntime through gotoPhaseExact → dispatchLifecycleEvent
**Category**: caching
**Hypothesis**: gotoPhaseExact omits cachedRuntime when calling dispatchLifecycleEvent, forcing 8604 redundant buildAdjacencyGraph + buildRuntimeTableIndex calls. Passing the cached structures through should dramatically reduce gotoPhaseExact cost.
Texas Hold'em has zero triggers, so trigger dispatch is negligible.
The zobrist hash (already optimized) is only 5.3%.
advanceToDecisionPoint at 9.8% is the second target after effects.

## exp-012: Avoid full state spread in writeScopedVarBranchesToState
**Category**: allocation
**Hypothesis**: writeScopedVarBranchesToState does `{ ...state, globalVars, perPlayerVars, zoneVars }` which spreads ALL ~20+ GameState fields just to change 3. Called ~253K times.
**Result**: REJECT (33746 -> 39748 ms, +17.8% — catastrophic regression)
**Learning**: `Object.create(null)` creates prototype-less objects that BREAK V8's hidden class system. All subsequent property accesses become dictionary-mode (slow). V8 relies on hidden classes (shapes) for fast property access — objects MUST have a consistent prototype chain. The `{ ...state }` spread is actually fast because V8 recognizes the pattern and uses its optimized hidden class transition. The bottleneck is NOT the spread itself — it's the sheer volume of calls. Need batching, not a different allocation strategy.
