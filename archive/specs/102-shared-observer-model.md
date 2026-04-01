# Spec 102: Shared Observer Model

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: None
**Blocks**: Spec 104 (unified decision-context considerations), Spec 105 (explicit preview contracts), Spec 106 (zone/token observer integration)
**Estimated effort**: 6-10 days

## Problem Statement

Visibility is defined inside `agents.visibility` in the GameSpecDoc, making it an agent-only concern. FOUNDATIONS.md #4 states: "players, agents, and runners consume projections of that state according to visibility rules encoded in the spec." FOUNDATIONS.md #5 states: "the simulator, web runner, and AI agents MUST all use the same action, legality, and event protocol."

Today, only the `PolicyAgent` consumes visibility declarations. The runner, simulator, and replay tools have no access to a shared observability model. This means:

1. The runner cannot enforce information hiding for human players without ad hoc UI-level filtering.
2. The simulator cannot verify that a replay respects the observer perspective of a given seat.
3. If a game author changes what is visible, only agent behavior changes — the runner and simulator are unaware.
4. The `agents.visibility` section conflates two concerns: what information exists from a given perspective (rule-authoritative) and which perspective an agent profile uses (policy concern).

Additionally, the codebase has two disconnected visibility systems:
- **Surface visibility** (`agents.visibility`): controls access to scalar state surfaces (globalVars, perPlayerVars, metrics, cards)
- **Token-level observation** (`observation.ts` / `derivePlayerObservation()`): controls which tokens in which zones are visible to which seats, derived from `ZoneDef.visibility`

FOUNDATIONS.md #4 demands a single projection model. This spec unifies the architectural model and implements the surface visibility portion. Spec 106 completes the unification by migrating zone/token visibility into the observer model.

The external review (`brainstorming/agent-dsl-improvements.md`) identified this as the most fundamental architectural issue in the Agent DSL.

## Goals

- Move observability definitions out of `agents:` into a top-level `observability:` section in GameSpecDoc
- Define named **observer profiles** that declare which state surfaces are visible from each perspective
- Support **defaults + overrides** so profiles only declare deviations from sensible defaults
- Support **single-parent inheritance** via `extends` to reduce duplication
- Provide **built-in observers** (`omniscient`, `default`) that need not be declared in YAML
- Rename compiled visibility types to reflect their shared (not agent-specific) nature
- Agent profiles reference an observer by name rather than defining visibility inline
- Compile observer profiles into a `CompiledObserverCatalog` in GameDef
- Make the catalog available to all clients: agents, runner, simulator, replay
- Preserve the existing surface visibility semantics (`public`, `seatVisible`, `hidden`) and preview visibility
- Reserve the `zones` key in observer profiles for future zone/token visibility integration (Spec 106)

## Non-Goals

- Conditional perception rules (e.g., "see opponent hand only at showdown") — future work
- Runner-side enforcement of observer projections (runner integration is a separate follow-up)
- Simulator-side observer projection validation (separate follow-up)
- Zone/token visibility migration into the observer model (Spec 106)
- Changing the existing ref whitelist or expression language

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Observer definitions are generic — no game-specific logic. Any game can define observers. |
| **2. Evolution-First** | Observer definitions live in GameSpecDoc YAML. Evolution can mutate visibility rules. Defaults + overrides minimize YAML surface for mutation. |
| **3. Visual Separation** | Observers define rule-authoritative information boundaries, not presentation. |
| **4. Authoritative State and Observer Views** | **Directly implements this principle.** Observers are the shared projection model for all clients. Architecture designed for full unification (surfaces + zones/tokens). |
| **5. One Rules Protocol** | All clients consume the same `CompiledObserverCatalog`. No per-client visibility logic. |
| **7. Specs Are Data** | Observers are declarative YAML, no code. |
| **8. Determinism** | Static compilation. Same spec = same observer catalog. Fingerprinted for identity. |
| **12. Compiler-Kernel Boundary** | Observer compilation is a compiler responsibility. The kernel does not interpret observer definitions at runtime — clients use the compiled catalog. |
| **14. No Backwards Compatibility** | `agents.visibility` is removed in the same change. All owned game specs migrated. Type renames applied across all consuming files — no aliases. |
| **16. Testing as Proof** | Observer compilation golden tests. Visibility enforcement tests. Migration coverage. Behavioral equivalence proven. |

## Design

### Part A: Built-In Observers

The compiler provides two built-in observer profiles that need not be declared in YAML:

**`omniscient`**: All surfaces `public`. All preview surfaces `public` with `allowWhenHiddenSampling: false`. Used for debugging, replay, and full-state analysis.

**`default`**: Matches the current `lowerSurfaceVisibility` defaults. Used when a game omits the `observability:` section or when an agent profile omits the `observer` field. Defaults:

| Surface Family | current | preview.visibility | preview.allowWhenHiddenSampling |
|----------------|---------|-------------------|-------------------------------|
| globalVars | `public` | mirrors current | `true` |
| perPlayerVars | `seatVisible` | mirrors current | `true` |
| derivedMetrics | `hidden` | mirrors current | `false` |
| victory.currentMargin | `hidden` | mirrors current | `false` |
| victory.currentRank | `hidden` | mirrors current | `false` |
| activeCardIdentity | `hidden` | mirrors current | `false` |
| activeCardTag | `hidden` | mirrors current | `false` |
| activeCardMetadata | `hidden` | mirrors current | `false` |
| activeCardAnnotation | `hidden` | mirrors current | `false` |

Built-in observers cannot be overridden or extended by YAML declarations. User-defined observers with the same name are a compilation error.

### Part B: GameSpecDoc Schema

A new top-level `observability:` section defines named observer profiles:

```yaml
observability:
  observers:
    currentPlayer:
      description: "Standard FITL player perspective"
      surfaces:
        globalVars: public
        perPlayerVars:
          _default: seatVisible
          resources: public
        victory:
          currentMargin: public
          currentRank: public
        activeCardIdentity: public
        activeCardTag: public
        activeCardMetadata: public
        activeCardAnnotation: public

    spectator:
      extends: currentPlayer
      description: "Spectator — no per-player data"
      surfaces:
        perPlayerVars: hidden
```

Design rules:
- `observers` is a record of named profiles.
- Each observer profile declares `surfaces` (visibility overrides) and optionally `extends` (single-parent inheritance).
- Surface families match the existing catalog shape: `globalVars`, `perPlayerVars`, `derivedMetrics`, `victory`, `activeCardIdentity`, `activeCardTag`, `activeCardMetadata`, `activeCardAnnotation`.
- Visibility values: `public`, `seatVisible`, `hidden`.
- **Defaults**: any surface not mentioned inherits from the defaults table (Part A). This means a minimal observer can declare zero surfaces and behave identically to the `default` built-in.
- **Shorthand syntax**: `surfaceName: public` is shorthand for `{ current: public }`. Preview mirrors current; `allowWhenHiddenSampling` uses the default for that surface family.
- **Full syntax** when preview differs from current:
  ```yaml
  perPlayerVars:
    current: seatVisible
    preview:
      visibility: hidden
      allowWhenHiddenSampling: true
  ```
- **Per-variable overrides** for map-type surfaces (`globalVars`, `perPlayerVars`, `derivedMetrics`):
  ```yaml
  perPlayerVars:
    _default: seatVisible       # applies to all vars not individually listed
    resources: public            # override for a specific var
    secretPlan:                  # full form for a specific var
      current: hidden
      preview:
        visibility: hidden
        allowWhenHiddenSampling: false
  ```
  When `_default` is omitted, the system default for that surface family applies.
- **`extends` rules**:
  - Names exactly one other observer in the same `observers` map.
  - Max depth = 1: the extended observer must not itself use `extends`.
  - Resolution order: system defaults -> parent's overrides -> child's overrides.
  - Cannot extend built-in observers by name.
  - Compiler validates: target exists, no cycles, no depth > 1.
- **Reserved key**: `zones` is reserved for future zone/token visibility (Spec 106). The compiler emits a diagnostic error if a game spec uses it.
- **Validation against declared surfaces**: for map-type surfaces, the compiler validates that per-variable overrides reference variables that actually exist in the game spec (e.g., a `globalVars.secretCounter` override requires `secretCounter` to exist in the game's `globalVars`).

### Part C: Agent Profile Observer Binding

Agent profiles reference an observer by name:

```yaml
agents:
  # visibility: REMOVED — replaced by observability.observers

  profiles:
    us-baseline:
      observer: currentPlayer    # references observability.observers.currentPlayer
      params: { ... }
      use: { ... }

    simple-bot:
      # observer omitted — uses built-in 'default' observer
      params: { ... }
      use: { ... }
```

- `observer` is optional. When omitted, the profile uses the built-in `default` observer.
- The compiler validates that the referenced observer exists in `observability.observers` or is a built-in name.
- The `agents.visibility` section is removed entirely.

### Part D: Compiled Types (Renames)

All shared visibility types are renamed to remove the `AgentPolicy` prefix:

| Current Name | New Name |
|---|---|
| `AgentPolicySurfaceVisibilityClass` | `SurfaceVisibilityClass` |
| `CompiledAgentPolicySurfacePreviewVisibility` | `CompiledSurfacePreviewVisibility` |
| `CompiledAgentPolicySurfaceVisibility` | `CompiledSurfaceVisibility` |
| `CompiledAgentPolicySurfaceCatalog` | `CompiledSurfaceCatalog` |
| `CompiledAgentPolicySurfaceRefFamily` | `SurfaceRefFamily` |
| `CompiledAgentPolicySurfaceRef` | `CompiledSurfaceRef` |
| `CompiledAgentPolicySurfaceRefBase` | `CompiledSurfaceRefBase` |
| `CompiledAgentPolicySurfaceSelector` | `SurfaceSelector` |
| `CompiledAgentPolicyCurrentSurfaceRef` | `CompiledCurrentSurfaceRef` |
| `CompiledAgentPolicyPreviewSurfaceRef` | `CompiledPreviewSurfaceRef` |

Types that are genuinely agent-specific retain their prefix: `CompiledAgentProfile`, `CompiledAgentLibraryIndex`, `AgentPolicyCatalog`, etc.

Per FOUNDATIONS.md #14: no aliases, no shims. All consuming files updated in the same change.

### Part E: Compiled IR

```typescript
// New types in types-core.ts

interface CompiledObserverProfile {
  readonly fingerprint: string;                 // content-hash of this profile
  readonly surfaces: CompiledSurfaceCatalog;    // renamed from CompiledAgentPolicySurfaceCatalog
  // RESERVED for Spec 106:
  // readonly zones?: CompiledZoneVisibilityCatalog;
}

interface CompiledObserverCatalog {
  readonly schemaVersion: 1;
  readonly catalogFingerprint: string;          // content-hash of entire catalog
  readonly observers: Readonly<Record<string, CompiledObserverProfile>>;
  readonly defaultObserverName: string;         // key into observers — the fallback
}

// In GameDef (top-level)
interface GameDef {
  // ... existing fields ...
  readonly observers?: CompiledObserverCatalog;  // NEW — top-level, peers with agents
}

// In CompiledAgentProfile — observer reference
interface CompiledAgentProfile {
  readonly observerName?: string;  // key into GameDef.observers — undefined means 'default'
  // ... existing fields (params, use, preview, etc.) ...
}
```

**Transition strategy for `AgentPolicyCatalog.surfaceVisibility`**: This field is retained and populated by resolving the profile's observer from the catalog. The runtime path at `policy-runtime.ts` (`input.catalog.surfaceVisibility`) continues to work unchanged. This is not a backwards-compatibility shim — it is a derived field computed from the observer catalog at compile time. A future spec can remove it once all runtime consumers read from the observer catalog directly.

### Part F: Compilation Pipeline

1. **New file `compile-observers.ts`** with `lowerObservers(spec, diagnostics, options): CompiledObserverCatalog | undefined`
   - If `observability` is null, returns `undefined` (runtime falls back to built-in defaults)
   - For each observer:
     a. If `extends` is set, resolve parent (must exist, must not itself extend)
     b. Apply system defaults for all unmentioned surfaces
     c. Apply parent overrides (if extends)
     d. Apply this observer's overrides on top
     e. For map-type surfaces, expand `_default` and per-id overrides against known IDs from options
     f. Expand shorthand syntax
     g. Reuse existing `lowerSurfaceVisibilityEntry` for each surface
   - Fingerprint each observer profile
   - Fingerprint the catalog
   - Reject `zones` key with a reserved-key diagnostic
   - Reject user-defined observers named `omniscient` or `default`

2. **New file `validate-observers.ts`** — extracted from `validate-agents.ts`
   - Validates observer profile structure
   - Validates known surface family keys (rejects unknowns)
   - Validates visibility class values
   - Validates `extends` references valid observer
   - Validates no circular extends
   - Validates no extends chains deeper than 1
   - Validates reserved key `zones` not used
   - Validates per-variable overrides reference existing game surfaces

3. **Modified `compile-agents.ts`**:
   - `lowerSurfaceVisibility()` becomes a thin wrapper: resolves the observer catalog to produce per-catalog `surfaceVisibility`
   - `lowerProfiles()` resolves `observer` field against the compiled observer catalog
   - When `observers` is absent from GameDef, existing default logic applies

4. **Modified `validate-agents.ts`**:
   - Observer-specific validation extracted to `validate-observers.ts`
   - Agent validation checks `observer` field references valid observer name

5. **Modified `compiler-core.ts`**:
   - Call `lowerObservers()` before `lowerAgents()`, passing known surface IDs
   - Pass compiled observer catalog into `lowerAgents()`

### Part G: Runtime Changes

- `policy-runtime.ts`: No behavioral changes. The `input.catalog.surfaceVisibility` path continues to work because `AgentPolicyCatalog` retains the field (populated from the observer at compile time).
- `policy-surface.ts`: Rename type references only. `isSurfaceVisibilityAccessible()` unchanged.
- `observation.ts`: No changes in this spec. Zone/token visibility remains unchanged until Spec 106.

### Part H: Relationship to Zone/Token Visibility

The codebase has two visibility systems that must eventually be unified:

| | Surface Visibility (this spec) | Token-Level Observation (Spec 106) |
|---|---|---|
| **Governs** | Scalar state surfaces (vars, metrics, cards) | Tokens in zones |
| **Defined in** | `observability.observers.*.surfaces` | Currently: `ZoneDef.visibility` |
| **Compiled to** | `CompiledSurfaceCatalog` | Currently: zone-level property |
| **Consumed by** | `policy-runtime.ts`, `policy-surface.ts` | `observation.ts` / `derivePlayerObservation` |
| **Enforced at** | Expression evaluation time | State projection time |

Spec 106 will:
1. Add `zones` to observer YAML schema
2. Add `CompiledZoneVisibilityCatalog` to `CompiledObserverProfile`
3. Modify `derivePlayerObservation()` to accept an observer name
4. Make `ZoneDef.visibility` the default that observer profiles can override

This means different observers can see the same zone differently (e.g., `omniscient` sees all tokens, `spectator` sees only public tokens). This is the architectural path to conditional perception.

### Part I: Migration

**FITL `92-agents.md`**:
- Create new `observability:` section (either in `92-agents.md` or a new `92-observability.md`)
- Move `agents.visibility` content to `observability.observers.currentPlayer`
- With defaults + overrides, the FITL observer becomes concise (only override deviations from defaults)
- Add `observer: currentPlayer` to each profile
- Remove `agents.visibility`

**Texas Hold'em `92-agents.md`**:
- No changes needed. Texas Hold'em has no `agents.visibility` section today.
- Profiles get no `observer` field, so they use the built-in `default` observer.
- This preserves the current (admittedly incomplete) behavior — fixing Texas Hold'em's omniscient visibility is a game design task, not a framework task.

## Testing

1. **Compilation golden tests**: compile both games, assert observer catalog structure matches expected output
2. **Observer resolution tests**: profile with valid observer compiles; profile with invalid observer name fails; built-in observer names resolve correctly
3. **Defaults tests**: omitted surfaces get system defaults; `_default` + per-variable overrides work correctly
4. **Shorthand expansion tests**: `surfaceName: public` expands to full `{ current: public, preview: { visibility: public, allowWhenHiddenSampling: <default> } }`
5. **Extends tests**: child observer inherits parent's resolved surfaces and can override; extends chain > 1 rejected; missing target rejected; circular extends rejected
6. **Behavioral equivalence tests**: existing `policy-visibility.test.ts` and `policy-eval.test.ts` pass with zero assertion changes (only type name references change)
7. **Reserved key test**: `zones` in observer YAML rejected with clear diagnostic
8. **Built-in name collision test**: user-defined observer named `omniscient` or `default` rejected
9. **Surface validation test**: per-variable override referencing non-existent globalVar rejected
10. **Missing observer section test**: spec without `observability:` compiles (uses built-in defaults)
11. **Cross-game test**: both FITL and Texas Hold'em compile and run with observer-based visibility
12. **Schema artifact test**: GameDef JSON schema includes `observers`
13. **Fingerprint determinism test**: same spec compiles to same observer catalog fingerprint

## Migration Checklist

- [ ] Rename shared visibility types in `types-core.ts` (remove `AgentPolicy` prefix)
- [ ] Update all ~38 consuming files with new type names
- [ ] Add `GameSpecObservabilitySection` to `game-spec-doc.ts`
- [ ] Add `observability` field to `GameSpecDoc`
- [ ] Remove `visibility` from `GameSpecAgentsSection`
- [ ] Add `observer` field to `GameSpecAgentProfileDef`
- [ ] Create `validate-observers.ts`
- [ ] Create `compile-observers.ts`
- [ ] Add `CompiledObserverCatalog` and `CompiledObserverProfile` to `types-core.ts`
- [ ] Add `observers` to `GameDef`
- [ ] Add `observerName` to `CompiledAgentProfile`
- [ ] Wire `lowerObservers()` into `compiler-core.ts` pipeline
- [ ] Update `compile-agents.ts` to consume observer catalog
- [ ] Migrate FITL `92-agents.md`
- [ ] Verify Texas Hold'em compiles unchanged
- [ ] Update GameDef JSON schema
- [ ] Update Zod schemas in `schemas-core.ts`
- [ ] Update all affected tests and fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Implementation Phases

### Phase 1: Type Renames (mechanical, high-touch)
1. Rename types in `types-core.ts`
2. Update all consuming files
3. Regenerate JSON schema
4. Update golden fixtures
5. Run full test suite — zero behavioral changes

### Phase 2: Observer Schema + Compilation
1. Add `GameSpecObservabilitySection` to `game-spec-doc.ts`
2. Add `observability` field to `GameSpecDoc`
3. Create `validate-observers.ts`
4. Create `compile-observers.ts`
5. Add `CompiledObserverCatalog` types to `types-core.ts`
6. Add `observers` to `GameDef`
7. Wire into `compiler-core.ts` pipeline

### Phase 3: Agent-Observer Binding
1. Add `observer` to `GameSpecAgentProfileDef`
2. Add `observerName` to `CompiledAgentProfile`
3. Update `compile-agents.ts` to resolve observer from catalog
4. Remove `visibility` from `GameSpecAgentsSection`
5. Update `validate-agents.ts` to validate observer references

### Phase 4: Game Spec Migration
1. Create FITL observability section
2. Update FITL agent profiles (remove visibility, add observer binding)
3. Verify Texas Hold'em compiles unchanged
4. Update golden fixtures

### Phase 5: Follow-Up Spec
1. Write Spec 106 (zone/token observer integration)

## Outcome

**Completion date**: 2026-04-01

**Implemented via tickets**: 102SHAOBSMOD-001 through 102SHAOBSMOD-008

**Summary of what was built**:
- **Part A (Built-in observers)**: `omniscient` and `default` built-in observers synthesized in `compile-observers.ts`
- **Part B (GameSpecDoc schema)**: `GameSpecObservabilitySection`, `GameSpecObserverProfileDef`, `GameSpecObserverSurfacesDef` types added to `game-spec-doc.ts` with shorthand, full syntax, per-variable override, and `extends` support
- **Part C (Agent-observer binding)**: `observer` field on `GameSpecAgentProfileDef`, `observerName` on `CompiledAgentProfile`, `agents.visibility` removed entirely
- **Part D (Type renames)**: All `AgentPolicy*` surface visibility types renamed to shared names (`SurfaceVisibilityClass`, `CompiledSurfaceVisibility`, `CompiledSurfaceCatalog`, etc.)
- **Part E (Compiled IR)**: `CompiledObserverProfile`, `CompiledObserverCatalog` in `types-core.ts`, `observers` on `GameDef`
- **Part F (Compilation pipeline)**: `validate-observers.ts` + `compile-observers.ts` wired into `compiler-core.ts` before `lowerAgents`; `AgentPolicyCatalog.surfaceVisibility` resolved from observer catalog
- **Part G (Runtime)**: `policy-runtime.ts` unchanged — `input.catalog.surfaceVisibility` path works identically
- **Part H (Zone/token)**: Reserved `zones` key in observer profiles — deferred to Spec 106
- **Part I (Migration)**: FITL migrated to `93-observability.md` with `currentPlayer` observer; Texas Hold'em unchanged

**Deviations from spec**:
- Phases 1-4 were not executed as separate PRs — all tickets (001-008) implemented in a single session on main
- FITL migration (Phase 4/ticket 007) was pulled into ticket 006 per Foundation 14 ("migrate all owned artifacts in the same change")
- `resolveSurfaceVisibilityFromObserverCatalog` uses priority resolution (unanimous profile observer > sole user-defined observer > catalog default) rather than always using the catalog default, to correctly bridge the shared `surfaceVisibility` field with per-profile observer references

**Verification**: 5432 engine tests pass, 0 failures. Build, typecheck, lint all clean.
