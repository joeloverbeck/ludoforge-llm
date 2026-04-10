# Phase 4: DETECT — Two Parallel Lenses

Phase 4 runs two detection lenses in parallel. Both receive the exercised module list and scenario family table as input.

**Prior-report exclusion**: If Phase 1 produced a known-finding exclusion list from prior reports, include it in both Lens A and Lens B agent prompts. Agents should skip patterns already covered by excluded findings.

**Subsystem scoping**: When the exercised module set exceeds 100 files due to short-circuit, focus Lens A scatter analysis on the subsystem(s) directly imported by the test file. Use other subsystems (e.g., kernel/, sim/) only as boundary context for Lens B fracture analysis. State this scoping decision in the report's Traceability Summary.

## Lens A: Structural Scatter

Operates bottom-up within the exercised module set.

**Step 1 — Concept clustering**: Group files by shared naming fragments, discriminant types, state-carrier types, and exported symbol prefixes.

Clustering signals:
1. **Filename clustering**: Glob for `packages/engine/src/kernel/*-*.ts` and extract hyphenated prefixes/suffixes. Count files sharing each fragment. Include multi-word patterns and camelCase prefixes.
2. **Discriminant clustering**: Grep for key discriminated union fields (`kind:`, `type:`). Any discriminant value checked in 3+ files is a cluster seed.
3. **State-carrier clustering**: Types used as function parameters or return types in 3+ exercised files. Types flowing through many modules without a single owning file.
4. **Repeated guard clustering**: Recurring combinations of property checks or boolean expressions in 2+ files.
5. **Exported symbol clustering**: Recurring name prefixes across 3+ files.

Name each cluster by its dominant concept. Filter to clusters exceeding the file-count threshold: max(5, 10% of analyzed modules, 8 when >80% come from barrel re-exports).

**Three counts per cluster**: (a) defining files — export symbols matching the concept, (b) consumer files — import/use those symbols, (c) temporally-coupled files — co-changed with defining files in 5+ commits. Defining files drive the threshold; consumer and temporal counts provide coupling context.

If two clusters share >50% of their defining files, merge them. Track sub-concepts as facets.

**Step 2 — Early-exit check**: If a cluster's symbols are predominantly single-property accessors (read-only queries, simple getters, type narrowing helpers) and no discriminant is being matched in multiple files, mark as "Acceptable — fundamental accessor" and skip to next cluster.

**Step 3 — Metric measurement**: For clusters that didn't early-exit:

| Metric | How to measure | Signal strength |
|--------|---------------|-----------------|
| **Scattered discriminant guards** | `switch`/`if`/ternary on the cluster's key discriminated unions in 3+ files with similar-but-not-identical logic | **Strong** |
| **Repeated predicate patterns** | Recurring property check combinations or `.filter()` predicates in 2+ locations | **Strong** |
| **Derived state recomputation** | Functions computing the same derived value from the same inputs in different modules | **Strong** |
| **Clone-like redundancy** | Near-duplicate logic blocks in 2+ files | **Strong** |
| **Optional-property lifecycle smell** | Types with 2+ optional properties modelling implicit phases without explicit state discriminant | **Strong** |
| **High fan-in** | >10 callers from >3 directories | **Moderate** |
| **Repeated Map/Set mutation** | Same conceptual collection rebuilt/filtered from scratch in 2+ modules | **Moderate** |
| **Simulator compensation** | Error handlers in `sim/` compensating for kernel gaps (zero compensation is a positive signal) | **Strong** |
| **Workaround indicators** | Comments with "workaround"/"hack"/"safety net"/"fallback"/"broadened"; functions named with `fallback`/`defer`/`recover`/`retry`; catch blocks returning fallback values | **Supporting** |

**Step 4 — Scenario grounding**: Map each flagged cluster to scenario families from Phase 2. A cluster that cannot explain any scenario family is demoted to "Needs Investigation" — not promoted to a finding. Patterns found only in test helper functions — not in production source — should be evaluated differently. Test duplication that exists to exercise sub-pipelines independently is acceptable if the canonical implementation has a single production call site. Only flag test scatter when it reveals a missing public API that tests are forced to reconstruct.

**Tool usage**: Grep for patterns, Read specific functions for manual comparison, Bash for git log. For clusters with >20 defining files, delegate scanning to 1-3 parallel Explore sub-agents.

## Lens B: Architectural Fractures

Operates top-down from scenario families to subsystem boundaries. Within a monolithic package like `kernel/`, treat functional areas (turn-flow, effects, legal-moves, free-operation) as distinct subsystems.

Scan the exercised code for these 8 fracture types:

| # | Fracture Type | What to look for |
|---|--------------|-----------------|
| 1 | **Split protocol** | The legal sequence of interactions is spread across multiple modules/layers. Module A decides "what", module B decides "when", module C decides "whether". |
| 2 | **Authority leak** | Multiple modules write the same truth. Two or more places create/mutate/invalidate the same piece of state. |
| 3 | **Projection drift** | Derived summaries or cached computations are recomputed everywhere. No single module owns the projection. Detected at all scales — cross-subsystem and intra-subsystem. |
| 4 | **Boundary inversion** | Higher layers own rules that belong in lower layers. The simulator enforces what the kernel should prevent. |
| 5 | **Concept aliasing** | The same domain concept exists under different names/types in neighboring subsystems. |
| 6 | **Hidden seam** | Files across nominal module boundaries repeatedly change together in git history, suggesting they belong in the same module. |
| 7 | **Overloaded abstraction** | One type/module carries several lifecycle roles that should be separated. |
| 8 | **Orphan compatibility layer** | A shim, fallback path, or "safety net" handler exists only to mask a deeper missing abstraction. |

**Evidence rule**: A fracture is NOT reported unless supported by at least two independent signals (e.g., import analysis + temporal coupling, or naming similarity + assertion patterns). Single-signal fractures go in "Needs Investigation."

**Sub-agent delegation**: For small test suites (<15 direct test-file imports from engine source), perform Lens B directly. For larger suites, delegate to a sub-agent with: (1) scenario family table, (2) top 5-10 temporal coupling clusters, (3) list of key boundary modules, (4) specific questions about each potential fracture area.

**Tool usage**: Grep for shared type names across modules, Grep for duplicate predicate patterns, Read key functions at boundary points, Bash for git log co-change analysis.

## Cross-Lens Reinforcement

After both lenses complete, compare findings:

- **Cross-lens reinforced**: A Lens A cluster and a Lens B fracture reference overlapping modules -> merge into a single finding. Confidence is automatically elevated.
- **Contained scatter**: A Lens A cluster with no corresponding Lens B fracture -> real but lower severity.
- **Boundary-level fracture**: A Lens B fracture with no corresponding Lens A cluster -> modules are clean internally but the boundary between them is wrong.
- **Needs Investigation**: Findings from either lens with only one signal.

This cross-lens merge is the core value of the unified approach.

**Sub-agent claim verification**: Before writing findings, verify at least one evidence claim per lens per finding by reading the cited source directly. Prioritize verifying: (a) claims of code duplication (confirm the logic is actually similar, not just similarly named), (b) claims of scattered discriminant guards (confirm the branching logic overlaps).
