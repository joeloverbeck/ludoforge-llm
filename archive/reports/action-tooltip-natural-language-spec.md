**Status**: COMPLETED

# Technical Report: Automatic Natural-Language Generation for Action Tooltips

## 1. Problem Statement

LudoForge-LLM has a browser-based game runner that displays **action tooltips** when users hover over action buttons (Train, Patrol, Sweep, Rally, March, Attack, Terror, Assault, Bombard, Subvert, etc.). Currently, these tooltips render the **raw AST structure** of actions -- preconditions, effects, costs, and limits -- as a syntax-highlighted tree of keywords, operators, references, and values. While technically accurate and annotated with live game-state evaluation (pass/fail markers), the output reads like source code, not like game rules.

**Goal**: Design an automatic pipeline that translates action definitions from GameSpecDoc YAML (and their compiled AST representations) into legible English sentences that read like entries in a board game rulebook, suitable for display as action tooltips in the UI.

---

## 2. Current Architecture

### 2.1 Data Flow: GameSpecDoc YAML to Tooltip

```
GameSpecDoc (Markdown+YAML)
  --> parseGameSpec --> validateGameSpec --> expandMacros --> compileGameSpecToGameDef
  --> GameDef JSON (contains ActionDef[] and ActionPipelineDef[])
  --> Kernel: describeAction(actionDef, context) --> AnnotatedActionDescription
  --> Runner: useActionTooltip hook --> ActionTooltip React component
```

### 2.2 ActionDef Type (engine: `packages/engine/src/kernel/types-core.ts:154-165`)

```typescript
interface ActionDef {
  readonly id: ActionId;
  readonly actor: PlayerSel;          // Who can perform it
  readonly executor: ActionExecutorSel;
  readonly phase: readonly PhaseId[];  // Valid game phases
  readonly capabilities?: readonly string[];
  readonly params: readonly ParamDef[]; // Player choices with domains
  readonly pre: ConditionAST | null;    // Preconditions
  readonly cost: readonly EffectAST[];  // Resource costs
  readonly effects: readonly EffectAST[]; // Main effects
  readonly limits: readonly LimitDef[];   // Usage limits
}
```

**Crucially: there is NO description, tooltip, or displayName field.** Actions are defined purely by their mechanical structure.

### 2.3 ActionPipelineDef (engine: `packages/engine/src/kernel/types-operations.ts`)

For FITL (Fire in the Lake), actions use an **action pipeline** system with per-faction profiles. Each pipeline has:

```typescript
interface ActionPipelineDef {
  readonly id: string;           // e.g., "train-us-profile"
  readonly actionId: string;     // e.g., "train"
  readonly applicability?: ConditionAST;  // Which player/situation
  readonly legality: ConditionAST | null;
  readonly costValidation: ConditionAST | null;
  readonly costEffects: readonly EffectAST[];
  readonly targeting: {};
  readonly stages: readonly PipelineStage[];
  readonly atomicity: 'atomic' | 'interruptible';
}

interface PipelineStage {
  readonly stage?: string;  // e.g., "select-spaces", "resolve-per-space"
  readonly effects: readonly EffectAST[];
}
```

### 2.4 Current Display System (engine: `packages/engine/src/kernel/ast-to-display.ts`)

The current system converts AST nodes into a tree of `DisplayNode` objects:

- `DisplayGroupNode` -- labeled sections (Parameters, Preconditions, Costs, Effects, Limits)
- `DisplayLineNode` -- indented lines of inline tokens
- `DisplayInlineNode` -- semantic tokens:
  - `keyword` ("set", "move", "forEach", "if", "choose")
  - `operator` ("=", "==", ">=", "+", "*")
  - `value` (numbers, strings, booleans)
  - `reference` (variable names, zone IDs, player refs)
  - `punctuation` (commas, dots, brackets)
  - `annotation` (pass/fail/value from live evaluation)

**Example current output** for a setVar effect:
```
set actor.handActive = false
```

**Example current output** for a forEach with moveToken:
```
forEach $troop in tokens adjacent to $space
  move $troop from zoneOf($troop) to $space
```

These are essentially pseudo-code renderings, not natural English.

### 2.5 Live Annotation System (engine: `packages/engine/src/kernel/condition-annotator.ts`)

The annotator walks the display tree in lockstep with the AST and appends:
- Pass/fail markers on conditions (checkmark or X)
- Current values for comparison operands (e.g., "current: 5")
- Limit usage counters (e.g., "2/3")

This annotation is **state-aware** and must be preserved or enhanced in any natural language system.

### 2.6 Runner Tooltip Components (runner: `packages/runner/src/ui/`)

- `useActionTooltip.ts` -- hook that calls `bridge.describeAction(actionId)` on hover (200ms debounce)
- `ActionTooltip.tsx` -- renders `AnnotatedActionDescription` as React elements
- Uses Floating UI for positioning

---

## 3. The AST Node Types That Need Translation

### 3.1 EffectAST Variants (26 total, from `packages/engine/src/kernel/types-ast.ts:249-511`)

Each effect type needs a natural-language template:

| Effect | Current Display | Desired Natural Language |
|--------|----------------|------------------------|
| `setVar` | `set actor.handActive = false` | "Set the active player's handActive to false" |
| `addVar` | `add -3 to arvnResources` | "Reduce ARVN Resources by 3" |
| `transferVar` | `transfer 1 from patronage to arvnResources` | "Transfer 1 point from Patronage to ARVN Resources" |
| `moveToken` | `move $troop from zoneOf($troop) to $space` | "Move the selected troop to the target space" |
| `moveAll` | `moveAll from hand:player0 to muck:none` | "Move all cards from your hand to the muck" |
| `moveTokenAdjacent` | `moveAdjacent $token from $zone` | "Move the token to an adjacent zone" |
| `draw` | `draw 2 from deck:none to hand:player0` | "Draw 2 cards from the deck" |
| `reveal` | `reveal zone` | "Reveal all pieces in the zone" |
| `conceal` | `conceal zone` | "Conceal pieces in the zone" |
| `shuffle` | `shuffle deck:none` | "Shuffle the deck" |
| `createToken` | `create guerrilla in $space` | "Place a guerrilla in the selected space" |
| `destroyToken` | `destroy $token` | "Remove the piece from the game" |
| `setTokenProp` | `set $g.activity = underground` | "Flip the guerrilla to underground" |
| `if` | `if condition` / `then` / `else` | "If [condition], then [effects]; otherwise [effects]" |
| `forEach` | `forEach $space in binding` | "For each selected space: [effects]" |
| `reduce` | `reduce $item in source acc $a = 0` | "Accumulate across [source]: [computation]" |
| `removeByPriority` | `removeByPriority budget N` | "Remove up to N pieces, prioritizing [groups]" |
| `let` | `let $x = value` | "Compute [description]: [effects]" |
| `bindValue` | `bind $x = value` | (internal, may be hidden or labeled) |
| `evaluateSubset` | `evaluateSubset from source` | "Evaluate possible subsets of [source]" |
| `chooseOne` | `choose $x from options` | "Choose one of: [options]" |
| `chooseN` | `chooseN $x from options` | "Choose [min]-[max] of: [options]" |
| `rollRandom` | `roll $x in 1..6` | "Roll randomly between 1 and 6" |
| `setMarker` | `setMarker $space.support = neutral` | "Set the space's support marker to Neutral" |
| `shiftMarker` | `shiftMarker $space.support by 1` | "Shift support 1 level toward Active Support" |
| `setGlobalMarker` | `setGlobalMarker trail = 3` | "Set the Trail marker to 3" |
| `shiftGlobalMarker` | `shiftGlobalMarker trail by 1` | "Increase the Trail by 1" |
| `flipGlobalMarker` | `flipGlobalMarker cap between A / B` | "Flip the capability between its two states" |
| `grantFreeOperation` | `grantFreeOp player specialActivity` | "Grant the player a free Special Activity" |
| `gotoPhaseExact` | `goto phase` | "Advance to the [phase] phase" |
| `advancePhase` | `advancePhase` | "Proceed to the next phase" |
| `pushInterruptPhase` | `pushInterrupt phase` | "Interrupt: switch to [phase]" |
| `popInterruptPhase` | `popInterrupt` | "Resume after interrupt" |

### 3.2 ConditionAST Variants (from `types-ast.ts:107-131`)

| Condition | Current Display | Desired Natural Language |
|-----------|----------------|------------------------|
| `boolean` | `true` / `false` | "Always" / "Never" |
| `and` | `and(cond1, cond2)` | "[cond1] and [cond2]" |
| `or` | `or(cond1, cond2)` | "[cond1] or [cond2]" |
| `not` | `not(cond)` | "Unless [cond]" |
| `==` | `activePlayer == 0` | "The active player is US" |
| `!=` | `zone.country != 'northVietnam'` | "The space is not in North Vietnam" |
| `<`, `<=`, `>`, `>=` | `arvnResources >= 3` | "ARVN has at least 3 Resources" |
| `in` | `item in set` | "[item] is among [set]" |
| `adjacent` | `zone1 adjacent zone2` | "[zone1] is adjacent to [zone2]" |
| `connected` | `from connected to` | "[from] is connected to [to]" |
| `zonePropIncludes` | `zone.prop includes value` | "The zone's [prop] includes [value]" |

### 3.3 ValueExpr Variants (from `types-ast.ts:44-75`)

| Expression | Current Display | Desired Natural Language |
|------------|----------------|------------------------|
| number literal | `3` | "3" |
| string literal | `"city"` | "city" |
| boolean literal | `true` | "yes" |
| `ref: gvar` | `arvnResources` | "ARVN Resources" |
| `ref: pvar` | `actor.handActive` | "the actor's handActive" |
| `ref: zoneVar` | `$space.terrorCount` | "the space's Terror count" |
| `ref: zoneCount` | `count($zone)` | "the number of pieces in the zone" |
| `ref: tokenProp` | `$troop.faction` | "the troop's faction" |
| `ref: markerState` | `$space.supportOpposition` | "the space's Support/Opposition level" |
| `ref: globalMarkerState` | `cap_cords` marker state | "the CORDS capability state" |
| `ref: activePlayer` | `activePlayer` | "the active player" |
| `ref: binding` | `$targetSpaces` | "the selected target spaces" |
| arithmetic ops | `trail + nvaBaseCount` | "Trail plus the NVA base count" |
| aggregate count | `count(tokensInZone filter...)` | "the number of US pieces in the space" |
| aggregate sum/min/max | `sum(...)` | "the total of [expression] across [collection]" |
| concat | `concat('hand:', activePlayer)` | (zone construction, may be hidden) |
| conditional | `if(when, then, else)` | "if [when] then [then], otherwise [else]" |

### 3.4 OptionsQuery Variants (from `types-ast.ts:153-212`)

| Query | Current Display | Desired Natural Language |
|-------|----------------|------------------------|
| `tokensInZone` | `tokens in $space` | "pieces in the selected space" |
| `tokensInAdjacentZones` | `tokens adjacent to $space` | "pieces in spaces adjacent to the target" |
| `mapSpaces` (with filter) | `mapSpaces` | "map spaces where [filter conditions]" |
| `enums` | `enum('place-guerrilla', 'replace-with-base')` | "place a guerrilla or replace with a base" |
| `intsInRange` | `ints 1..6` | "a number from 1 to 6" |
| `adjacentZones` | `adjacent to $zone` | "zones adjacent to the target" |
| `binding` | `$targetSpaces` | "the previously selected spaces" |
| `players` | `players` | "any player" |

### 3.5 TokenFilterExpr (from `types-ast.ts:133-143`)

Filters on token collections that need translation:

```yaml
filter:
  op: and
  args:
    - { prop: faction, eq: 'US' }
    - { prop: type, eq: troops }
```

Should become: "US Troops"

```yaml
filter:
  op: and
  args:
    - { prop: faction, eq: 'NVA' }
    - { prop: type, eq: guerrilla }
    - { prop: activity, eq: active }
```

Should become: "active NVA guerrillas"

---

## 4. Concrete GameSpecDoc YAML Examples

### 4.1 US Sweep Action (from `data/games/fire-in-the-lake/30-rules-actions.md:2091-2205`)

The US Sweep pipeline profile has these stages:

1. **select-spaces**: Choose provinces/cities not in North Vietnam. Limited Op: 1 space; Full Op: unlimited (or 2 if CAPS capability shaded).
2. **move-troops**: For each target space, choose US Troops from adjacent zones to move into the space; also handle LoC hops via macro.
3. **activate-guerrillas**: For each target space, activate underground guerrillas (flip to active) based on cube-to-guerrilla ratio.
4. **cap-cobras-bonus-removal**: If Cobras capability unshaded, remove extra guerrillas.
5. **cap-booby-traps-troop-cost**: If Booby Traps capability shaded, lose US troops.

**Desired natural-language tooltip** (what a player would want to read):

> **Sweep** (US)
>
> **Where**: Provinces or Cities not in North Vietnam. Limited Op: 1 space.
>
> **Steps**:
> 1. Select target spaces.
> 2. Move US Troops from adjacent spaces into each target space. Troops may also move along Lines of Communication.
> 3. In each target space, activate 1 Underground guerrilla per 2 Troop cubes (Irregulars count as 2).
> 4. *Cobras (unshaded)*: Remove 1 additional Active guerrilla per space.
> 5. *Booby Traps (shaded)*: Lose 1 US Troop per space with 2+ guerrillas.

### 4.2 NVA Rally Action (from `30-rules-actions.md:2622-2772`)

Stages:
1. **select-spaces**: Via macro, choose spaces with NVA control or presence.
2. **resolve-per-space**: Cost 1 NVA Resource per space. If no NVA base: place 1 guerrilla or (if 2+ guerrillas and <2 bases) replace 2 guerrillas with a base. If NVA base present: place guerrillas up to (Trail + base count).
3. **trail-improvement**: Optionally spend 2 NVA Resources to increase Trail by 1 (if Trail < 4 and McNamara Line not active). AAA capability affects space selection; shaded SA-2s increases the Trail gain by 2 boxes instead of 1.

**Desired natural-language tooltip**:

> **Rally** (NVA)
>
> **Cost**: 1 NVA Resource per space.
>
> **Steps**:
> 1. Select spaces (provinces/cities with NVA base or at least 1 NVA piece).
> 2. In each space:
>    - **Without base**: Place 1 NVA guerrilla; or replace 2 guerrillas with an NVA base (if 2+ guerrillas and fewer than 2 bases in space).
>    - **With base**: Place guerrillas up to Trail + NVA base count in the space.
> 3. **Trail Improvement** (optional): Spend 2 NVA Resources to increase Trail by 1 (max 4). AAA (unshaded) limits to 1 Laos/Cambodia space; SA-2s (shaded) makes that improvement 2 boxes instead of 1.

### 4.3 US Train Action (from `30-rules-actions.md:1232-1497`)

This is the most complex action profile in the game. Stages:

1. **select-spaces**: Provinces/Cities with US pieces. LimOp: 1 space; Full Op: unlimited.
2. **resolve-per-space**: For each space, choose between:
   - Place up to 2 US Irregulars (from Available or map)
   - If US Base in space: place up to 2 Rangers, or (with ARVN Resources cost) place up to 6 ARVN cubes (mix of Troops/Police)
3. **cap-caps-bonus-police**: CAPS capability (unshaded) bonus police placement.
4. **sub-action**: Pacification or Saigon patronage transfer. Pacify costs 3 ARVN Resources per level shifted toward Active Support (4 with Ky leader). Saigon transfer moves Patronage to ARVN Resources.

---

## 5. Design Challenges for Automatic Translation

### 5.1 The Engine-Agnosticism Constraint

The engine is **game-agnostic**: it has no knowledge of what "US", "NVA", "guerrilla", "Sweep", or "Province" mean. Variable names like `arvnResources`, zone categories like `'city'`, token types like `guerrilla`, and marker names like `supportOpposition` are opaque strings to the kernel.

**Implication**: A translation system must work from the AST structure alone, not from hardcoded game-specific knowledge. The system should produce reasonable English for *any* game, not just FITL.

### 5.2 Macro Expansion Opacity

Many effects are expanded from macros (e.g., `macro: place-from-available-or-map`, `macro: sweep-loc-hop`, `macro: sweep-activation`). After compilation, the macro origin is tracked via `EffectMacroOrigin` (which records `macroId` and `stem`), but the expanded effects are verbose composite ASTs. The macro name is often more meaningful than the expansion.

**Implication**: The translation system should leverage `macroOrigin` information to produce concise summaries like "Place from available or map" rather than expanding every nested forEach/moveToken/if chain.

### 5.3 Deeply Nested Control Flow

FITL actions can have 5-6 levels of nesting: `if > forEach > if > let > if > shiftMarker`. A literal translation of every branch produces unreadable walls of text.

**Implication**: The system needs a **summarization strategy** -- possibly depth-limited expansion, or hierarchical collapsing, or stage-level summaries that skip internal branching details.

### 5.4 Context-Dependent Display Names

- `activePlayer` should display as the faction name, not "player 0"
- `$space` should display as "the selected space", not a binding variable name
- `arvnResources` should display as "ARVN Resources", not a camelCase variable name
- Token filter `{ prop: faction, eq: 'US' }, { prop: type, eq: troops }` should display as "US Troops"
- Zone category comparisons like `zone.category == 'province'` should read "the space is a Province"

**Implication**: The system needs naming conventions/heuristics to convert identifiers to display names (camelCase splitting, known abbreviation expansion, token filter composition).

### 5.5 Pipeline Stages as Narrative

Action pipelines have named stages (select-spaces, resolve-per-space, trail-improvement, etc.). These stages form a natural narrative sequence that could serve as the skeleton of the tooltip text.

**Implication**: Stage names can be converted to human-readable step headers; effects within each stage summarized beneath them.

### 5.6 Capability/Leader Conditional Branches

Many FITL actions have conditional branches gated by global markers (capabilities, leaders). These appear as `if globalMarkerState.cap_xxx == shaded/unshaded`. Players need to understand both the default behavior and the capability modifications.

**Implication**: Capability-gated branches should be rendered as clearly labeled sidebars or footnotes, not inline in the main rule flow.

### 5.7 Live State Annotations

The current system annotates conditions with pass/fail based on current game state. Natural-language tooltips should preserve this: "ARVN has at least 3 Resources [current: 5, PASS]" or visually highlight which conditions are currently met.

---

## 6. Proposed Translation Architecture

### 6.1 Two-Layer Approach

**Layer 1: AST-to-English Template Engine** (deterministic, implemented in TypeScript)

A function `effectToEnglish(effect: EffectAST, context: TranslationContext): string` that pattern-matches on each AST variant and produces English text using templates. This is analogous to the existing `effectToDisplayNodes` but produces strings instead of display trees.

Key features:
- Template per EffectAST/ConditionAST/ValueExpr variant
- Recursive handling of nested structures
- Depth-aware: summarize at depth > N instead of expanding
- `macroOrigin` awareness: use macro name as summary when available
- Identifier humanization: `camelCaseVar` -> "Camel Case Var", strip `$` from bindings
- Token filter composition: `{faction: US, type: troops}` -> "US Troops"

**Layer 2: LLM Post-Processing** (optional, for polishing)

Feed the template-generated text to an LLM with the prompt: "Rewrite this game rule description to read like a board game rulebook entry. Preserve all mechanical detail but use natural language. Keep it concise."

This layer handles:
- Awkward phrasings from template limitations
- Contextual word choice (e.g., "place" vs "deploy" vs "move" depending on context)
- Sentence combining and flow improvement
- Consistent tone matching the source game's rulebook

### 6.2 TranslationContext

```typescript
interface TranslationContext {
  readonly playerNames: ReadonlyMap<number, string>;  // 0->"US", 1->"ARVN", etc.
  readonly maxDepth: number;           // Summary threshold
  readonly currentDepth: number;
  readonly knownVariableLabels: ReadonlyMap<string, string>; // "arvnResources" -> "ARVN Resources"
  readonly knownTokenTypes: ReadonlyMap<string, string>;     // "guerrilla" -> "Guerrilla"
  readonly knownZoneCategories: ReadonlyMap<string, string>; // "province" -> "Province"
  readonly knownMarkerLabels: ReadonlyMap<string, string>;   // "supportOpposition" -> "Support/Opposition"
  readonly stageLabel?: string;        // Current pipeline stage name
}
```

This context can be populated from the GameDef (player names from `players[]`, variable labels from `variables[]`, token types from `tokenTypes[]`, zone categories from `zones[]`).

### 6.3 Processing Pipeline

```
ActionPipelineDef
  --> For each stage:
      1. Stage name -> human-readable header (camelCase split, dash-to-space)
      2. For each top-level effect in stage.effects:
         a. Check macroOrigin -- if present, use macro-level summary
         b. Else, apply effectToEnglish(effect, context)
         c. If depth > maxDepth, produce "[complex resolution logic]" summary
      3. Collect capability-gated branches separately
  --> Assemble: header + steps + capability footnotes + cost summary
  --> Optionally: LLM polish pass
```

---

## 7. Translation Templates (Specification)

### 7.1 Effect Templates

```
setVar:
  - "Set [target] to [value]"
  - Special case: if value is boolean, "Enable/Disable [target]"
  - Special case: if delta-like pattern (value = ref + delta), "Increase/Decrease [target] by [amount]"

addVar:
  - If delta > 0: "Add [delta] to [target]"
  - If delta < 0: "Reduce [target] by [abs(delta)]"
  - If delta is expression: "Adjust [target] by [expression]"

transferVar:
  - "Transfer [amount] from [source] to [destination]"

moveToken:
  - "Move [token description] from [source] to [destination]"
  - Token description derived from bindings/filters when available

moveAll:
  - "Move all pieces from [source] to [destination]"
  - If filter present: "Move all [filtered pieces] from [source] to [destination]"

createToken:
  - "Place a [type] in [zone]"

destroyToken:
  - "Remove [token] from the game"

setTokenProp:
  - "Set [token]'s [prop] to [value]"
  - Special case: activity underground/active -> "Flip [token] to Underground/Active"

if:
  - "If [condition]: [then-effects]"
  - If else present: "If [condition]: [then-effects]. Otherwise: [else-effects]"
  - Depth-aware: at deep nesting, collapse to "[conditional resolution]"

forEach:
  - "For each [binding] in [collection]: [effects]"
  - If macroOrigin: use macro description

chooseOne:
  - "Choose one of: [options listed]"
  - For enums: list the enum values

chooseN:
  - "Choose [min] to [max] of: [options described]"

shiftMarker:
  - "Shift [space]'s [marker] by [delta] level(s)"
  - Context-aware: "Shift toward Active Support/Opposition" when marker is known

setMarker:
  - "Set [space]'s [marker] to [state]"

shiftGlobalMarker:
  - "Adjust [marker] by [delta]"

grantFreeOperation:
  - "Grant [player] a free [operation class]"

rollRandom:
  - "Roll randomly between [min] and [max]"
```

### 7.2 Condition Templates

```
==:
  - "[left] is [right]"
  - If comparing to player ID: "[entity] is [player name]"
  - If comparing string prop: "[entity] is a [value]" (e.g., "the space is a Province")

!=:
  - "[left] is not [right]"

<, <=, >, >=:
  - "[left] is at least [right]" (for >=)
  - "[left] is less than [right]" (for <)
  - "[left] is at most [right]" (for <=)
  - "[left] is more than [right]" (for >)

and:
  - "[cond1], and [cond2]"
  - For 3+: "[cond1], [cond2], and [condN]"

or:
  - "[cond1] or [cond2]"

not:
  - "It is not the case that [cond]"
  - Simplified: "Unless [cond]"

adjacent:
  - "[zone1] is adjacent to [zone2]"

connected:
  - "[from] is connected to [to]"
```

### 7.3 Value Expression Templates

```
number: rendered as-is
string: rendered without quotes, with capitalization
boolean: "yes"/"no"
ref gvar: humanize variable name (camelCase split)
ref pvar: "[player]'s [variable]"
ref zoneVar: "the [zone]'s [variable]"
ref zoneCount: "the number of pieces in [zone]"
ref tokenProp: "the [token]'s [property]"
ref markerState: "the [space]'s [marker] state"
ref globalMarkerState: "the [marker] state"
ref activePlayer: "the active player"
ref binding: "the selected [humanized-name]" or just "[humanized-name]"
arithmetic: "[left] plus/minus/times [right]"
aggregate count: "the number of [filter-description] in [zone]"
aggregate sum: "the total [expression] across [collection]"
concat: (usually internal zone construction -- hide or simplify)
conditional value: "if [when] then [then], otherwise [else]"
```

### 7.4 Token Filter Composition

Given a `TokenFilterExpr` like:
```yaml
op: and
args:
  - { prop: faction, eq: 'US' }
  - { prop: type, eq: troops }
```

The translation should compose it as: **"US Troops"** (adjective form of faction + type).

Rules:
1. If `faction` filter is present, prepend faction name.
2. If `type` filter is present, use type name (capitalized).
3. If `activity` filter is present, prepend "Active" or "Underground".
4. Combine: "[activity] [faction] [type]" -> "Active NVA Guerrillas", "US Troops", "Underground VC Guerrillas".
5. Negation: `neq` -> "non-[value]", `notIn` -> "not [values]".

### 7.5 Identifier Humanization Rules

1. Strip leading `$` from binding names.
2. Split camelCase: `arvnResources` -> `arvn Resources` -> "ARVN Resources" (recognize known acronyms: US, NVA, VC, ARVN, COIN).
3. Split kebab-case: `place-guerrilla` -> "Place Guerrilla".
4. Known abbreviation table (populated from GameDef metadata):
   - `cap_cords` -> "CORDS Capability"
   - `cap_caps` -> "CAPS Capability"
   - `supportOpposition` -> "Support/Opposition"
   - `terrorCount` -> "Terror marker count"
   - `trail` -> "the Trail"
5. Pipeline stage names: `select-spaces` -> "Select Spaces", `resolve-per-space` -> "Resolve Per Space".

---

## 8. Macro-Level Summarization

When an effect has a `macroOrigin`, the system should prefer a macro-level summary over expanding the full effect tree. A mapping from macro IDs to summaries can be:

1. **Auto-generated**: Split macro ID (`place-from-available-or-map` -> "Place from Available or Map")
2. **Explicitly configured** in a `macroDescriptions` section of the GameSpecDoc:
   ```yaml
   macroDescriptions:
     place-from-available-or-map: "Place pieces from the Available box (or redeploy from the map if none available)"
     sweep-loc-hop: "Move troops along Lines of Communication into the target space"
     sweep-activation: "Activate underground guerrillas (1 per 2 cubes; Special Forces count as 2)"
   ```
3. **LLM-generated during build**: A build-time step that processes each macro definition and generates a one-line English summary, stored in the GameDef.

---

## 9. Assembling the Tooltip

### 9.1 Structure

```
[Action Name] ([Faction])

[Legality condition, if non-trivial]
[Cost summary]

Steps:
1. [Stage 1 header]: [summary of stage 1 effects]
2. [Stage 2 header]: [summary of stage 2 effects]
   - [Sub-choice or branch]
   - [Sub-choice or branch]
3. ...

[Capability modifiers]:
- [Capability name] (shaded/unshaded): [effect description]

[Limits]:
- [N] per [scope] (current: X/Y)
```

### 9.2 Length Budget

Tooltips should be concise. Target: **5-15 lines** for most actions, **20-30 lines** for complex actions like Train. If the full translation exceeds this, the system should:
1. Collapse deep branches to summaries
2. Move capability branches to a separate expandable section
3. Use hierarchical disclosure (collapsed by default)

---

## 10. Integration Points

### 10.1 Where to Hook In

The cleanest integration point is to replace or augment `actionDefToDisplayTree()` and `actionPipelineDefToDisplayTree()` in `packages/engine/src/kernel/ast-to-display.ts` with a parallel function `actionDefToEnglish()` that produces structured English text instead of (or alongside) display nodes.

Alternatively, a **post-processing step** could walk the existing `DisplayNode[]` tree and serialize it to English, since the display tree already contains all semantic information.

### 10.2 Where to Store Descriptions

Options:
1. **Computed on demand** (like current system): Generate English text each time a tooltip is requested. Stateless but requires processing.
2. **Cached at GameDef load time**: Pre-compute English descriptions for all actions when the game loads. Stored in a `Map<ActionId, string>`.
3. **Stored in GameDef**: Add an optional `description: string` field to `ActionDef`/`ActionPipelineDef`, populated during compilation or by a post-processing step.

### 10.3 Annotation Compatibility

The natural-language output should still support live state annotations. This can be achieved by:
- Embedding annotation markers in the text: "ARVN has at least 3 Resources **[current: 5, PASS]**"
- Returning a structured format: `{ text: string, annotations: AnnotationMarker[] }` with character offsets

---

## 11. Scope and Constraints Summary

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| Tooltip content | Pseudo-code AST dump | Legible English rules text |
| Engine agnosticism | Fully agnostic | Must remain agnostic |
| State annotations | Pass/fail, current values | Preserved in English text |
| Macro handling | Expanded inline | Summarized at macro level |
| Nesting depth | Unlimited expansion | Depth-limited with summaries |
| Identifier display | Raw camelCase/kebab-case | Humanized display names |
| Token filters | Raw `{prop, eq, value}` | Composed noun phrases |
| Capability branches | Mixed into main flow | Separated as modifiers |
| Pipeline stages | Unlabeled effect groups | Named step headers |
| Length | Unbounded | 5-30 lines target |

---

## 12. Open Questions for the Deep Researcher

1. **Template vs. LLM-only**: Should the system use a deterministic template engine (Layer 1) as the primary translator with optional LLM polish, or should the entire translation be LLM-driven (feeding the full AST JSON to an LLM with a system prompt)? What are the trade-offs for consistency, latency, and correctness?

2. **Depth-limited summarization**: What is the optimal nesting depth before switching to summaries? Should this be configurable per game, or is there a universal heuristic?

3. **Macro description authoring**: Should macro descriptions be authored manually in the GameSpecDoc, auto-generated from macro structure, or LLM-generated at build time? What's the best approach for maintainability?

4. **Identifier humanization**: Are there established NLP techniques for converting `camelCase` and `kebab-case` programmer identifiers into human-readable labels? How do existing game engines (Tabletop Simulator, Vassal, etc.) handle this?

5. **Conditional branch presentation**: How should complex conditional branches (especially capability-gated rules) be presented in tooltip text? Inline if/then/else, numbered sub-rules, expandable sections, or footnote-style annotations?

6. **Cross-game generality**: Can a single template set handle both FITL (wargame with spatial movement, markers, factions) and Texas Hold'em (card game with betting, hidden information)? What domain-specific customization hooks are needed?

7. **Live annotation in natural language**: What is the best UX pattern for embedding live state evaluation (pass/fail, current values) into natural-language text without making it cluttered or confusing?

8. **Localization readiness**: If the template system is designed well, could it support multiple languages in the future? What i18n patterns apply to game-rule NLG?

9. **Existing research**: Are there academic papers or open-source projects on natural language generation from game rule DSLs, board game rule explanation systems, or AST-to-English translation for domain-specific languages?

10. **Hybrid rendering**: Should the tooltip support both modes (structured AST view for power users, natural-language view for casual players) with a toggle? How does this affect the architecture?

## Outcome

- Completion date: 2026-03-10
- What changed: Finalized and archived this report after it had served its purpose as a design/reference artifact for action-tooltip natural-language generation exploration.
- Deviations from original plan: None recorded in this document.
- Verification results: Prepared for archival using the repository archival workflow; post-move dependency verification will be run with `pnpm run check:ticket-deps`.
