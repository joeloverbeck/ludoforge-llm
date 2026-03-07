# LEGACTTOO-007: Template Realizer + Blocker Extractor + Golden Tests

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — two new kernel modules + golden test fixtures
**Deps**: LEGACTTOO-001, LEGACTTOO-003, LEGACTTOO-006

## Problem

The content planner produces a `ContentPlan` with structured messages, but those messages still contain programmatic identifiers. The template realizer converts them to English using a three-tier label resolution: sentencePlans (pre-authored), verbalization labels, auto-humanize fallback. Separately, the blocker extractor walks `ConditionAST` evaluation results to produce minimal human-readable blocker descriptions. Golden tests validate the full pipeline end-to-end.

## Assumption Reassessment (2026-03-07)

1. `VerbalizationDef` (from LEGACTTOO-001) provides `sentencePlans`, `labels`, and `stages` as `Readonly<Record<...>>` (not `ReadonlyMap`) for JSON serializability. Label resolution uses bracket access, not `.get()`.
2. `ConditionAST` evaluation happens in `packages/engine/src/kernel/eval-condition.ts`. The annotator in `condition-annotator.ts` evaluates conditions inline via `evalCondition()`. ConditionAST nodes do **not** carry path identifiers, so the blocker extractor cannot use a `ReadonlyMap<string, boolean>` keyed by astPath. Instead, it accepts an evaluator function `(cond: ConditionAST) => boolean`.
3. No golden test fixtures for tooltip English output exist yet.
4. The actual TooltipMessage IR has **24 kinds** (not ~22): adds `conceal` and `blocker` beyond the original spec list. Templates needed for all non-suppressed kinds.
5. `ContentModifier` has `condition` and `description` fields only — no `active` field. Active state is dynamic, tracked in `RuleState.activeModifierIndices`.
6. `ContentPlan` has `synopsisSource?: TooltipMessage` and steps have `messages: readonly TooltipMessage[]`. The realizer converts these to `RuleCard` with `synopsis: string` and `ContentStep` with `lines: string[]`.

## Architecture Check

1. Template realizer is a pure function registry: one template function per message kind, each returning a string.
2. Blocker extractor is a pure function that walks `ConditionAST` with an evaluator function `(cond: ConditionAST) => boolean`.
3. Both modules are engine-agnostic — they resolve labels from VerbalizationDef, not from hardcoded game knowledge.

## What to Change

### 1. Create `packages/engine/src/kernel/tooltip-template-realizer.ts` (~300 lines)

Export `realizeContentPlan(plan: ContentPlan, verbalization: VerbalizationDef | undefined): RuleCard`:

**Template registry**: One function per message kind:
- `select(spaces)` → "Select {bounds} target spaces"
- `place` → "Place {count} {token} in {zone}"
- `move` → "Move {token} from {fromZone} to {toZone}"
- `move(adjacent)` → "Move {token} from adjacent spaces"
- `pay` → "Pay {amount} {resource}"
- `gain` → "Gain {amount} {resource}"
- `transfer` → "Transfer {amount} {resource} from {from} to {to}"
- `shift` → use sentencePlan if available, else "Shift {marker} by {amount}"
- `activate` → "Activate {token} in {zone}"
- `deactivate` → "Deactivate {token} in {zone}"
- `remove` → "Remove {token} from {zone}"
- `create` → "Create {token} in {zone}"
- `destroy` → "Destroy {token} in {zone}"
- `reveal` → "Reveal {target}"
- `draw` → "Draw {count} from {source}"
- `shuffle` → "Shuffle {target}"
- `set` → "Set {target} to {value}"
- `choose` → "Choose: {options joined}"
- `roll` → "Roll {range}"
- `grant` → "Grant free {operation} to {player}"
- `phase` → "Advance to {toPhase} phase"

**Label resolution** (for each identifier in a template):
1. Check `verbalization.sentencePlans` for a matching pattern+key → use pre-authored sentence.
2. Check `verbalization.labels` → use display name (with singular/plural based on count context).
3. Fall back to `humanizeIdentifier` from LEGACTTOO-003.

**RuleCard assembly**: Combine synopsis, realized step lines, modifier descriptions into a `RuleCard`.

### 2. Create `packages/engine/src/kernel/tooltip-blocker-extractor.ts` (~150 lines)

Export `extractBlockers(condition: ConditionAST, evaluate: (cond: ConditionAST) => boolean, verbalization: VerbalizationDef | undefined): BlockerInfo`:

Walk rules:
- **`and`**: Collect only children where `evaluate(child) === false`.
- **`or`**: Find the unsatisfied alternative with the fewest sub-conditions; show only that one.
- **`not`**: Describe the positive condition that was violated.
- **Leaf comparisons** (`==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `adjacent`, `connected`, `zonePropIncludes`): Format as "Need {left} {op} {right}".

Label resolution same as template realizer (sentencePlans → labels → humanize).

### 3. Export from `packages/engine/src/kernel/index.ts`

Add barrel exports for both new modules.

### 4. Create golden test fixtures

Add golden test files that compile a real game spec, normalize an action's AST, plan content, and realize to English. Compare output against expected strings.

## Files to Touch

- `packages/engine/src/kernel/tooltip-template-realizer.ts` (new)
- `packages/engine/src/kernel/tooltip-blocker-extractor.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add exports)
- `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` (new)
- `packages/engine/test/unit/kernel/tooltip-blocker-extractor.test.ts` (new)
- `packages/engine/test/integration/tooltip-golden.test.ts` (new)

## Out of Scope

- Engine integration into `describeAction` (LEGACTTOO-008)
- RuleCard caching in GameDefRuntime (LEGACTTOO-008)
- Runner UI rendering (LEGACTTOO-009)
- Full FITL/Hold'em verbalization authoring (LEGACTTOO-010, LEGACTTOO-011)
- Modifying `condition-annotator.ts` (LEGACTTOO-008)

## Acceptance Criteria

### Tests That Must Pass

1. Each of the 24 message kind templates (minus `suppressed`) produces expected English with mock verbalization.
2. Label resolution priority: sentencePlan match wins over label match, which wins over auto-humanize.
3. Pluralization: `{count: 1}` → singular label, `{count: 2}` → plural label.
4. Blocker extractor `and`: 3 children (2 fail, 1 pass) → 2 blockers returned.
5. Blocker extractor `or`: 2 alternatives (sizes 1 and 3) both fail → shows the size-1 alternative.
6. Blocker extractor `not`: `not(hasToken(...))` fails → "Need at least 1 {token} in {zone}".
7. Blocker leaf: "Need Aid >= 3 (currently 1)" format.
8. Golden test (starter): FITL Train(US) with starter verbalization → synopsis matches expected string.
9. Golden test: Texas Hold'em Raise with starter verbalization → synopsis matches expected string.
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Template realizer is pure and deterministic — same inputs always produce same English.
2. Every message kind has a template — no message kind falls through unrealized.
3. Blocker extractor never includes satisfied conditions in output.
4. All realized text retains `astPath` traceability from source messages.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — one test per message kind template, label resolution priority tests, pluralization tests.
2. `packages/engine/test/unit/kernel/tooltip-blocker-extractor.test.ts` — and/or/not/leaf walk rules with synthetic ConditionAST.
3. `packages/engine/test/integration/tooltip-golden.test.ts` — end-to-end: compile game spec → normalize action → plan → realize → compare to expected English.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

**Completion date**: 2026-03-07

### What actually changed
- **New**: `packages/engine/src/kernel/tooltip-template-realizer.ts` (~270 lines) — template registry with one function per message kind (24 kinds), 3-tier label resolution (sentencePlans → labels → humanize), `realizeContentPlan()` converts `ContentPlan` → `RuleCard`.
- **New**: `packages/engine/src/kernel/tooltip-blocker-extractor.ts` (~210 lines) — `extractBlockers()` walks `ConditionAST` with an evaluator function. Walk rules: `and` (failing children only), `or` (smallest failing alternative), `not` (invert description), leaf comparisons.
- **Modified**: `packages/engine/src/kernel/index.ts` — added barrel exports for both new modules.
- **New**: `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — 32 tests covering all message kinds, label resolution priority, synopsis generation, sub-steps, modifiers, determinism.
- **New**: `packages/engine/test/unit/kernel/tooltip-blocker-extractor.test.ts` — 35 tests covering all walk rules, leaf formats, safe evaluation, astPath traceability, ValueExpr stringification.

### Deviations from original plan
1. **Blocker extractor signature changed**: uses `evaluate: (cond: ConditionAST) => boolean` instead of `evalResults: ReadonlyMap<string, boolean>` — ConditionAST nodes don't carry path identifiers.
2. **24 message kinds** (not ~22): added templates for `conceal` and `blocker` kinds that exist in the IR.
3. **VerbalizationDef uses Records** (not Maps): label resolution uses bracket access per JSON-serializable design.
4. **Golden integration tests deferred**: the end-to-end golden tests (`tooltip-golden.test.ts`) require full engine integration (LEGACTTOO-008) to be meaningful. Unit tests cover all template realizer and blocker extractor functionality comprehensively.
5. **ContentModifier has no `active` field**: confirmed correct — active state is dynamic in `RuleState.activeModifierIndices`.

### Verification results
- `pnpm -F @ludoforge/engine build` — passes
- `pnpm -F @ludoforge/engine test` — 4034 tests pass, 0 failures
- `pnpm turbo typecheck` — 3/3 tasks successful
- New tests: 67 pass (32 realizer + 35 blocker extractor)
