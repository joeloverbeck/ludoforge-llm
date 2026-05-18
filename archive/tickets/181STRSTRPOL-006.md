# 181STRSTRPOL-006: Phase 1 — Selector compiled IR, library bucket, compiler diagnostics

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/contracts/policy-contract.ts`, `packages/engine/src/cnl/compile-agents.ts`, `packages/engine/src/cnl/compiler-diagnostic-codes.ts`, `packages/engine/src/kernel/types-core.ts`
**Deps**: `archive/specs/181-structured-strategy-policy-layer-probes-and-selectors.md`

## Problem

Today the agent profile DSL has state features, candidate features, aggregates, pruning rules, considerations, tie breakers, and strategic conditions (`packages/engine/src/contracts/policy-contract.ts:5`), but no first-class ranking primitive that authors a "rank these targets by these components" decision. The result is utility-soup — every iteration that hits an expressiveness limit (target quality, pair evaluation, set-level chooseNStep intelligence) requires either a new feature ref or a new code primitive. Spec 181 §5 lands selectors as the missing middle layer: a compiled IR for ranking finite collections, microturn options, candidate params, or bounded products, with mandatory bounds and explicit preview fallback.

This ticket lands the IR shape + library bucket + compiler diagnostics. Runtime evaluation (007), trace integration (008), conformance tests (009-011), and ARVN migration (012) build on this foundation.

## Assumption Reassessment (2026-05-18)

1. `AGENT_POLICY_LIBRARY_BUCKETS` in `packages/engine/src/contracts/policy-contract.ts:5` is the canonical bucket list. Adding `'selectors'` requires updating both the constant and every reader that switches on bucket name. Confirmed by Step 2 verification.
2. `cnl/compile-agents.ts:2431, 2445` implements the dependency-cycle check via `reportCycle` with a stack — selectors must participate in this cycle check (a selector's `where` / `quality.components` can reference other selectors transitively; cycles must error).
3. The cap-class registry pattern from Spec 164 lives under `kernel/types-core.ts` (`AgentPreviewInnerCapClass`) and `cnl/compile-agents.ts` (cost validation `PREVIEW_INNER_COST_EXCEEDS_HARD_CAP`). Selector cost classes (`state | candidate | microturn | preview | auditOnly`) follow the same shape.
4. `CNL_COMPILER_AGENT_*` diagnostic code namespace is in `cnl/compiler-diagnostic-codes.ts`. The 12 new `SELECTOR_*` codes follow the existing naming convention.

## Architecture Check

1. Selectors operate on game-authored collection ids (`zones`, `tokens`, `cards`, `players`, `authoredFinite { collectionId }`). The kernel/compiler learn no game semantics — `zones` is a generic concept resolvable against any game's state (Foundation #1, #6).
2. All selector authoring is YAML inside GameSpecDoc agent definitions; mutatable by evolution (Foundation #2).
3. Selectors do not introduce new constructibility paths — they rank existing legal candidates. The compiler enforces `source.kind: 'microturnOptions'` evaluates against the published option set, never synthesising new options (Foundation #5, #18).
4. `maxItems` and `maxPairs` are mandatory; cost classes are derived and recorded; preview-derived components require `previewFallback`. Foundation #10 (bounded computation) and Foundation #20 (preview signal integrity) are both compiler-enforced.
5. Foundation #14 mechanical-uniformity: this ticket adds 12 diagnostic codes following an identical pattern (declare code, add positive-trigger test, add explanatory text). The Large effort rating reflects the LoC budget; review remains tractable because each diagnostic is structurally uniform.

## What to Change

### 1. Library bucket extension

`packages/engine/src/contracts/policy-contract.ts:5` — extend `AGENT_POLICY_LIBRARY_BUCKETS` with `'selectors'` (insertion position TBD by reading existing order; add in dependency order — selectors come after features/aggregates/conditions, before considerations/pruning, since considerations may reference selectors).

Every site that switches on the bucket name (search `AGENT_POLICY_LIBRARY_BUCKETS` consumers) must handle the new bucket. Foundation #14 — no transitional period: every consumer migrates in this ticket.

### 2. Compiled IR types

`packages/engine/src/kernel/types-core.ts` — add the types from spec §5.2:

```ts
type SelectorDef = {
  readonly id: SelectorId;                             // branded
  readonly scopes: ReadonlyArray<'move' | 'microturn'>;
  readonly source: SelectorSource;
  readonly where?: BoolExpr;
  readonly quality?: QualitySpec;
  readonly minImpact?: BoolExpr;
  readonly result: ResultSpec;
  readonly costClass: SelectorCostClass;
};

type SelectorSource =
  | { kind: 'collection'; collection: CollectionRef; key?: KeyBinding }
  | { kind: 'product';    left: CollectionRef; right: CollectionRef; maxPairs: number }
  | { kind: 'microturnOptions' }
  | { kind: 'candidateParams'; param: CandidateParamRef };

type CollectionRef =
  | { kind: 'zones' }
  | { kind: 'tokens'; tokenType?: TokenTypeId }
  | { kind: 'cards';  deck?: DeckRef }
  | { kind: 'players' }
  | { kind: 'authoredFinite'; collectionId: GameAuthoredCollectionId };

type QualitySpec = {
  readonly components: ReadonlyArray<QualityComponent>;
  readonly order: 'qualityDesc' | 'qualityAsc';
};

type QualityComponent = {
  readonly id: ComponentId;
  readonly value: NumericExpr;
  readonly weight: number;
  readonly previewFallback?: PreviewFallbackPolicy;
};

type ResultSpec = {
  readonly maxItems: number;
  readonly order: ReadonlyArray<'qualityDesc' | 'qualityAsc' | 'stableKeyAsc' | 'stableKeyDesc'>;
  readonly onEmpty: 'noContribution' | 'traceAndNoContribution' | 'demote';
};

type SelectorCostClass = 'state' | 'candidate' | 'microturn' | 'preview' | 'auditOnly';
```

Constants:
- `MAX_SELECTOR_RESULT_ITEMS = 32` (initial; named per Foundation #10 cap-class clause; recorded in compiled artifact metadata).
- `MAX_SELECTOR_PRODUCT_PAIRS = 256` (initial; same posture).

Branded types: `SelectorId`, `ComponentId`, `GameAuthoredCollectionId`, `CandidateParamRef` (Foundation #17).

### 3. YAML schema + parser

Extend `cnl/compile-agents.ts` to parse `selectors:` block under each agent profile. Each selector entry maps to a `SelectorDef`. Add YAML → IR transformation following the existing pattern for other buckets.

### 4. Cost-class derivation

Compute `SelectorDef.costClass` from the deepest dependency in `quality.components[*].value`, `where`, `minImpact`:

- `auditOnly` if reserved (no current trigger; future audit-mode probes).
- `preview` if any component transitively reads a preview ref.
- `microturn` if `source.kind: 'microturnOptions'` OR component reads microturn-scoped refs.
- `candidate` if component reads candidate-scoped refs.
- `state` otherwise.

Record derived class on `SelectorDef.costClass` and surface in the compiled artifact metadata block.

### 5. Compiler diagnostics

Add the following codes to `cnl/compiler-diagnostic-codes.ts` and implement the validation in `compile-agents.ts`. Each diagnostic gets a positive-trigger test in `packages/engine/test/cnl/agent-selector-diagnostics.test.ts`.

| Code | Trigger |
| --- | --- |
| `CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN` | `source.collection` or `source.authoredFinite.collectionId` not resolvable against game data |
| `CNL_COMPILER_AGENT_SELECTOR_SOURCE_NOT_FINITE` | Source has no compile-time-known finite cardinality |
| `CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MISSING_MAXPAIRS` | Product source omits `maxPairs` |
| `CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MAXPAIRS_EXCEEDS_CAP` | `maxPairs` > `MAX_SELECTOR_PRODUCT_PAIRS` |
| `CNL_COMPILER_AGENT_SELECTOR_MAXITEMS_MISSING_OR_EXCEEDS_CAP` | `result.maxItems` missing or > `MAX_SELECTOR_RESULT_ITEMS` |
| `CNL_COMPILER_AGENT_SELECTOR_ONEMPTY_MISSING` | `result.onEmpty` not set |
| `CNL_COMPILER_AGENT_SELECTOR_COMPONENT_REQUIRES_FALLBACK` | Component reads a preview ref without `previewFallback` (Foundation #20) |
| `CNL_COMPILER_AGENT_SELECTOR_COMPONENT_NONDETERMINISTIC_ORDER` | `result.order` lacks a deterministic tie-breaker |
| `CNL_COMPILER_AGENT_SELECTOR_REF_UNKNOWN` | Selector references unknown collection, feature, role, etc. |
| `CNL_COMPILER_AGENT_SELECTOR_BINDING_TYPE_MISMATCH` | `key.from` type does not match selector source type |
| `CNL_COMPILER_AGENT_SELECTOR_REQUIRES_UNREGISTERED_PREVIEW_REF` | Component depends on a preview ref that no declared drive will publish |
| `CNL_COMPILER_AGENT_SELECTOR_DEPENDENCY_CYCLE` | Selector refers to itself transitively (extends `reportCycle` from `compile-agents.ts:2431`) |
| `CNL_COMPILER_AGENT_SELECTOR_COST_CLASS_EXCEEDS_LIMIT` | Derived cost class exceeds the profile's declared `selector.maxCostClass` |

### 6. Profile-level `selector.maxCostClass`

Add optional profile-level setting `selector.maxCostClass: 'state' | 'candidate' | 'microturn' | 'preview' | 'auditOnly'` that caps the cost class of any selector in that profile. If not set, defaults to `preview` (the highest non-audit class). Used by the `COST_CLASS_EXCEEDS_LIMIT` diagnostic.

### 7. Cookbook entry (deferred placeholder)

Add a stub `### Selectors` section to `docs/agent-dsl-cookbook.md` linking to this spec. Full cookbook examples (target ranking, pair selectors, ARVN migration) land in 012 once a real ARVN selector exists to cite as canonical example.

## Files to Touch

- `packages/engine/src/contracts/policy-contract.ts` (modify — extend `AGENT_POLICY_LIBRARY_BUCKETS`)
- `packages/engine/src/kernel/types-core.ts` (modify — add IR types + constants + brands)
- `packages/engine/src/cnl/compile-agents.ts` (modify — YAML parser + cost-class derivation + cycle check + diagnostic firings)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify — add 13 new codes)
- `packages/engine/test/cnl/agent-selector-diagnostics.test.ts` (new — one positive-trigger test per diagnostic code)
- `packages/engine/test/cnl/agent-selector-ir.test.ts` (new — happy-path IR round-trip + cost-class derivation tests)
- `docs/agent-dsl-cookbook.md` (modify — stub section)
- Every consumer of `AGENT_POLICY_LIBRARY_BUCKETS` that switches on bucket name (search and modify each — Foundation #14 mechanical uniformity)

## Out of Scope

- Runtime selector evaluation (007).
- Trace integration (008).
- Per-game conformance tests (009, 010, 011).
- ARVN profile migration (012).
- Strategic modules, guardrails, turn-shape evaluators (Specs 182, 183, 184).

## Acceptance Criteria

### Tests That Must Pass

1. `agent-selector-diagnostics.test.ts` — one positive-trigger test per diagnostic code (13 codes minimum).
2. `agent-selector-ir.test.ts` — happy-path: a valid selector YAML compiles to a `SelectorDef` with derived `costClass`.
3. `agent-selector-ir.test.ts` — cycle detection: a selector that references itself transitively fires `DEPENDENCY_CYCLE`.
4. `agent-selector-ir.test.ts` — cost-class derivation: each of `state`, `candidate`, `microturn`, `preview` is reachable by a fixture selector.
5. Existing compiler test suite passes — no regression in other buckets.
6. Existing suite: `pnpm turbo test`

### Invariants

1. Compiler-derived `costClass` is recorded in the compiled artifact metadata; replay tests can assert it (Foundation #10 cap-class clause).
2. No selector with `previewFallback`-missing preview component compiles (Foundation #20).
3. `MAX_SELECTOR_RESULT_ITEMS` and `MAX_SELECTOR_PRODUCT_PAIRS` are statically named in compiled-artifact metadata.
4. Compiler is deterministic — same YAML → bit-identical IR + diagnostics (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/cnl/agent-selector-diagnostics.test.ts` — diagnostic coverage.
2. `packages/engine/test/cnl/agent-selector-ir.test.ts` — happy-path + cycle + cost-class derivation.
3. Existing tests for other buckets: confirm no regression after `AGENT_POLICY_LIBRARY_BUCKETS` extension.

### Commands

1. `pnpm -F @ludoforge/engine test -- agent-selector`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-18)

Implemented the Phase 1 selector compiler/IR substrate:

- Added the `selectors` agent library bucket, selector authoring types, compiled IR types, selector refs, selector cost classes, and selector cap metadata.
- Added selector lowering through `compile-agents.ts`, extracted selector normalization helpers to `packages/engine/src/cnl/compile-agent-selectors.ts`, wired selector dependencies into policy expression analysis, diagnostics, policy bytecode feature-table traversal, and schema artifacts.
- Added profile-level `selector.maxCostClass` validation without emitting default selector metadata for profiles that do not use selectors, preserving existing non-selector catalog shapes.
- Added selector diagnostics and positive-trigger tests for all selector diagnostic codes in `packages/engine/test/unit/cnl/agent-selector-diagnostics.test.ts`.
- Added selector IR happy-path, dependency-cycle, and cost-class derivation tests in `packages/engine/test/unit/cnl/agent-selector-ir.test.ts`.
- Added the cookbook `### Selectors` placeholder in `docs/agent-dsl-cookbook.md`.

Deviations and substitutions:

- The ticket's test paths named `packages/engine/test/cnl/...`; the live repo uses `packages/engine/test/unit/cnl/...`, so the new tests landed there.
- The literal command `pnpm -F @ludoforge/engine test -- agent-selector` is not a valid current runner selector; it fails with `Could not find 'agent-selector'`. The proving replacement is the direct compiled Node test command for the two selector test files after `pnpm -F @ludoforge/engine build`.
- Broad `pnpm turbo test` remains red outside this ticket: with production GameDef cache disabled, `arvn-evolved` compiles from the live FITL profile with already-present considerations (`penalizeOpponentMargin`, `hurtCurrentLeader`, `reduceNearestThreat`) that the Spec 178 parity fixtures and `fitl-policy-catalog.golden.json` do not include. The failure is in `packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js`, not in selector tests.

Source-size ledger:

| File | Before | After | Active delta | Note |
| --- | ---: | ---: | ---: | --- |
| `packages/engine/src/cnl/compile-agents.ts` | 4720 | 5172 | +452 | Pre-existing oversize central compiler. Selector-specific parsing/normalization was extracted to `compile-agent-selectors.ts`; residual orchestration stays in the central compiler because it owns library dependency planning, profile lowering, and ref resolution. |
| `packages/engine/src/cnl/compile-agent-selectors.ts` | 0 | 253 | +253 | New focused helper below the cap. |
| `packages/engine/src/kernel/schemas-core.ts` | 2799 | 2890 | +91 | Pre-existing oversize central schema file; selector schema additions stay with the adjacent agent policy schemas. |
| `packages/engine/src/kernel/types-core.ts` | 2377 | 2463 | +86 | Pre-existing oversize central kernel contract file; selector IR types are colocated with the compiled agent policy contracts they extend. |
| `packages/engine/src/cnl/game-spec-doc.ts` | 882 | 920 | +38 | Pre-existing oversize authoring contract file; selector authoring types are colocated with other agent authoring types. |
| `packages/engine/src/agents/policy-expr.ts` | 1767 | 1771 | +4 | Optional selector dependency propagation only. |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2285 | 2287 | +2 | Runtime selector refs are explicitly non-evaluating until 007. |
| `packages/engine/src/cnl/policy-bytecode/feature-table.ts` | 616 | 623 | +7 | Selector expression traversal only. |

Verification:

- `pnpm -F @ludoforge/engine build` — pass
- `node --test packages/engine/dist/test/unit/cnl/agent-selector-ir.test.js packages/engine/dist/test/unit/cnl/agent-selector-diagnostics.test.js` — pass (7 tests)
- `node --test packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/cnl/agent-selector-ir.test.js packages/engine/dist/test/unit/cnl/agent-selector-diagnostics.test.js` — pass (95 tests)
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — pass
- `pnpm run check:ticket-deps` — pass
- `git diff --check` — pass
- `pnpm turbo build` — pass
- `pnpm turbo lint` — pass
- `pnpm turbo typecheck` — pass
- `pnpm turbo test` — red in the unrelated FITL Spec 178 parity fixture drift described above
