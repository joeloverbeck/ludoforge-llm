# Spec 55: Legible Action Tooltips

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: XL
**Dependencies**: Spec 39 (React DOM UI layer), Spec 42 (visual config), Spec 52 (choice UI legibility)
**Estimated effort**: 10-15 days
**Ticket prefix**: TOKFILAST

## Overview

Action tooltips currently render raw AST pseudo-code (syntax-highlighted `set`, `forEach`, `moveToken` trees). The goal is rulebook-quality English: "Choose target spaces. Move US Troops from adjacent spaces. Activate underground guerrillas." This requires a semantic intermediate representation (TooltipIR) between the AST and English output, a verbalization block in GameSpecDoc for game-specific labels, a deterministic template realizer, and a progressive-disclosure UI.

### Scope

**In Scope**: Full stack — TooltipIR types, verbalization schema, normalization rules, content planner, template realizer, blocker extractor, static/dynamic split, progressive-disclosure UI. Both FITL and Texas Hold'em.

**Out of Scope**: LLM polish, backwards compatibility constraints, sub-choice tooltips (deferred to future spec).

### Architecture

```
GameSpecDoc YAML (with verbalization: block)
  --> compile --> GameDef JSON (with VerbalizationDef)
  --> runtime describeAction():
      AST --> Normalizer --> TooltipMessage[] (semantic messages)
          --> Content Planner --> ContentPlan (synopsis + steps + modifiers)
          --> Template Realizer --> RuleCard (static English)
          + Blocker Extractor --> RuleState (dynamic availability)
          = ActionTooltipPayload
  --> Runner UI: progressive disclosure tooltip
```

**Static/Dynamic Split**:
- **RuleCard** (cached per GameDef): synopsis, numbered steps, modifier descriptions, raw AST sections for toggle
- **RuleState** (per call): available/blocked, active modifiers, limit usage, current values

### Key Design Decisions

1. **TooltipIR at runtime, not compile-time** — AST is already in GameDef; RuleCard is cached lazily in GameDefRuntime on first access.
2. **Macro-level compression** — when a macro has a verbalization summary, emit one message instead of normalizing all child effects.
3. **Suppression by convention** — `let`/`bindValue`/`concat` for zone construction, `*Count`/`*Tracker`/`__*` telemetry vars, and explicit `suppressPatterns` list are hidden from tooltips.
4. **Minimal blocker extraction** — for unsatisfied `and`, show only failing children; for unsatisfied `or`, show smallest failing alternative.
5. **Raw AST toggle preserved** — existing DisplayNode tree available via collapse toggle for power users.

## Section 0: Constraints

- **Engine-agnostic**: No game-specific logic in normalizer, planner, or realizer. Game-specific labels live in `verbalization:` blocks within GameSpecDoc YAML.
- **Deterministic**: Same GameDef produces the same RuleCard. Template realization is pure — no random variation, no LLM.
- **Bounded output**: 5-15 lines for simple actions, 20-30 for complex actions. Rhetorical budget enforced by content planner.
- **Trace preservation**: Every sentence in a RuleCard retains an `astPath` pointer back to the source AST node.
- **Immutability**: All IR types are `readonly`. Normalization, planning, and realization produce new objects.

## Section 1: Artifacts

### New Types

| Type | Location | Purpose |
|------|----------|---------|
| `TooltipMessage` | `kernel/tooltip-ir.ts` | Semantic message (one per normalized effect) |
| `ContentPlan` | `kernel/tooltip-content-planner.ts` | Grouped messages with synopsis and rhetorical budget |
| `RuleCard` | `kernel/tooltip-rule-card.ts` | Static English output cached per action per GameDef |
| `RuleState` | `kernel/tooltip-rule-card.ts` | Dynamic availability/blocker info per call |
| `ActionTooltipPayload` | `kernel/tooltip-rule-card.ts` | Combined `{ ruleCard, ruleState }` |
| `VerbalizationDef` | `kernel/types-core.ts` | Compiled verbalization data stored in GameDef |

### New Engine Modules

| Module | Estimated Lines | Purpose |
|--------|----------------|---------|
| `kernel/tooltip-ir.ts` | ~100 | Message type definitions (~22 kinds) |
| `kernel/tooltip-normalizer.ts` | ~400 | AST-to-messages normalization rules |
| `kernel/tooltip-suppression.ts` | ~100 | Suppression rules (telemetry, scaffolding) |
| `kernel/tooltip-content-planner.ts` | ~250 | Messages-to-plan grouping and budget |
| `kernel/tooltip-template-realizer.ts` | ~300 | Plan-to-English template registry |
| `kernel/tooltip-rule-card.ts` | ~200 | RuleCard/RuleState/Payload types and builder |
| `kernel/tooltip-blocker-extractor.ts` | ~150 | Minimal blocker extraction from ConditionAST |
| `kernel/tooltip-humanizer.ts` | ~80 | Auto-humanize fallback (camelCase split, etc.) |
| `cnl/compile-verbalization.ts` | ~120 | GameSpecDoc verbalization-to-VerbalizationDef |

### Modified Engine Files

| File | Changes |
|------|---------|
| `cnl/game-spec-doc.ts` | Add `verbalization` field to `GameSpecDoc` |
| `kernel/types-core.ts` | Add `VerbalizationDef` to `GameDef` |
| `kernel/condition-annotator.ts` | `describeAction` returns `ActionTooltipPayload` |
| `kernel/gamedef-runtime.ts` | Add RuleCard cache to `GameDefRuntime` |
| `cnl/compiler-core.ts` | Compile verbalization section |

### New Runner Files

| File | Purpose |
|------|---------|
| `ui/ModifiersSection.tsx` | Collapsible modifier list with active highlighting |
| `ui/AvailabilitySection.tsx` | Available/blocked indicator + limit usage |
| `ui/RawAstToggle.tsx` | Collapsed toggle preserving current DisplayNode rendering |

### Modified Runner Files

| File | Changes |
|------|---------|
| `ui/ActionTooltip.tsx` | Redesign for progressive disclosure layout |
| `ui/useActionTooltip.ts` | Handle `ActionTooltipPayload` from worker |
| `worker/game-worker-api.ts` | Return `ActionTooltipPayload` from `describeAction` |

## Section 2: TooltipIR Type System

~22 semantic message kinds, each extending a common `MessageBase`:

```typescript
interface MessageBase {
  readonly kind: string;
  /** Pointer back to source AST node for trace preservation */
  readonly astPath: string;
  /** If this message was generated from a macro, the macro's id */
  readonly macroOrigin?: string;
  /** Pipeline stage name, if the action uses staged execution */
  readonly stage?: string;
}
```

### Message Kinds

| Kind | Semantic | Key Fields |
|------|----------|------------|
| `select` | Choose spaces/zones | `target: 'spaces' \| 'zones'`, `filter`, `bounds` |
| `place` | Place token from supply | `tokenFilter`, `targetZone` |
| `move` | Move token between zones | `tokenFilter`, `fromZone`, `toZone`, `variant?: 'adjacent'` |
| `pay` | Spend a resource (negative addVar) | `resource`, `amount` |
| `gain` | Receive a resource (positive addVar) | `resource`, `amount` |
| `transfer` | Transfer resource between players | `resource`, `amount`, `from`, `to` |
| `shift` | Shift a marker along its track | `marker`, `direction`, `amount` |
| `activate` | Set token to active/underground | `tokenFilter`, `zone` |
| `deactivate` | Set token to inactive/active | `tokenFilter`, `zone` |
| `remove` | Remove token to supply/casualties | `tokenFilter`, `fromZone`, `destination` |
| `create` | Create a new token | `tokenFilter`, `targetZone` |
| `destroy` | Destroy a token permanently | `tokenFilter`, `fromZone` |
| `reveal` | Reveal hidden information | `target` |
| `draw` | Draw from a deck/zone | `source`, `count` |
| `shuffle` | Shuffle a zone/deck | `target` |
| `set` | Set a variable or marker | `target`, `value` |
| `choose` | Choose from enum options | `options`, `paramName` |
| `roll` | Roll random value | `range`, `bindTo` |
| `modifier` | Conditional modifier (if-branch) | `condition`, `description` |
| `blocker` | Unsatisfied precondition | `reason` |
| `phase` | Phase transition | `fromPhase`, `toPhase` |
| `grant` | Grant free operation to player | `operation`, `targetPlayer` |
| `suppressed` | Internal scaffolding (hidden) | `reason` |

## Section 3: Verbalization Schema

GameSpecDoc gains a top-level `verbalization:` block:

```yaml
verbalization:
  labels:
    # identifier -> display name (string or {singular, plural})
    usTroops: { singular: "US Troop", plural: "US Troops" }
    nvaGuerrillas: { singular: "NVA Guerrilla", plural: "NVA Guerrillas" }
    saigon: "Saigon"
    available-us: "US Available Forces"
    aid: "Aid"
    totalEcon: "Total Econ"

  stages:
    # stage name -> step header text
    selectSpaces: "Select target spaces"
    placeForces: "Place forces"
    activateGuerrillas: "Activate guerrillas"

  macros:
    # macro id -> { class, summary, slots? }
    trainUs:
      class: operation
      summary: "Place US forces and build support"
    sweepUs:
      class: operation
      summary: "Move troops and activate guerrillas"

  sentencePlans:
    # pattern -> template map
    shiftMarker:
      supportOpposition:
        "+1": "Shift 1 level toward Active Support"
        "-1": "Shift 1 level toward Active Opposition"
    addVar:
      aid:
        "+3": "Add 3 Aid"
        "-3": "Remove 3 Aid"

  suppressPatterns:
    # binding name patterns to always suppress
    - "*Count"
    - "*Tracker"
    - "__*"
    - "temp*"
```

### Compiled Form: `VerbalizationDef`

```typescript
interface VerbalizationDef {
  readonly labels: ReadonlyMap<string, string | { singular: string; plural: string }>;
  readonly stages: ReadonlyMap<string, string>;
  readonly macros: ReadonlyMap<string, { class: string; summary: string; slots?: ReadonlyMap<string, string> }>;
  readonly sentencePlans: ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, string>>>;
  readonly suppressPatterns: readonly string[];
}
```

Stored in `GameDef` as an optional `verbalization?: VerbalizationDef` field. Games without a `verbalization:` block fall back entirely to auto-humanization.

## Section 4: Normalization Rules

The normalizer walks the action's `EffectAST` tree and produces `TooltipMessage[]`. Rules are applied in priority order; the first matching rule wins for each AST node.

### Variable Effects (Rules 1-8)

| # | AST Pattern | Message Kind | Logic |
|---|------------|--------------|-------|
| 1 | `addVar` with negative literal | `pay` | Resource = var name, amount = abs(value) |
| 2 | `addVar` with positive literal | `gain` | Resource = var name, amount = value |
| 3 | `transferVar` | `transfer` | From/to from AST, resource = var name |
| 4 | `setVar` where name matches suppress pattern | `suppressed` | Telemetry/tracker variable |
| 5 | `setVar` where name matches `*Count` or `*Tracker` | `suppressed` | Telemetry convention |
| 6 | `setVar` where name starts with `__` | `suppressed` | Internal variable convention |
| 7 | `setVar` generic | `set` | Target = var name, value = expression |
| 8 | `addVar` with non-literal expr | `set` | Fall back to generic set |

### Token Effects (Rules 9-23)

| # | AST Pattern | Message Kind | Logic |
|---|------------|--------------|-------|
| 9 | `moveToken` from `available-*` zone | `place` | Token from supply to target |
| 10 | `moveToken` to `available-*` or `casualties-*` | `remove` | Token to supply/casualties |
| 11 | `moveToken` where source is adjacent to target | `move(adjacent)` | Adjacent movement |
| 12 | `moveToken` generic | `move` | General token movement |
| 13 | `setTokenProp` prop=`activity` value=`active` or `underground` | `activate` | Flip to active state |
| 14 | `setTokenProp` prop=`activity` value=`inactive` | `deactivate` | Flip to inactive state |
| 15 | `setTokenProp` generic | `set` | Generic property change |
| 16 | `createToken` | `create` | New token in zone |
| 17 | `destroyToken` | `destroy` | Permanent removal |
| 18 | `moveToken` from deck-tagged zone | `draw` | Draw from deck |
| 19 | `revealToken` / `revealZone` | `reveal` | Show hidden info |
| 20 | `shuffleZone` | `shuffle` | Randomize zone order |
| 21 | `moveAll` from `available-*` | `place` | Batch place |
| 22 | `moveAll` to `available-*` or `casualties-*` | `remove` | Batch remove |
| 23 | `moveAll` generic | `move` | Batch move |

### Marker Effects (Rules 24-27)

| # | AST Pattern | Message Kind | Logic |
|---|------------|--------------|-------|
| 24 | `shiftMarker` | `shift` | Marker name, direction, amount |
| 25 | `setMarker` | `set` | Marker name, value |
| 26 | `setGlobalMarker` | `set` | Global marker name, value |
| 27 | `flipGlobalMarker` | `set(toggle)` | Toggle boolean marker |

### Control Flow (Rules 28-36)

| # | AST Pattern | Message Kind | Logic |
|---|------------|--------------|-------|
| 28 | `chooseN` over `mapSpaces` | `select(spaces)` | Select from space list with bounds |
| 29 | `chooseN` over tokens | `select(tokens)` | Select from token list with bounds |
| 30 | `chooseOne` over enum options | `choose` | Choose from named alternatives |
| 31 | `forEach` over binding | container | Wrap children with iteration context |
| 32 | `if` on `globalMarkerState` | `modifier` | Conditional modifier description |
| 33 | `if` generic condition | `modifier` | Generic conditional branch |
| 34 | `rollRandom` | `roll` | Random value generation |
| 35 | `removeByPriority` | `remove` | Priority-ordered removal |
| 36 | `repeat` | container | Wrap children with "Repeat N times" |

### Suppression (Rules 37-40)

| # | AST Pattern | Message Kind | Logic |
|---|------------|--------------|-------|
| 37 | `let` / `bindValue` internal | `suppressed` | Zone construction scaffolding |
| 38 | `concat` for zone construction | `suppressed` | Zone list building |
| 39 | Name matches `suppressPatterns` | `suppressed` | Explicit suppress list |
| 40 | Telemetry var (`*Count`, `*Tracker`, `__*`) | `suppressed` | Convention-based suppression |

### Turn Flow (Rules 41-43)

| # | AST Pattern | Message Kind | Logic |
|---|------------|--------------|-------|
| 41 | `grantFreeOperation` | `grant` | Grant free op to player |
| 42 | Phase transition effect | `phase` | From/to phase names |
| 43 | `setNextPlayer` / `advanceTurn` | `suppressed` | Turn machinery (not user-facing) |

### Macro Override

When `macroOrigin` has a verbalization summary in `VerbalizationDef.macros`, emit a single message with the summary text and skip child normalization. This is the highest-priority rule — checked before any of the above.

## Section 5: Content Planner

The content planner transforms `TooltipMessage[]` into a `ContentPlan`:

```typescript
interface ContentPlan {
  /** One-line summary: action label + first select/choose */
  readonly synopsis: string;
  /** Ordered steps, grouped by pipeline stage */
  readonly steps: readonly ContentStep[];
  /** Modifier descriptions extracted from conditional branches */
  readonly modifiers: readonly ContentModifier[];
}

interface ContentStep {
  readonly stepNumber: number;
  readonly header: string;
  readonly lines: readonly string[];
  readonly subSteps?: readonly ContentStep[];
}

interface ContentModifier {
  readonly condition: string;
  readonly description: string;
  readonly active: boolean;
}
```

### Planning Rules

1. **Group by stage**: If the action has pipeline stages, group messages by stage name. Otherwise, treat all messages as a single group.
2. **Synopsis generation**: Combine action label with the first `select` or `choose` message. Example: "Train — Select target spaces (1-6)".
3. **Step numbering**: Each stage becomes a numbered step. Sub-choices within a `forEach` become sub-steps under their parent.
4. **Modifier extraction**: All `modifier` messages are pulled into a separate section, not inline with steps.
5. **Rhetorical budget**: Main step content + one sub-level of detail. If a step has more than 3 sub-steps, collapse the rest with an "and N more..." summary.
6. **Suppression**: All `suppressed` messages are filtered out entirely — they never appear in the plan.
7. **Target line counts**: 5-15 lines for simple actions (1-2 stages), 20-30 for complex actions (3+ stages).

## Section 6: Template Realizer

The template realizer converts a `ContentPlan` into English text stored in a `RuleCard`.

### Template Registry

One template function per message kind. Each takes the message fields and a label-resolution context, returning a string.

Example templates:

| Kind | Template Pattern | Example Output |
|------|-----------------|----------------|
| `select(spaces)` | "Select {bounds} {target}" | "Select 1-6 target spaces" |
| `place` | "Place {count} {token} in {zone}" | "Place 2 US Troops in Saigon" |
| `move(adjacent)` | "Move {token} from adjacent spaces" | "Move US Troops from adjacent spaces" |
| `activate` | "Activate {token} in {zone}" | "Activate underground guerrillas in Saigon" |
| `pay` | "Pay {amount} {resource}" | "Pay 3 Aid" |
| `gain` | "Gain {amount} {resource}" | "Gain 6 ARVN Resources" |
| `shift` | "Shift {marker} {direction}" | "Shift 1 level toward Active Support" |
| `remove` | "Remove {token} from {zone}" | "Remove NVA Troops from Saigon" |
| `grant` | "Grant free {operation} to {player}" | "Grant free Sweep to ARVN" |
| `roll` | "Roll {range}" | "Roll 1-6" |

### Label Resolution Priority

1. **Verbalization `sentencePlans`** — if a matching pattern + key exists, use the pre-authored sentence.
2. **Verbalization `labels`** — resolve identifiers to display names (with singular/plural).
3. **Auto-humanize fallback** — when no verbalization entry exists.

### Auto-Humanizer (`tooltip-humanizer.ts`)

Fallback label generation for identifiers without verbalization entries:

1. camelCase split: `usTroops` → `Us Troops`
2. kebab-case split: `available-us` → `Available Us`
3. `$` strip: `$player` → `Player`
4. Title case normalization
5. Known acronym table: `US`, `ARVN`, `NVA`, `VC`, `NLF` (loaded from verbalization labels)

## Section 7: Blocker Extractor

Extracts minimal blocker descriptions from `ConditionAST` with evaluation results:

### Walk Rules

- **`and`**: Collect only unsatisfied children. Do not list satisfied conditions.
- **`or`**: Show the smallest unsatisfied alternative (fewest sub-conditions).
- **`not`**: Describe the violated positive condition (invert the description).
- **Leaf comparisons**: Format as "Need {left} {op} {right} (currently {value})".

### Output

```typescript
interface BlockerInfo {
  readonly satisfied: boolean;
  readonly blockers: readonly BlockerDetail[];
}

interface BlockerDetail {
  readonly astPath: string;
  readonly description: string;
  /** The current value that fails the check */
  readonly currentValue?: string;
  /** The required value */
  readonly requiredValue?: string;
}
```

Example output for a blocked Train action:
- "Need Aid >= 3 (currently 1)"
- "Need at least 1 US Troop in Available (currently 0)"

## Section 8: Runner UI (Progressive Disclosure)

### Layout Structure

```
┌─────────────────────────────────────┐
│ Train (US)                          │  ← Synopsis (always visible)
│ Select 1-6 target spaces            │
├─────────────────────────────────────┤
│ 1. Select target spaces (1-6)       │  ← Steps (always visible)
│ 2. Place forces from Available      │
│    • Place US Troops (max 6 total)  │
│    • Place Irregulars (max 2/space) │
│ 3. Shift support in selected spaces │
├─────────────────────────────────────┤
│ ▸ Modifiers (1 active)             │  ← Modifiers (collapsed if >2)
│   ✓ Shaded: +1 Troop per space     │
│     Monsoon: No air lift            │
├─────────────────────────────────────┤
│ ● Available (3 remaining this turn) │  ← Availability (always visible)
├─────────────────────────────────────┤
│ ▸ Raw AST                          │  ← Raw AST (collapsed toggle)
└─────────────────────────────────────┘
```

### Component Breakdown

**`ActionTooltip.tsx`** (redesigned):
- Receives `ActionTooltipPayload` from `useActionTooltip` hook.
- Renders synopsis, steps, modifiers section, availability section, raw AST toggle.
- Progressive disclosure: synopsis + steps always visible; modifiers collapsed if >2 (expanded if any active); raw AST always collapsed.

**`ModifiersSection.tsx`** (new):
- Receives `ContentModifier[]` from RuleCard.
- Collapsed by default if >2 modifiers; expanded if any modifier is active.
- Active modifiers highlighted with a checkmark icon.
- Inactive modifiers shown in muted style.

**`AvailabilitySection.tsx`** (new):
- Receives `RuleState` (available/blocked, limit usage, blocker descriptions).
- Shows green dot + "Available" or red dot + "Blocked" with blocker reasons.
- Shows limit usage if applicable: "(3 remaining this turn)".

**`RawAstToggle.tsx`** (new):
- Collapsed toggle that reveals the existing `DisplayNode` rendering.
- Preserves the current syntax-highlighted AST view for power users.
- No changes to `DisplayNode` or `ast-to-display.ts`.

### Hook and Worker Changes

**`useActionTooltip.ts`**:
- Update to request and handle `ActionTooltipPayload` instead of raw `DisplayNode[]`.
- Fallback: if payload is unavailable (e.g., older GameDef without verbalization), fall back to current DisplayNode rendering.

**`worker/game-worker-api.ts`**:
- `describeAction` method returns `ActionTooltipPayload` (which includes both `RuleCard` and `RuleState`).
- RuleCard is cached in `GameDefRuntime` — only `RuleState` is recomputed per call.

## Section 9: Testing

### Unit Tests (~40+ tests)

**Normalization rules**: One test per rule with synthetic AST fixtures.
- Variable effects: `pay`, `gain`, `transfer`, `set`, `suppressed` (rules 1-8)
- Token effects: `place`, `move`, `remove`, `activate`, `deactivate`, `create`, `destroy`, `draw`, `reveal`, `shuffle` (rules 9-23)
- Marker effects: `shift`, `set`, `set(toggle)` (rules 24-27)
- Control flow: `select(spaces)`, `select(tokens)`, `choose`, container wrapping, `modifier`, `roll`, `remove` by priority (rules 28-36)
- Suppression: `let`/`bindValue`, `concat`, suppress patterns, telemetry (rules 37-40)
- Turn flow: `grant`, `phase`, `suppressed` turn machinery (rules 41-43)

**Content planner**: Stage grouping, synopsis generation, modifier extraction, rhetorical budget enforcement, suppression filtering.

**Template realizer**: Each message kind produces expected English. Label resolution priority (sentencePlans > labels > auto-humanize).

**Blocker extractor**: `and` minimal, `or` smallest alternative, `not` inversion, leaf formatting.

**Auto-humanizer**: camelCase, kebab-case, `$` strip, title case, acronym table.

**Verbalization compiler**: GameSpecDoc YAML → VerbalizationDef with labels, stages, macros, sentence plans, suppress patterns.

### Golden Tests

| Game | Action | Expected Output (synopsis) |
|------|--------|---------------------------|
| FITL | Train (US) | "Train — Select 1-6 target spaces" |
| FITL | Sweep (US) | "Sweep — Select target spaces with cubes" |
| FITL | Rally (NVA) | "Rally — Select 1-3 spaces with NVA bases" |
| Texas Hold'em | Raise | "Raise — Choose raise amount" |

Each golden test verifies the full pipeline: AST → normalize → plan → realize → English output.

### Property Tests

- **Determinism**: Same GameDef → same RuleCard (run 100 times, assert identical).
- **Completeness**: Every `TooltipMessage` slot in a RuleCard is either realized to English or explicitly `suppressed`.
- **Trace preservation**: Every sentence in a RuleCard's steps has a non-empty `astPath`.
- **Suppression coverage**: All telemetry/scaffolding variables in both FITL and Texas Hold'em game specs are suppressed (no `*Count`, `*Tracker`, `__*` leak into output).
- **Bounded output**: No RuleCard exceeds 30 lines for any action in either game.

### Vitest Component Tests (Runner)

- `ActionTooltip.tsx`: Renders synopsis, steps, modifiers, availability, raw AST toggle.
- `ModifiersSection.tsx`: Collapsed/expanded states, active highlighting.
- `AvailabilitySection.tsx`: Available/blocked rendering, blocker reasons.
- `RawAstToggle.tsx`: Toggle state, renders DisplayNode content when expanded.

## Section 10: Module Organization

### New Engine Files (~8)

```
packages/engine/src/
  kernel/
    tooltip-ir.ts                  (~100 lines) — Message types
    tooltip-normalizer.ts          (~400 lines) — AST → messages
    tooltip-suppression.ts         (~100 lines) — Suppression rules
    tooltip-content-planner.ts     (~250 lines) — Messages → plan
    tooltip-template-realizer.ts   (~300 lines) — Plan → English
    tooltip-rule-card.ts           (~200 lines) — RuleCard/RuleState/Payload types
    tooltip-blocker-extractor.ts   (~150 lines) — Minimal blockers
    tooltip-humanizer.ts           (~80 lines)  — Auto-humanize fallback
  cnl/
    compile-verbalization.ts       (~120 lines) — Spec → VerbalizationDef
```

### Modified Engine Files (~5)

```
packages/engine/src/
  cnl/game-spec-doc.ts             — Add verbalization field to GameSpecDoc
  cnl/compiler-core.ts             — Compile verbalization section
  kernel/types-core.ts             — Add VerbalizationDef to GameDef
  kernel/condition-annotator.ts    — describeAction returns ActionTooltipPayload
  kernel/gamedef-runtime.ts        — RuleCard cache
```

### New Runner Files (~3)

```
packages/runner/src/
  ui/ModifiersSection.tsx          — Collapsible modifier list
  ui/AvailabilitySection.tsx       — Available/blocked indicator
  ui/RawAstToggle.tsx              — Collapsed AST toggle
```

### Modified Runner Files (~3)

```
packages/runner/src/
  ui/ActionTooltip.tsx             — Redesign for progressive disclosure
  ui/useActionTooltip.ts           — Handle ActionTooltipPayload
  worker/game-worker-api.ts        — Return ActionTooltipPayload
```

### Game Data Files (~2)

```
data/games/fire-in-the-lake/*.md   — Add verbalization: block
data/games/texas-holdem/*.md       — Add verbalization: block
```

## Section 11: Ticket Breakdown

### Phase 1: Foundation (2 tickets)

**TOKFILAST-001: TooltipIR types + VerbalizationDef types + GameSpecDoc schema changes**
- Define `TooltipMessage` types (all 22 kinds) in `kernel/tooltip-ir.ts`
- Define `VerbalizationDef` type in `kernel/types-core.ts`
- Add `verbalization?: VerbalizationDef` field to `GameDef`
- Add `verbalization` field to `GameSpecDoc` interface
- Define `RuleCard`, `RuleState`, `ActionTooltipPayload` types in `kernel/tooltip-rule-card.ts`
- Unit tests for type construction and readonly enforcement

**TOKFILAST-002: Verbalization compiler + wire into compiler-core**
- Implement `compile-verbalization.ts`: parse `verbalization:` YAML block into `VerbalizationDef`
- Wire into `compiler-core.ts` so GameDef output includes compiled verbalization
- Author initial verbalization blocks for both FITL and Texas Hold'em game specs
- Unit tests: YAML → VerbalizationDef round-trip, missing verbalization = undefined

### Phase 2: Normalizer (3 tickets)

**TOKFILAST-003: Auto-humanizer + suppression rules**
- Implement `tooltip-humanizer.ts`: camelCase split, kebab split, `$` strip, title case, acronym table
- Implement `tooltip-suppression.ts`: pattern matching against `suppressPatterns`, telemetry conventions
- Unit tests for each humanizer transformation and suppression rule

**TOKFILAST-004: Core normalizer — variable, token, marker effect rules (1-27)**
- Implement `tooltip-normalizer.ts` with rules 1-27 (variable, token, marker effects)
- Each rule maps AST node pattern to `TooltipMessage`
- Unit tests: one per rule with synthetic AST fixture

**TOKFILAST-005: Compound normalizer — control flow, macros, pipeline stages (28-43)**
- Extend `tooltip-normalizer.ts` with rules 28-43 (control flow, suppression, turn flow)
- Implement macro override: when `macroOrigin` has verbalization summary, emit single message
- Implement `forEach`/`repeat` container wrapping
- Unit tests: compound structures, macro compression, stage tagging

### Phase 3: Planner + Realizer (2 tickets)

**TOKFILAST-006: Content planner**
- Implement `tooltip-content-planner.ts`: stage grouping, synopsis generation, modifier extraction, rhetorical budget
- Suppression filtering (remove all `suppressed` messages)
- Sub-step collapse when >3 sub-steps
- Unit tests: grouping, budget enforcement, synopsis format

**TOKFILAST-007: Template realizer + blocker extractor + golden tests**
- Implement `tooltip-template-realizer.ts`: template registry with one function per message kind
- Implement label resolution: sentencePlans → labels → auto-humanize
- Implement `tooltip-blocker-extractor.ts`: `and`/`or`/`not`/leaf walk rules
- Golden tests: FITL Train(US), Sweep(US), Rally(NVA), Texas Hold'em Raise

### Phase 4: Integration (2 tickets)

**TOKFILAST-008: Engine integration — describeAction returns ActionTooltipPayload, RuleCard caching**
- Modify `condition-annotator.ts`: `describeAction()` builds `ActionTooltipPayload`
- Add RuleCard cache to `GameDefRuntime` (lazy, keyed by action id)
- `RuleState` recomputed per call (availability, active modifiers, limit usage)
- Update `kernel/index.ts` exports
- Integration tests: full pipeline from GameDef → ActionTooltipPayload

**TOKFILAST-009: Runner UI — progressive disclosure tooltip, new sub-components**
- Redesign `ActionTooltip.tsx` for progressive disclosure layout
- Implement `ModifiersSection.tsx`, `AvailabilitySection.tsx`, `RawAstToggle.tsx`
- Update `useActionTooltip.ts` to handle `ActionTooltipPayload` with DisplayNode fallback
- Update `game-worker-api.ts` to return `ActionTooltipPayload`
- Vitest component tests for all new/modified components

### Phase 5: Game Verbalization (2 tickets)

**TOKFILAST-010: FITL verbalization authoring**
- Author complete FITL verbalization block: all faction labels, zone labels, token types, marker names
- Stage descriptions for all operations and special activities
- Macro summaries for all compiled macros
- Sentence plans for common patterns (shift support/opposition, aid changes, etc.)
- Suppress patterns for FITL telemetry variables
- Golden test validation: all FITL actions produce readable English

**TOKFILAST-011: Texas Hold'em verbalization + cross-game validation**
- Author complete Texas Hold'em verbalization block: player labels, card types, pot/chips
- Sentence plans for betting actions (raise, call, fold, check)
- Suppress patterns for Hold'em internal variables
- Cross-game golden tests: verify both games produce readable English
- Property tests: determinism, completeness, trace preservation, suppression coverage, bounded output

## Verification

- `pnpm turbo build` passes
- `pnpm turbo test` passes (engine + runner)
- `pnpm turbo typecheck` passes
- Golden tests produce expected English for FITL Train/Sweep/Rally and Hold'em Raise
- Manual visual check: run `pnpm -F @ludoforge/runner dev`, hover actions, verify readable tooltips with progressive disclosure

## Outcome

- **Completion date**: 2026-03-08
- **What changed**: All 12 tickets (LEGACTTOO-001 through 012) implemented. Complete tooltip pipeline: EffectAST normalization, content planning with progressive disclosure, template realization with label resolution, macro overrides via verbalization, blocker extraction, suppression of scaffolding effects, and modifier humanization.
- **Deviations from original plan**: None significant.
- **Verification**: All engine tests pass. Typecheck clean.
