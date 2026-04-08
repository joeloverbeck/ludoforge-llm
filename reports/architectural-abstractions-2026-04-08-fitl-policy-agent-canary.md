# Architectural Abstraction Recovery: fitl-policy-agent-canary

**Date**: 2026-04-08
**Input**: `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`
**Engine modules analyzed**: ~122 (93 kernel + 22 agents + 7 sim)
**Prior reports consulted**: none

## Executive Summary

The FITL PolicyAgent determinism canary test exercises the full engine stack: compilation, validation, runtime creation, agent decision-making, and the simulator loop. Analysis reveals two cross-subsystem fractures with strong multi-signal evidence — a **grant lifecycle authority split** across 4 kernel modules and a **card-driven turn-order projection drift** where the same accessor is independently reimplemented 4-5 times. A third finding (simulator MoveContext boundary inversion) is placed in "Needs Investigation" due to single-signal evidence. The effect system, policy agent pipeline, and free-operation module decomposition are found to be acceptably complex.

## Scenario Families

| Family | Tests | Domain Concepts | Key Assertions |
|--------|-------|----------------|----------------|
| Termination within bounds | 4 (seed 1001-1004, terminal test) | Terminal detection, bounded computation, turn-flow advancement | `stopReason === 'terminal'` within 100 moves |
| Deterministic replay | 4 (seed 1001-1004, replay test) | PRNG determinism, state hashing, move enumeration stability | Identical move count + identical `stateHash` across two runs |

These two families exercise the entire simulation pipeline end-to-end: compilation → initial state → (legal moves → agent selection → apply move → phase advance → terminal check) loop. The canary's purpose per its docstring is to guard against regressions in grant handling, legal-move enumeration, and turn-flow advancement.

## Traceability Summary

| Module Cluster | Scenario Families | Confidence | Strategy |
|----------------|------------------|------------|----------|
| `sim/simulator.ts` | Both | High | Import (direct from test via `runGame`) |
| `kernel/legal-moves.ts` + 40 deps | Both | High | Import (called by simulator loop) |
| `kernel/apply-move.ts` + 37 deps | Both | High | Import (called by simulator loop) |
| `kernel/phase-advance.ts` + 19 deps | Both | High | Import (called by apply-move post-execution) |
| `kernel/grant-lifecycle.ts` + 2 deps | Both | High | Import (called by legal-moves, apply-move, turn-flow-eligibility) |
| `kernel/turn-flow-eligibility.ts` + 12 deps | Both | High | Import (called by apply-move, phase-advance) |
| `kernel/free-operation-viability.ts` + 10 deps | Both | High | Import (called by grant-lifecycle, legal-moves) |
| `kernel/terminal.ts` | Termination | High | Import (called by simulator loop) |
| `agents/policy-agent.ts` + 21 agent deps | Both | High | Import (agent.chooseMove in simulator loop) |
| `kernel/effects-*.ts` (9 files) | Both | Medium | Import chain (apply-move → effects → effect-registry → effect handlers) |
| `kernel/turn-flow-lifecycle.ts` | Both | Medium | Import (called by turn-flow-eligibility) |
| `kernel/free-operation-*.ts` (22 files) | Both | Medium | Import chain + temporal coupling |
| `kernel/turn-flow-*.ts` (10 files) | Both | Medium | Import chain + temporal coupling |

## Fracture Summary

| # | Fracture Type | Location | Evidence Sources | Severity |
|---|--------------|----------|-----------------|----------|
| 1 | **Authority leak** | grant-lifecycle.ts, turn-flow-eligibility.ts, apply-move.ts, phase-advance.ts, effects-turn-flow.ts | Import analysis + temporal coupling | HIGH |
| 2 | **Projection drift** | turn-flow-eligibility.ts, turn-flow-lifecycle.ts, free-operation-viability.ts, legal-moves-turn-order.ts, turn-flow-action-class.ts, free-operation-action-domain.ts | Code duplication (grep) + import analysis | MEDIUM |

## Candidate Abstractions

### 1. Grant Array Authority

**Kind**: Authority boundary
**Scope**: kernel/grant-lifecycle.ts, kernel/turn-flow-eligibility.ts, kernel/apply-move.ts, kernel/phase-advance.ts, kernel/effects-turn-flow.ts
**Fractures addressed**: #1 (Authority leak)

**Owned truth**: The `pendingFreeOperationGrants` array within `TurnFlowRuntimeState` — its creation, element insertion, element transition, element removal, and array-level invariants (e.g., at most one offered grant per seat, sequence ordering).

**Current state**: Five modules write the grants array:

| Module | What it writes | How |
|--------|---------------|-----|
| `turn-flow-eligibility.ts` | Creates grants from event definitions, advances sequenceWaiting → ready, manages array after moves | `toPendingFreeOperationGrants()`, `withPendingFreeOperationGrants()`, `advanceSequenceReadyPendingFreeOperationGrants()` |
| `apply-move.ts` | Consumes grants (ready/offered → exhausted), splices consumed grant from array | `consumeAuthorizedFreeOperationGrant()` via `consumeUse()` from grant-lifecycle.ts |
| `phase-advance.ts` | Expires grants at phase boundaries | Direct `expireGrant()` call + array rebuild |
| `effects-turn-flow.ts` | Creates grants as an effect execution result | Writes `pendingFreeOperationGrants:` in state updates |
| `legal-moves.ts` | Creates temporary probe grants during enumeration | `pendingFreeOperationGrants:` in probe state overlays |

`grant-lifecycle.ts` owns the individual object state machine transitions (`advanceToReady`, `markOffered`, `consumeUse`, `skipGrant`, `expireGrant`) but does NOT own the array management — callers are responsible for splicing the transitioned object back into the array and maintaining array-level invariants.

**Invariants**:
- A grant's lifecycle phase transitions must follow the state machine: `sequenceWaiting → ready → offered → consumed/exhausted/skipped/expired`
- No two grants in the array may have the same `grantId`
- Array mutations must preserve sequence ordering for batched grants
- Probe overlays (legal-moves, free-operation-viability) must not persist into committed state

**Owner boundary**: A new module (e.g., `kernel/grant-array.ts` or expanding `grant-lifecycle.ts`) that owns both individual transitions AND array-level operations (insert, consume-and-remove, expire-and-remove, advance-batch). Callers would use this module's array-level API rather than directly manipulating the array.

**Modules affected**:
- `grant-lifecycle.ts` — absorbs array management responsibility
- `turn-flow-eligibility.ts` — delegates array writes to the authority module
- `apply-move.ts` — delegates grant consumption to the authority module
- `phase-advance.ts` — delegates grant expiry to the authority module
- `effects-turn-flow.ts` — delegates grant creation to the authority module

**Tests explained**: Both scenario families (termination + replay). The canary's docstring explicitly names "free-operation grant handling" as the regression vector it guards. Deterministic replay requires identical grant array evolution.

**Expected simplification**:
- Fewer direct writers of grant state (5 → 1)
- Array-level invariants enforced in one place instead of implicitly across 5 modules
- Reduced temporal coupling: changes to grant array semantics would be localized
- Clearer debugging: all grant mutations flow through one chokepoint with trace entries

**FOUNDATIONS alignment**:
- §8 Determinism: **aligned** — centralizing grant writes reduces the surface for non-deterministic divergence
- §11 Immutability: **aligned** — the authority module would return new arrays, same as today
- §5 One Rules Protocol: **aligned** — centralizing removes risk of sim/agent seeing different grant state than kernel
- §15 Architectural Completeness: **aligned** — addresses a root cause rather than papering over symptoms

**Confidence**: High
**Counter-evidence**: If the 5 writers never produce inconsistent state (i.e., if the current distributed writes are already bug-free and the temporal coupling is purely additive feature work, not bug-fix cascades), then the split authority is costly to maintain but not actively harmful. Examine git blame on the co-change commits: if they are always adding new features (not fixing grant-related bugs), the case for consolidation weakens.

---

### 2. Card-Driven Turn-Order Accessor

**Kind**: Projection owner
**Scope**: kernel/turn-flow-eligibility.ts, kernel/turn-flow-lifecycle.ts, kernel/free-operation-viability.ts, kernel/legal-moves-turn-order.ts, kernel/turn-flow-action-class.ts, kernel/free-operation-action-domain.ts
**Fractures addressed**: #2 (Projection drift)

**Owned truth**: The extraction of card-driven configuration from `GameDef` and card-driven runtime state from `GameState` — the two accessor functions that every turn-flow-adjacent module needs.

**Current state**: Two private helper functions are independently reimplemented across the kernel:

`cardDrivenRuntime(state: GameState): CardDrivenRuntime | null` — duplicated in 4 files:
- `turn-flow-eligibility.ts:75`
- `turn-flow-lifecycle.ts:21`
- `free-operation-viability.ts:66`
- `legal-moves-turn-order.ts:20`

`cardDrivenConfig(def: GameDef): CardDrivenConfig | null` — duplicated in 5 files:
- `turn-flow-eligibility.ts:72`
- `turn-flow-lifecycle.ts:18`
- `legal-moves-turn-order.ts:17`
- `turn-flow-action-class.ts:8`
- `free-operation-action-domain.ts:5`

Each also independently defines the associated type aliases (`CardDrivenConfig`, `CardDrivenRuntime`).

**Invariants**:
- The accessor must return `null` for non-card-driven turn orders (discriminated union narrowing)
- The returned type must be the exact discriminated variant, not a widened union
- All consumers must handle the `null` case (non-card-driven games)

**Owner boundary**: A shared module (e.g., `kernel/card-driven-accessors.ts` or added to existing `kernel/turn-flow-action-class.ts`) that exports these two functions and their associated type aliases.

**Modules affected**: All 6 files listed above — replace private definitions with imports from the shared module.

**Tests explained**: Both scenario families. Every simulation tick exercises turn-flow eligibility (which calls cardDrivenRuntime/Config) and legal-move enumeration (which also calls them). Inconsistent behavior between copies could cause enumeration/eligibility divergence.

**Expected simplification**:
- 9 duplicate function bodies → 2 shared exports
- 9 duplicate type aliases → 2 shared type exports
- Reduced risk of copies drifting apart if the discriminated union shape changes
- Smaller file sizes for each consumer module

**FOUNDATIONS alignment**:
- §1 Engine Agnosticism: **strained** — the card-driven accessors are themselves specific to the `cardDriven` turn-order variant, but this is acceptable since the engine supports multiple turn-order types. The accessor is generic within that variant.
- §14 No Backwards Compatibility: **aligned** — consolidation would delete duplicates, not create shims
- §15 Architectural Completeness: **aligned** — DRY violation is the root cause

**Confidence**: High
**Counter-evidence**: The duplication may be intentional to avoid circular imports — if the 6 consumer files form a dependency cycle when they share a common module, the duplication is a pragmatic trade-off. Check whether a shared `card-driven-accessors.ts` module would introduce circular dependencies among these files. If it would, the duplication is acceptable.

## Acceptable Architecture

### Effect System Decomposition (`effects-*.ts`, 9 files)

The effect handlers are split by domain: `effects-token.ts`, `effects-var.ts`, `effects-choice.ts`, `effects-control.ts`, `effects-resource.ts`, `effects-reveal.ts`, `effects-binding.ts`, `effects-subset.ts`, `effects-turn-flow.ts`. Git history shows these files frequently change together in bulk refactors (e.g., effect context API changes), but also change independently when individual effect semantics evolve. This is appropriate decomposition: each file handles a cohesive set of effect kinds, the shared contract is `effect-context.ts` + `effect-registry.ts`, and the files are small enough to understand individually. The co-change pattern reflects shared API evolution, not split authority.

### Policy Agent Pipeline (`agents/policy-*.ts`, ~10 files)

The policy evaluation pipeline is decomposed into: profile resolution → evaluation core → policy runtime → policy preview → policy surface → policy expression analysis → diagnostics. Each module has clear inputs/outputs, and the pipeline flows in one direction (profile → evaluation → selection). The `PolicyAgent` class orchestrates, and individual modules are testable in isolation. This is well-structured despite the file count.

### Free-Operation Module Decomposition (22 files)

Despite the high file count, each `free-operation-*.ts` module addresses a distinct concern: viability probing, discovery analysis, grant authorization, seat resolution, action domain resolution, execution context, outcome policy, preflight overlay, sequence progression, legality policy, zone filter probing/contracts, grant bindings, overlap resolution, captured sequence zones, sequence key/schema, Zod validation, and the base overlay. The decomposition follows the project's "many small files" convention and maintains single-responsibility per file. The fracture is NOT in the decomposition itself but in the grant array authority split (Candidate #1 above) that spans across these modules and others.

### Move Decision Pipeline (`move-decision-*.ts`, 3 files)

The move decision sequence, completion, and discoverer modules form a clear pipeline for resolving multi-step decisions within a move. Each has a distinct role in the sequence resolution process.

## Needs Investigation

### Simulator MoveContext Boundary Inversion (single signal: code analysis)

`simulator.ts:38-62` defines `captureMoveContext()` which extracts game-semantic metadata from moves via string pattern matching:

```typescript
const eventSide = actionId.includes('shaded') ? 'shaded' : actionId.includes('unshaded') ? 'unshaded' : undefined;
const currentCardId = typeof move.params['$cardId'] === 'string' ? move.params['$cardId'] : ...;
const turnFlowWindow = typeof move.params['__windowId'] === 'string' ? move.params['__windowId'] : undefined;
```

The kernel defines the `MoveContext` type (`types-core.ts:1487`) with fields `currentCardId`, `previewCardId`, `eventSide`, `turnFlowWindow` — but provides no extraction function. The simulator reimplements the extraction using string matching and magic parameter names.

**Signal found**: Code analysis shows the simulator reaching into kernel-domain semantics without a kernel-provided API.

**Second signal needed**: Temporal coupling (do simulator.ts and kernel type changes co-change when MoveContext evolves?) or a bug where the string matching produced wrong results. Check `git log --all -- packages/engine/src/sim/simulator.ts` for commits mentioning MoveContext, captureMoveContext, or eventSide. If the function has been patched to accommodate kernel changes, that confirms the boundary inversion.

### Turn-Flow Protocol Span (single signal: file count)

The turn-flow protocol spans 10 `turn-flow-*.ts` files plus participation from `phase-advance.ts`, `apply-move.ts`, `event-execution.ts`, and `effects-turn-flow.ts`. The "what happens after a move" protocol is orchestrated jointly by `apply-move.ts` (which calls `applyTurnFlowEligibilityAfterMove`) and `turn-flow-eligibility.ts` (which performs the actual state transitions).

**Signal found**: High file count (10+ files) and cross-module orchestration.

**Second signal needed**: Check whether post-move turn-flow bugs have required coordinated fixes across multiple files (temporal coupling specifically for bug-fix commits, not feature additions). If post-move eligibility bugs are always fixed in a single file, the protocol is well-partitioned despite being spread across many files.

## Recommendations

- **Spec-worthy**: 
  - **Grant Array Authority** (Candidate #1) — the 4-writer pattern for a critical state array is the highest-risk architectural finding. Worth a spec to centralize grant array operations. Start by examining git blame on co-change commits to confirm they include bug fixes (not just feature additions).

- **Quick fix (no spec needed)**:
  - **Card-Driven Turn-Order Accessor** (Candidate #2) — straightforward DRY consolidation. Verify no circular dependency issues, then extract to a shared module in a single ticket.

- **Acceptable**: Effect system, policy agent pipeline, free-operation decomposition, move decision pipeline.

- **Needs investigation**: Simulator MoveContext extraction, turn-flow protocol span.
