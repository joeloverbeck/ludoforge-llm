# Spec 52 — Action Tooltip System

## Context

The game runner displays action buttons at the bottom of the screen (Pass, Train, Patrol, Sweep, etc.) but provides no information about what each action does. Players have no way to understand an action's preconditions, costs, or effects without external documentation. This spec adds a tooltip system that, on hover, shows a rich hierarchical view of the action's compiled definition — conditions (with live pass/fail evaluation against current game state), costs, and effects — entirely game-agnostic.

## Design Decisions (User-Confirmed)

1. **Scope**: Tooltips on legal actions only (no showing unavailable actions)
2. **AST Renderer**: Engine-side pure utility in `packages/engine`
3. **Display Model**: Recursive `DisplayNode` tree with typed node kinds
4. **Trigger**: Hover only, ~200ms debounce delay
5. **Live Evaluation**: Conditions annotated with pass/fail + current values via worker round-trip
6. **Game-Agnostic**: Works for any compiled `ActionDef`

## Architecture Overview

```
User hovers action button (200ms debounce)
  → useActionTooltip hook calls bridge.describeAction(actionId)
  → Worker: describeAction() in game-worker-api.ts
    → Engine: actionDefToDisplayTree() — static AST → DisplayNode conversion
    → Engine: annotateConditions() — live eval against GameState
    → Returns AnnotatedActionDescription (serializable)
  → ActionTooltip.tsx renders hierarchical DisplayNode tree
  → Floating UI positions tooltip above button
```

## Phase 1: Engine — DisplayNode Types

**New file**: `packages/engine/src/kernel/display-node.ts`

Define the display model — a serializable (Comlink-safe) recursive tree:

```typescript
type DisplayNodeKind = 'group' | 'line' | 'keyword' | 'operator' | 'value' | 'reference' | 'punctuation' | 'annotation';

interface DisplayGroupNode { kind: 'group'; label: string; icon?: string; children: DisplayNode[]; collapsible?: boolean }
interface DisplayLineNode  { kind: 'line'; indent: number; children: DisplayInlineNode[] }
interface DisplayKeywordNode     { kind: 'keyword'; text: string }
interface DisplayOperatorNode    { kind: 'operator'; text: string }
interface DisplayValueNode       { kind: 'value'; text: string; valueType?: 'number'|'boolean'|'string' }
interface DisplayReferenceNode   { kind: 'reference'; text: string; refKind: string }
interface DisplayPunctuationNode { kind: 'punctuation'; text: string }
interface DisplayAnnotationNode  { kind: 'annotation'; annotationType: 'pass'|'fail'|'value'|'usage'; text: string }

type DisplayInlineNode = keyword | operator | value | reference | punctuation | annotation
type DisplayNode = DisplayGroupNode | DisplayLineNode | DisplayInlineNode
```

**Key decisions**:
- Two-level hierarchy: `group` > `line` > inline nodes. Lines carry an `indent` level for visual nesting.
- All plain objects with primitives — safe for structured clone (Comlink).
- `annotation` nodes carry live evaluation results (appended to condition lines).

**Export from**: `packages/engine/src/kernel/runtime.ts` (add `export * from './display-node.js'`)

---

## Phase 2: Engine — Static AST-to-DisplayNode Renderer

**New file**: `packages/engine/src/kernel/ast-to-display.ts`

Pure functions converting AST nodes to display trees. No GameState dependency.

Key functions:
- `conditionToDisplayNodes(cond: ConditionAST, indent: number): DisplayNode[]`
- `effectToDisplayNodes(effect: EffectAST, indent: number): DisplayNode[]`
- `valueExprToInlineNodes(expr: ValueExpr): DisplayInlineNode[]`
- `optionsQueryToInlineNodes(query: OptionsQuery): DisplayInlineNode[]`
- `actionDefToDisplayTree(action: ActionDef): DisplayGroupNode[]`

`actionDefToDisplayTree` produces sections:
1. **Parameters** — one line per `ParamDef` (name + domain summary)
2. **Preconditions** — recursive rendering of `action.pre` ConditionAST
3. **Costs** — each cost `EffectAST` rendered
4. **Effects** — each effect `EffectAST` rendered, with nested groups for `forEach`/`if`/`reduce`
5. **Limits** — one line per `LimitDef` (scope + max)

Sections with no content (e.g., `pre === null`, empty costs) are omitted.

Rendering strategy per AST variant:
- **Conditions**: `and`/`or` → keyword line + indented children; `not` → keyword + child; comparisons → single line with left/op/right; `in`/`adjacent`/`connected`/`zonePropIncludes` → descriptive single line
- **Effects**: Simple effects (setVar, moveToken, etc.) → single line; `forEach`/`if`/`reduce`/`let`/`rollRandom` → keyword line + indented body; `chooseOne`/`chooseN` → single descriptive line
- **ValueExpr**: Literals → value node; References → reference node with `refKind`; Binary ops → `left op right`; Aggregates → `count/sum/min/max(query)`; Conditionals → `if(cond, then, else)`

**Export from**: `packages/engine/src/kernel/runtime.ts`

---

## Phase 3: Engine — Live Condition Annotator

**New file**: `packages/engine/src/kernel/condition-annotator.ts`

Evaluates conditions against current `GameState` and annotates the display tree.

```typescript
interface AnnotationContext {
  def: GameDef;
  state: GameState;
  activePlayer: PlayerId;
  runtime: GameDefRuntime;  // has adjacencyGraph, runtimeTableIndex
}

interface LimitUsageInfo {
  scope: 'turn' | 'phase' | 'game';
  max: number;
  current: number;
}

interface AnnotatedActionDescription {
  sections: DisplayGroupNode[];
  limitUsage: LimitUsageInfo[];
}

function describeAction(action: ActionDef, ctx: AnnotationContext): AnnotatedActionDescription;
```

Implementation:
1. Call `actionDefToDisplayTree(action)` for static structure
2. Walk the Preconditions group. For each condition line:
   - Build an `EvalContext` from `AnnotationContext` (empty bindings, `activePlayer` as actor, dummy `ExecutionCollector`)
   - Call `evalCondition(cond, evalCtx)` in a try/catch
   - Append `DisplayAnnotationNode` with `annotationType: 'pass'` or `'fail'`
   - For comparison conditions, also call `evalValue()` on left/right to show current values
3. For Limits group, look up `state.actionUsage` and produce `LimitUsageInfo` entries + annotate lines with `'usage'` annotations
4. Costs and Effects remain unannotated (showing what will happen, not evaluating side effects)
5. If `evalCondition` throws (e.g., missing binding for move params), annotate as `'fail'` with text `'depends on choice'`

**Reuses**:
- `evalCondition` from `packages/engine/src/kernel/eval-condition.ts`
- `evalValue` from `packages/engine/src/kernel/eval-value.ts`
- `EvalContext` from `packages/engine/src/kernel/eval-context.ts`
- `GameDefRuntime` from `packages/engine/src/kernel/gamedef-runtime.ts` (provides `adjacencyGraph`, `runtimeTableIndex`)
- `createNoopCollector()` or similar from `packages/engine/src/kernel/execution-collector.ts`

**Export from**: `packages/engine/src/kernel/runtime.ts`

---

## Phase 4: Worker API Extension

**Modified file**: `packages/runner/src/worker/game-worker-api.ts`

Add to `GameWorkerAPI` interface:
```typescript
describeAction(actionId: string): Promise<AnnotatedActionDescription | null>;
```

Implementation in `createGameWorker()`:
```typescript
async describeAction(actionId: string): Promise<AnnotatedActionDescription | null> {
  return withInternalErrorMapping(() => {
    const current = assertInitialized(def, state);
    const actionDef = current.def.actions.find(a => String(a.id) === actionId);
    if (!actionDef) return null;
    const currentRuntime = runtime ?? createGameDefRuntime(current.def);
    return describeAction(actionDef, {
      def: current.def,
      state: current.state,
      activePlayer: current.state.activePlayer,
      runtime: currentRuntime,
    });
  });
}
```

**Key points**:
- Read-only — no `ensureFreshMutation`, no `OperationStamp`
- Returns `null` for unknown action IDs
- Reuses the already-cached `runtime` variable in the worker closure
- Import `describeAction` from `@ludoforge/engine/runtime`
- Import `AnnotatedActionDescription` type from `@ludoforge/engine/runtime`

---

## Phase 5: Runner — Bridge Prop Threading

**Modified file**: `packages/runner/src/ui/GameContainer.tsx`

Add `bridge` prop:
```typescript
interface GameContainerProps {
  readonly store: StoreApi<GameStore>;
  readonly bridge: GameBridge;  // NEW — Comlink Remote<GameWorkerAPI>
  // ... existing props
}
```

**Modified file**: `packages/runner/src/App.tsx`

Pass `activeRuntime.bridgeHandle.bridge` to `GameContainer`:
```typescript
<GameContainer
  store={activeRuntime.store}
  bridge={activeRuntime.bridgeHandle.bridge}
  visualConfigProvider={activeRuntime.visualConfigProvider}
  // ... existing props
/>
```

---

## Phase 6: Runner — useActionTooltip Hook

**New file**: `packages/runner/src/ui/useActionTooltip.ts`

Custom React hook managing the hover → debounce → fetch → render lifecycle:

```typescript
interface ActionTooltipState {
  actionId: string | null;
  description: AnnotatedActionDescription | null;
  loading: boolean;
  anchorElement: HTMLElement | null;
}

function useActionTooltip(bridge: GameBridge): {
  tooltipState: ActionTooltipState;
  onActionHoverStart: (actionId: string, element: HTMLElement) => void;
  onActionHoverEnd: () => void;
}
```

Implementation:
1. On `onActionHoverStart`: store `actionId` + `anchorElement`, start 200ms timer
2. After debounce: call `bridge.describeAction(actionId)`, store result
3. On `onActionHoverEnd`: clear state, cancel pending timer/request
4. Use a request counter to discard stale responses (user hovered away before response arrived)

---

## Phase 7: Runner — ActionTooltip Component

**New file**: `packages/runner/src/ui/ActionTooltip.tsx`

React component rendering the hierarchical `DisplayNode` tree:

```typescript
interface ActionTooltipProps {
  description: AnnotatedActionDescription;
  anchorElement: HTMLElement;
}
```

- Uses `@floating-ui/react-dom` `useFloating` with `placement: 'top'`, `offset(12)`, `flip()`, `shift({ padding: 8 })`
- Anchored to real DOM element (the action button), not a virtual reference
- Recursive rendering: `renderDisplayGroup` → `renderDisplayLine` → `renderInlineNode`
- CSS class per node kind for syntax highlighting:
  - `.keyword` — purple (DSL keywords like `if`, `forEach`, `moveToken`)
  - `.operator` — neutral gray
  - `.value` — green (literals)
  - `.reference` — blue (variable/binding references)
  - `.annotation.pass` — teal/green
  - `.annotation.fail` — red
- `max-height: 400px; overflow-y: auto` for large action definitions
- `pointer-events: none` so tooltip doesn't interfere with interaction

**New file**: `packages/runner/src/ui/ActionTooltip.module.css`

---

## Phase 8: Runner — ActionToolbar Integration

**Modified file**: `packages/runner/src/ui/ActionToolbar.tsx`

Add hover callback props:
```typescript
interface ActionToolbarProps {
  readonly store: StoreApi<GameStore>;
  readonly onActionHoverStart?: (actionId: string, element: HTMLElement) => void;
  readonly onActionHoverEnd?: () => void;
}
```

Add to each button:
```typescript
onPointerEnter={(e) => onActionHoverStart?.(action.actionId, e.currentTarget)}
onPointerLeave={() => onActionHoverEnd?.()}
```

**Modified file**: `packages/runner/src/ui/GameContainer.tsx`

Wire everything in `GameContainer`:
```typescript
const { tooltipState, onActionHoverStart, onActionHoverEnd } = useActionTooltip(bridge);

// In bottom bar 'actions' case:
<ActionToolbar store={store} onActionHoverStart={onActionHoverStart} onActionHoverEnd={onActionHoverEnd} />

// In floating content:
{tooltipState.description && tooltipState.anchorElement && (
  <ActionTooltip description={tooltipState.description} anchorElement={tooltipState.anchorElement} />
)}
```

---

## File Summary

### New Files (Engine)
| File | Purpose |
|------|---------|
| `packages/engine/src/kernel/display-node.ts` | DisplayNode type system |
| `packages/engine/src/kernel/ast-to-display.ts` | Static AST → DisplayNode conversion |
| `packages/engine/src/kernel/condition-annotator.ts` | Live evaluation + annotation |

### New Files (Runner)
| File | Purpose |
|------|---------|
| `packages/runner/src/ui/useActionTooltip.ts` | Hover lifecycle hook |
| `packages/runner/src/ui/ActionTooltip.tsx` | Hierarchical tooltip renderer |
| `packages/runner/src/ui/ActionTooltip.module.css` | Tooltip styles |

### Modified Files
| File | Change |
|------|--------|
| `packages/engine/src/kernel/runtime.ts` | Export new modules |
| `packages/runner/src/worker/game-worker-api.ts` | Add `describeAction` method |
| `packages/runner/src/ui/ActionToolbar.tsx` | Add hover callbacks |
| `packages/runner/src/ui/GameContainer.tsx` | Wire tooltip hook, accept bridge prop, render ActionTooltip |
| `packages/runner/src/App.tsx` | Pass bridge to GameContainer |

### Test Files
| File | Purpose |
|------|---------|
| `packages/engine/test/unit/kernel/ast-to-display.test.ts` | Static conversion for all AST variants |
| `packages/engine/test/unit/kernel/condition-annotator.test.ts` | Annotation with mock GameState |
| `packages/runner/test/ui/ActionTooltip.test.tsx` | Component rendering |
| `packages/runner/test/ui/useActionTooltip.test.ts` | Hook lifecycle (debounce, cancel, stale) |

---

## Reused Existing Code

| Utility | Location | How Used |
|---------|----------|----------|
| `evalCondition()` | `packages/engine/src/kernel/eval-condition.ts` | Live condition evaluation |
| `evalValue()` | `packages/engine/src/kernel/eval-value.ts` | Resolve current values for annotations |
| `EvalContext` | `packages/engine/src/kernel/eval-context.ts` | Context struct for evaluation |
| `GameDefRuntime` | `packages/engine/src/kernel/gamedef-runtime.ts` | Cached adjacencyGraph + runtimeTableIndex |
| `buildAdjacencyGraph()` | `packages/engine/src/kernel/spatial.ts` | Fallback if runtime is null |
| `createGameDefRuntime()` | `packages/engine/src/kernel/gamedef-runtime.ts` | Fallback runtime construction |
| `assertInitialized()` | `packages/runner/src/worker/game-worker-api.ts` | Worker state guard |
| `withInternalErrorMapping()` | `packages/runner/src/worker/game-worker-api.ts` | Worker error handling pattern |
| `@floating-ui/react-dom` | Already a runner dependency | Tooltip positioning |
| `formatIdAsDisplayName()` | `packages/runner/src/model/derive-render-model.ts` | Display name formatting |

---

## Verification

1. **Engine unit tests**: `pnpm -F @ludoforge/engine test` — run ast-to-display and condition-annotator tests
2. **Engine build**: `pnpm -F @ludoforge/engine build` — verify new exports compile
3. **Runner build**: `pnpm -F @ludoforge/runner typecheck` — verify type integration across worker boundary
4. **Runner unit tests**: `pnpm -F @ludoforge/runner test` — run tooltip component and hook tests
5. **Manual E2E**: `pnpm -F @ludoforge/runner dev` — load FITL game, hover over action buttons, verify:
   - Tooltip appears after ~200ms hover
   - Shows Preconditions with green/red pass/fail badges
   - Shows Costs and Effects with hierarchical nesting
   - Shows Limits with current usage
   - Tooltip disappears on mouse leave
   - No lag or UI jank during rapid hover across buttons
6. **Cross-game**: Load Texas Hold'em, verify tooltips render correctly for poker actions
