# Spec 102: Shared Observer Model

**Status**: Draft
**Priority**: P1
**Complexity**: L
**Dependencies**: None
**Blocks**: Spec 104 (unified decision-context considerations), Spec 105 (explicit preview contracts)
**Estimated effort**: 5-8 days

## Problem Statement

Visibility is defined inside `agents.visibility` in the GameSpecDoc, making it an agent-only concern. FOUNDATIONS.md #4 states: "players, agents, and runners consume projections of that state according to visibility rules encoded in the spec." FOUNDATIONS.md #5 states: "the simulator, web runner, and AI agents MUST all use the same action, legality, and event protocol."

Today, only the `PolicyAgent` consumes visibility declarations. The runner, simulator, and replay tools have no access to a shared observability model. This means:

1. The runner cannot enforce information hiding for human players without ad hoc UI-level filtering.
2. The simulator cannot verify that a replay respects the observer perspective of a given seat.
3. If a game author changes what is visible, only agent behavior changes — the runner and simulator are unaware.
4. The `agents.visibility` section conflates two concerns: what information exists from a given perspective (rule-authoritative) and which perspective an agent profile uses (policy concern).

The external review (`brainstorming/agent-dsl-improvements.md`) identified this as the most fundamental architectural issue in the Agent DSL.

## Goals

- Move observability definitions out of `agents:` into a top-level `observability:` section in GameSpecDoc
- Define named **observer profiles** that declare which state surfaces are visible from each perspective
- Agent profiles reference an observer by name rather than defining visibility inline
- Compile observer profiles into a `CompiledObserverCatalog` in GameDef
- Make the catalog available to all clients: agents, runner, simulator, replay
- Preserve the existing surface visibility semantics (`public`, `seatVisible`, `hidden`) and preview visibility

## Non-Goals

- Conditional perception rules (e.g., "see opponent hand only at showdown") — future work
- Runner-side enforcement of observer projections (runner integration is a separate follow-up)
- Simulator-side observer projection validation (separate follow-up)
- Changing the existing ref whitelist or expression language

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Observer definitions are generic — no game-specific logic. Any game can define observers. |
| **2. Evolution-First** | Observer definitions live in GameSpecDoc YAML. Evolution can mutate visibility rules. |
| **3. Visual Separation** | Observers define rule-authoritative information boundaries, not presentation. |
| **4. Authoritative State and Observer Views** | **Directly implements this principle.** Observers are the shared projection model for all clients. |
| **5. One Rules Protocol** | All clients consume the same `CompiledObserverCatalog`. No per-client visibility logic. |
| **7. Specs Are Data** | Observers are declarative YAML, no code. |
| **8. Determinism** | Static compilation. Same spec = same observer catalog. |
| **12. Compiler-Kernel Boundary** | Observer compilation is a compiler responsibility. The kernel does not interpret observer definitions at runtime — clients use the compiled catalog. |
| **14. No Backwards Compatibility** | `agents.visibility` is removed in the same change. All owned game specs migrated. |
| **16. Testing as Proof** | Observer compilation golden tests. Visibility enforcement tests. Migration coverage. |

## Design

### Part A: GameSpecDoc Schema

A new top-level `observability:` section defines named observer profiles:

```yaml
observability:
  observers:
    omniscient:
      description: "Full state access — for debugging and replay"
      surfaces:
        globalVars: { visibility: public }
        perPlayerVars: { visibility: public }
        derivedMetrics: { visibility: public }
        victory:
          currentMargin: { visibility: public }
          currentRank: { visibility: public }
        activeCardIdentity: { visibility: public }
        activeCardTag: { visibility: public }
        activeCardMetadata: { visibility: public }
        activeCardAnnotation: { visibility: public }
      preview:
        globalVars: { visibility: public, allowWhenHiddenSampling: false }
        perPlayerVars: { visibility: public, allowWhenHiddenSampling: false }
        victory:
          currentMargin: { visibility: public, allowWhenHiddenSampling: false }
          currentRank: { visibility: public, allowWhenHiddenSampling: false }
        activeCardIdentity: { visibility: public, allowWhenHiddenSampling: false }
        activeCardTag: { visibility: public, allowWhenHiddenSampling: false }
        activeCardMetadata: { visibility: public, allowWhenHiddenSampling: false }
        activeCardAnnotation: { visibility: public, allowWhenHiddenSampling: false }

    currentPlayer:
      description: "Standard player perspective — sees own data, public game state"
      surfaces:
        globalVars: { visibility: public }
        perPlayerVars: { visibility: seatVisible }
        derivedMetrics: { visibility: public }
        victory:
          currentMargin: { visibility: public }
          currentRank: { visibility: public }
        activeCardIdentity: { visibility: public }
        activeCardTag: { visibility: public }
        activeCardMetadata: { visibility: public }
        activeCardAnnotation: { visibility: public }
      preview:
        globalVars: { visibility: public, allowWhenHiddenSampling: false }
        perPlayerVars: { visibility: seatVisible, allowWhenHiddenSampling: false }
        victory:
          currentMargin: { visibility: public, allowWhenHiddenSampling: false }
          currentRank: { visibility: public, allowWhenHiddenSampling: false }
        activeCardIdentity: { visibility: public, allowWhenHiddenSampling: false }
        activeCardTag: { visibility: public, allowWhenHiddenSampling: false }
        activeCardMetadata: { visibility: public, allowWhenHiddenSampling: false }
        activeCardAnnotation: { visibility: public, allowWhenHiddenSampling: false }
```

Design rules:
- `observers` is a record of named profiles
- Each observer profile declares `surfaces` (current state visibility) and `preview` (preview state visibility)
- Surface families match the existing catalog shape: `globalVars`, `perPlayerVars`, `derivedMetrics`, `victory`, `activeCardIdentity`, `activeCardTag`, `activeCardMetadata`, `activeCardAnnotation`
- Visibility values: `public`, `seatVisible`, `hidden`
- Preview entries add `allowWhenHiddenSampling: boolean`

### Part B: Agent Profile Observer Binding

Agent profiles reference an observer by name:

```yaml
agents:
  # visibility: REMOVED — replaced by observability.observers

  profiles:
    us-baseline:
      observer: currentPlayer    # references observability.observers.currentPlayer
      params: { ... }
      use: { ... }
```

- `observer` is required on every profile
- The compiler validates that the referenced observer exists in `observability.observers`
- The `agents.visibility` section is removed entirely

### Part C: Compiled IR

```typescript
// New type in types-core.ts
interface CompiledObserverProfile {
  readonly surfaces: CompiledAgentPolicySurfaceCatalog;  // reuses existing type
}

interface CompiledObserverCatalog {
  readonly observers: Readonly<Record<string, CompiledObserverProfile>>;
}

// In CompiledGameDef (top-level)
interface CompiledGameDef {
  // ... existing fields ...
  readonly observerCatalog: CompiledObserverCatalog;
}

// In CompiledAgentProfile — observer reference replaces inline visibility
interface CompiledAgentProfile {
  readonly observerName: string;  // key into observerCatalog.observers
  // ... existing fields (params, use, preview, etc.) ...
}
```

### Part D: Compilation Pipeline

1. New file `compile-observers.ts` with `lowerObservers(spec): CompiledObserverCatalog`
   - Validates observer profile structure
   - Validates visibility class values
   - Produces compiled surface catalogs per observer
2. `compile-agents.ts` changes:
   - `lowerSurfaceVisibility()` removed
   - `lowerProfiles()` resolves `observer` field against the compiled observer catalog
   - The `CompiledAgentPolicySurfaceCatalog` is looked up from the observer catalog at profile resolution time
3. `validate-agents.ts` changes:
   - Observer-specific validation extracted to `validate-observers.ts`
   - Agent validation checks `observer` field references valid observer name

### Part E: Runtime Changes

- `policy-runtime.ts`: `createPolicyRuntimeProviders()` receives the observer catalog and resolves the profile's observer at evaluation time (behavior identical — just the source of the visibility catalog changes)
- `policy-surface.ts`: `isSurfaceVisibilityAccessible()` unchanged — it already works against `CompiledAgentPolicySurfaceCatalog`

### Part F: Migration

FITL `92-agents.md`:
- Move `agents.visibility` content to new `observability.observers.currentPlayer` section
- Add `observer: currentPlayer` to each profile
- Remove `agents.visibility`

Texas Hold'em `92-agents.md`:
- Currently has no `agents.visibility` section (implicitly omniscient)
- Add `observability.observers` section with a `public` observer (all surfaces public)
- Add `observer: public` to the baseline profile

## Testing

1. **Compilation golden tests**: compile both games, assert observer catalog structure matches expected output
2. **Observer resolution tests**: profile with valid observer compiles; profile with invalid observer name fails
3. **Visibility enforcement tests**: existing policy-surface tests continue to pass (behavioral equivalence)
4. **Missing observer section test**: spec without `observability:` fails compilation with clear error
5. **Cross-game test**: both FITL and Texas Hold'em compile and run with observer-based visibility
6. **Schema artifact test**: GameDef JSON schema includes `observerCatalog`

## Migration Checklist

- [ ] Remove `agents.visibility` from `game-spec-doc.ts` schema
- [ ] Add `observability.observers` to `game-spec-doc.ts` schema
- [ ] Create `compile-observers.ts`
- [ ] Create `validate-observers.ts`
- [ ] Update `compile-agents.ts` to consume observer catalog
- [ ] Update `types-core.ts` with new compiled types
- [ ] Add `observerCatalog` to `CompiledGameDef`
- [ ] Add `observerName` to `CompiledAgentProfile`
- [ ] Migrate FITL `92-agents.md`
- [ ] Migrate Texas Hold'em `92-agents.md`
- [ ] Update GameDef JSON schema
- [ ] Update all affected tests and fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
