# Spec 105: Explicit Preview Contracts

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 102 (shared observer model — preview operates over observer-projected state), Spec 104 (unified considerations — replaces scoreTerms)
**Blocks**: None
**Estimated effort**: 3-5 days

## Problem Statement

The preview system (Spec 93, extended by Spec 98) allows agents to project the outcome of applying a candidate move and score based on the projected state. Spec 98 added `tolerateRngDivergence: boolean` to handle cases where preview moves consume RNG (e.g., shuffles, random draws) and the projected state diverges from what would actually happen.

`tolerateRngDivergence` is a boolean safety valve, not a semantic contract. It conflates several distinct preview scenarios:

1. **Exact preview**: the move is fully deterministic — no RNG consumed, no hidden information revealed, no unresolved decisions. Preview state equals actual state.
2. **Stochastic preview**: the move consumes RNG (e.g., dice roll, card draw). Preview state is one possible outcome, not the definitive one.
3. **Hidden information preview**: the move reveals hidden information that the observer shouldn't see. Preview may leak information.
4. **Unresolved decision preview**: the move contains inner decisions that were resolved by the completion guidance, not by the opponent. Preview assumes a particular opponent response.

The current system marks outcomes as `ready`, `stochastic`, `random`, `hidden`, `unresolved`, or `failed` — but the **profile-level contract** is just a boolean toggle. The agent author cannot declare "I want exact previews only" or "I accept stochastic previews but not hidden-information leaks" — they can only say "tolerate divergence: yes/no."

The external review recommended replacing this with explicit preview mode declarations.

## Goals

- Replace `tolerateRngDivergence: boolean` with a declarative `preview.mode` on agent profiles
- Define explicit preview modes with clear semantics
- Record the preview mode in traces for auditability
- Reserve future modes that fail at compile time until implemented
- Maintain determinism: preview never consumes the authoritative game RNG stream

## Non-Goals

- Implementing `infoSetSample` or `enumeratePublicChance` modes (reserved for future work)
- Changing how preview state is computed internally (the `tryApplyPreview` pipeline remains)
- Adding multi-ply lookahead or search (separate concern)
- Changing the preview outcome type taxonomy (`ready`, `stochastic`, etc. — these stay)

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Preview modes are generic — any game can use any mode. |
| **2. Evolution-First** | Preview mode lives in GameSpecDoc YAML. Evolution can select different modes. |
| **7. Specs Are Data** | Preview mode is a declarative enum, no code. |
| **8. Determinism** | Same profile + same state + same seed = same preview outcomes. Preview uses a derived seed, never the authoritative RNG. Mode selection is static. |
| **9. Replay and Auditability** | Traces record preview mode and outcome classification. |
| **10. Bounded Computation** | Preview is single-ply application of one candidate. Bounded by candidate count. |
| **12. Compiler-Kernel Boundary** | Mode validation at compile time. Runtime enforces mode semantics. |
| **14. No Backwards Compatibility** | `tolerateRngDivergence` removed. All profiles migrated. |

## Design

### Part A: Preview Mode Enum

```typescript
type AgentPreviewMode =
  | 'exactWorld'           // Preview must produce identical result — RNG divergence returns unknown
  | 'tolerateStochastic'   // RNG divergence accepted, outcome marked 'stochastic'
  | 'disabled';            // No preview evaluation — all preview refs return unknown

// Reserved for future implementation:
// | 'infoSetSample'        // Sample from information set consistent with observer
// | 'enumeratePublicChance' // Enumerate public chance outcomes, weight by probability
```

Mode semantics:

| Mode | RNG Divergence | Hidden Info | Unresolved Decisions | Behavior |
|------|---------------|-------------|---------------------|----------|
| `exactWorld` | Returns `unknown` | Returns `unknown` | Returns `unknown` | Strictest — only fully deterministic previews produce values |
| `tolerateStochastic` | Accepts, marks `stochastic` | Returns `unknown` | Accepts, marks `unresolved` | Current behavior when `tolerateRngDivergence: true` |
| `disabled` | N/A | N/A | N/A | All `preview.*` refs evaluate to `unknown` (coalesce fallbacks used) |

### Part B: GameSpecDoc Schema

```yaml
agents:
  profiles:
    us-baseline:
      observer: currentPlayer
      preview:
        mode: tolerateStochastic     # replaces tolerateRngDivergence: true
      params: { ... }
      use: { ... }

    holdem-baseline:
      observer: currentPlayer
      preview:
        mode: disabled               # Texas Hold'em has hidden info — disable preview
      params: { ... }
      use: { ... }
```

- `preview` is an optional object on the profile (defaults to `{ mode: 'exactWorld' }`)
- `preview.mode` is required if `preview` is present
- `tolerateRngDivergence` is removed from the schema
- Reserved modes (`infoSetSample`, `enumeratePublicChance`) produce a compile error with a message explaining they are not yet implemented

### Part C: Compiled IR

```typescript
interface CompiledAgentPreviewConfig {
  readonly mode: AgentPreviewMode;
}

interface CompiledAgentProfile {
  readonly observerName: string;         // from Spec 102
  readonly preview: CompiledAgentPreviewConfig;  // replaces tolerateRngDivergence
  readonly params: Readonly<Record<string, CompiledAgentParameterValue>>;
  readonly use: CompiledAgentProfileUse;
  readonly fingerprint: string;
}
```

### Part D: Runtime Changes

`policy-preview.ts` — `tryApplyPreview()`:

Current logic:
```
if (rngDiverged && !tolerateRngDivergence) → return unknown, reason: 'random'
if (rngDiverged && tolerateRngDivergence)  → return value, outcome: 'stochastic'
```

New logic:
```
switch (profile.preview.mode) {
  case 'disabled':
    → return unknown immediately (skip preview computation entirely)

  case 'exactWorld':
    → if rngDiverged → return unknown, reason: 'random'
    → if hiddenInfoAccessed → return unknown, reason: 'hidden'
    → if unresolvedDecision → return unknown, reason: 'unresolved'
    → return value, outcome: 'ready'

  case 'tolerateStochastic':
    → if rngDiverged → return value, outcome: 'stochastic'
    → if hiddenInfoAccessed → return unknown, reason: 'hidden'
    → if unresolvedDecision → return value, outcome: 'unresolved'
    → return value, outcome: 'ready'
}
```

The `disabled` mode is an optimization: when preview is disabled, the entire preview pipeline is skipped. All `preview.*` refs evaluate to `unknown`, and `coalesce` fallbacks provide default values.

### Part E: Trace Recording

Preview traces already record the outcome type. This spec adds the mode:

```typescript
interface PolicyPreviewTraceEntry {
  readonly mode: AgentPreviewMode;           // NEW — which contract was in effect
  readonly outcome: PolicyPreviewTraceOutcome;  // existing — what actually happened
  readonly reason?: string;                     // existing — why unknown was returned
}
```

This enables post-hoc analysis: "this profile uses `tolerateStochastic`, and 40% of its previews were stochastic" vs. "this profile uses `exactWorld` and 60% of previews returned unknown."

### Part F: Default Mode

If `preview` is omitted from a profile, the default is `{ mode: 'exactWorld' }`. This is the strictest mode and the safest default — no silent tolerance of divergence.

This is a **behavioral change** from the current default (which is `tolerateRngDivergence: false`, equivalent to `exactWorld`). Profiles that currently set `tolerateRngDivergence: true` must be migrated to `mode: tolerateStochastic`.

## Testing

1. **Mode validation test**: reserved modes (`infoSetSample`) fail at compile time with descriptive error
2. **Disabled mode test**: all `preview.*` refs return unknown, preview pipeline is not invoked
3. **exactWorld mode test**: RNG divergence returns unknown; deterministic preview returns value
4. **tolerateStochastic mode test**: RNG divergence returns value with `stochastic` outcome
5. **Trace recording test**: trace entries include `mode` field
6. **Default mode test**: omitted `preview` → `exactWorld` behavior
7. **Behavioral equivalence test**: FITL with `tolerateStochastic` produces same move selections as current `tolerateRngDivergence: true`
8. **Golden tests**: updated compiled GameDef and trace output

## Migration

### FITL

Current:
```yaml
profiles:
  us-baseline:
    preview:
      tolerateRngDivergence: true
```

After:
```yaml
profiles:
  us-baseline:
    observer: currentPlayer
    preview:
      mode: tolerateStochastic
```

### Texas Hold'em

Current: no preview configuration (implicit `tolerateRngDivergence: false`).

After:
```yaml
profiles:
  baseline:
    observer: public
    preview:
      mode: disabled    # hidden information game — preview would leak info
```

## Migration Checklist

- [ ] Add `AgentPreviewMode` type to `types-core.ts`
- [ ] Add `CompiledAgentPreviewConfig` type
- [ ] Remove `tolerateRngDivergence` from profile schema
- [ ] Add `preview.mode` to profile schema in `game-spec-doc.ts`
- [ ] Update `compile-agents.ts` profile lowering: validate mode, reject reserved modes
- [ ] Update `policy-preview.ts`: mode-based evaluation logic
- [ ] Add `disabled` mode fast-path (skip preview pipeline)
- [ ] Update trace types to include `mode`
- [ ] Migrate FITL `92-agents.md`
- [ ] Migrate Texas Hold'em `92-agents.md`
- [ ] Update GameDef JSON schema
- [ ] Update all affected tests and fixtures
- [ ] Run `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
