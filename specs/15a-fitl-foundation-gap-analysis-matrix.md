# Spec 15a: FITL Foundation Gap Analysis Matrix

**Status**: Draft
**Parent**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`
**Purpose**: Gate 0 deliverable set for FITL foundation architecture.

## Deliverable 1: `GameSpecDoc` Expressiveness Matrix

| Mechanic | Current `GameSpecDoc`/AST Support | Gap Status | Required Action | Owning Spec |
| --- | --- | --- | --- | --- |
| Multi-track numeric state (Aid, Patronage, Trail, Resources) | `globalVars` and `perPlayerVars` int ranges with clamp semantics. | No-change (representable). | Model as bounded vars with deterministic recompute actions/triggers. | Spec 16 |
| Space-level political state (Support/Opposition levels, Control flags, Terror/Sabotage markers) | Token props + zones can encode state; no first-class enum lattice semantics. | Extension required. | Add declarative enum/tag field support or canonical encoded int conventions with compiler validation. | Spec 16 |
| Piece status dimensions (Underground/Active/Tunneled) | Token props support status flags; no built-in status transition invariants. | Extension required. | Add schema conventions + validators for allowed status transitions by token type. | Spec 16 |
| Adjacency and connectivity | `zones[].adjacentTo`, `adjacent`, `connected`, adjacency queries already present. | No-change (representable). | Use explicit map dataset, including provisional-edge annotations in data. | Spec 16 |
| Bounded choice (`up to N`) and exact choice (`N`) | `chooseN` supports exact `n`; no direct `0..N` optional cardinality primitive. | Extension required. | Add reusable optional-cardinality choice primitive or compiler macro lowering to deterministic branches. | Spec 18 |
| Alternative branch selection (A or B event modes) | Can encode with action params + `chooseOne`; branching semantics are manual. | No-change with policy. | Standardize card/operation branch template for deterministic traces. | Spec 17 |
| Cross-space aggregate constraints | `aggregate` over queries supports sum/count/min/max. | No-change (representable). | Define canonical query ordering and tie-break policy when player choice absent. | Spec 17 |
| Operation bundles (cost + legality + sequencing + partial execution) | Generic `actions` + `pre` + `cost` + `effects` exist, but no dedicated operation DSL contract. | Extension required. | Define declarative operation schema profile and compiler diagnostics for partial-execution rules. | Spec 18 |
| Event lifecycle windows (current/revealed/next card, lasting effects) | Zones/tokens/triggers can represent lifecycle indirectly; no first-class event lifecycle model. | Extension required. | Introduce generic card lifecycle state model and windowed eligibility semantics. | Spec 17 |
| Deterministic tie-breaks where no player choice exists | Engine iterates sorted zones and stable query results in many paths; policy not formalized globally. | Extension required. | Add global ordering contract document + runtime assertions for deterministic iteration points. | Spec 17 |

## Deliverable 2: Compiler Lowering Matrix

| High-Level Requirement | Lowering Target in `GameDef` | Current Coverage | Gap | Proposed Generic Compiler Capability |
| --- | --- | --- | --- | --- |
| Track updates and bounds | `setVar`/`addVar` effects over bounded int vars. | Covered. | None. | Keep current lowering; add diagnostics for missing bound declarations in FITL profiles. |
| Status/tag transitions | `createToken`/`moveToken`/`destroyToken` with token props. | Partial. | No transition policy validation. | Add compile-time rule-pack validators for allowed status transition graphs. |
| Operation legality profiles | `actions[].pre`, `params`, `cost`, `effects`, `limits`. | Partial. | No canonical "execute as much as possible" lowering templates. | Add compiler templates/macros for partial execution and bounded target pipelines. |
| Bounded optional target selection | Params + `chooseN` + follow-up effects. | Partial. | `chooseN` is exact cardinality only. | Add `chooseUpToN` primitive or compile macro with deterministic fallback logic. |
| Dual-use event execution | Action params + branch effects + triggers. | Partial. | No standard event lifecycle package. | Add lifecycle-aware card action templates and diagnostics for incomplete branch coverage. |
| Lasting effects (capability/momentum) | Triggers + state vars/tokens. | Partial. | No standard temporal-window lowering contract. | Add generic duration/lifecycle lowering helpers (card-scoped, coup-scoped, campaign-scoped). |
| Deterministic ordering points | Sorted query outputs + explicit iteration effects. | Partial. | Global contract not codified in compiler. | Add compiler-time determinism checks for unsupported unordered queries in non-choice paths. |

## Deliverable 3: Runtime Capability Matrix

| Runtime Capability | Current Engine Support | Gap Status | Invariants Required | Owning Spec |
| --- | --- | --- | --- | --- |
| Seeded randomness | PCG RNG + deterministic `nextInt`; trace path already stable. | No-change. | Same seed + same moves => byte-equivalent trace. | Spec 21 (verification) |
| Adjacency and connectivity | Built from explicit `adjacentTo`; normalized and sorted neighbors. | No-change. | No unknown zones, no self-loops, deterministic neighbor ordering. | Spec 16 |
| Choice validation | `chooseOne` and `chooseN` validate membership and uniqueness. | Partial. | Optional cardinality and aggregate constraints need reusable support. | Spec 18 |
| Deterministic iteration | Zone/query results often sorted; `forEach` order uses query output order. | Partial. | Global policy must define every non-choice ordering site. | Spec 17 |
| Card/event lifecycle state | Can be emulated via zones/tokens/triggers. | Extension required. | One-card lookahead, windowed eligibility, lasting effect expiration must be explicit and auditable. | Spec 17 |
| Domain-specific state typing | Token props and vars only. | Extension required. | Track/tag schemas must be validated without game-specific branching in runtime. | Spec 16 |
| Operation framework semantics | Generic actions/effects available. | Extension required. | Cost validation, partial execution policy, and deterministic target sequencing contracts. | Spec 18 |

## Deliverable 4: Determinism Checklist

All items must be true before Milestone A exits.

- [ ] All ordering-sensitive iteration points use explicit deterministic order policy (zone id lexical, stable token order, explicit player order).
- [ ] All tie-breaks with no player choice are encoded in data or reusable policy modules, never implicit map iteration.
- [ ] RNG consumption points are explicit in traces for shuffle/random insertion/probabilistic resolution.
- [ ] No effect/query uses non-deterministic host iteration (`Object.keys` unsorted, map/set iteration without normalization) in decision-critical logic.
- [ ] Replay test: same seed + same move sequence yields byte-identical `GameTrace`.
- [ ] Existing non-FITL games retain deterministic behavior under unchanged seeds.

## Deliverable 5: No-Hardcoded-FITL Audit Checklist

All checks are required for Spec 21 acceptance.

- [ ] No branching on FITL-specific ids/names in `src/kernel/**`.
- [ ] No FITL-specific branching in generic compiler code under `src/cnl/**`.
- [ ] Any new primitive names are domain-agnostic (for example, `chooseUpToN`, not `fitlSelectSpaces`).
- [ ] FITL-specific constants, map data, scenario data, and cards live under FITL data/spec assets, not runtime/control flow code.
- [ ] Tests asserting FITL behavior do so through data-driven APIs, not private FITL-only helper hooks in kernel/compiler.
- [ ] Regression tests prove at least one non-FITL game compiles/runs unchanged after FITL capability additions.

## Gate 0 Resolution Map

| P0 Gap | Resolution Path Type | Resolution Path |
| --- | --- | --- |
| Typed domain tracks and markers | Extension | Spec 16 introduces validated typed track/tag conventions in schema + setup assets. |
| Piece state dimensions | Extension | Spec 16 adds piece-status schema validation and transition guardrails. |
| Declarative operation framework | Extension | Spec 18 adds reusable operation profile templates and partial execution rules. |
| Choice + target DSL expressiveness | Extension | Spec 18 adds optional cardinality and aggregate target constraint primitives/macros. |
| Event lifecycle model | Extension | Spec 17 introduces generic card lifecycle and windowed eligibility model. |
| Deterministic ordering contracts | Extension | Spec 17 codifies global ordering contract and runtime/compiler checks. |
| Map dataset ingestion | Extension | Spec 16 adds YAML-embedded FITL map/piece/scenario asset ingestion and validation pipeline. |

## Cross-Spec Reference Contract

These specs must reference this file directly:

- `specs/16-fitl-map-scenario-and-state-model.md`
- `specs/17-fitl-turn-sequence-eligibility-and-card-flow.md`
- `specs/18-fitl-operations-and-special-activities.md`
- `specs/19-fitl-coup-round-and-victory.md`
- `specs/20-fitl-event-framework-and-initial-card-pack.md`
- `specs/21-fitl-foundation-integration-tests-and-traces.md`
