# 150FITLWASM-014: Generic production preview-drive substrate for WASM routing

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: XL
**Engine Changes**: Yes — generic production preview-drive state/effect/publication substrate, WASM/buffer ABI, parity witnesses
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-011.md`, `archive/tickets/150FITLWASM-012.md`, `archive/tickets/150FITLWASM-013.md`

## Problem

Reassessment of `tickets/150FITLWASM-010.md` on 2026-05-03 found that archived
ticket `150FITLWASM-013` completed an encoded preview-state slot inventory
substrate, but it did not complete the generic production preview-drive
substrate needed before production routing can truthfully stop using the
TypeScript preview drive.

The live production route in `packages/engine/src/agents/policy-preview.ts`
still owns initial candidate `GameState` application, microturn publication,
bounded completion drive, hidden-sampling/stochastic/depth-cap/failure
semantics, canonical preview-state materialization, preview metadata,
preview-state features, preview surfaces, and granted-operation consumers.

The live WASM preview-drive ABI consumes already-authored encoded scalar steps
such as `applyCandidateDeltas`, `chooseOneGreedy`, `chooseNGreedy`,
`addGlobal`, and `stochastic`, then returns outcome/depth/value rows plus
requested scalar preview-state slots. That is useful proof machinery, but it is
not the one-rules production application/publication substrate required by
Foundations #5 and #16. `150FITLWASM-010` remains the later production routing
and same-seam perf-gate owner after this prerequisite.

## Assumption Reassessment (2026-05-03)

1. `archive/tickets/150FITLWASM-013.md` is complete as an encoded
   preview-state slot substrate and FITL inventory witness.
2. `150FITLWASM-013` does not make WASM the owner of generic production
   preview application, publication, bounded completion, or full preview-state
   materialization.
3. Closing `150FITLWASM-010` on the current scalar replay/slot ABI would
   misstate production routing and would weaken the proof required by
   `docs/FOUNDATIONS.md`.

## Progress Ledger

### 2026-05-03 — Compiler-owned preview-drive IR substrate started

User-confirmed Foundation-aligned option: complete this ticket literally rather
than closing on a narrowed scalar replay/inventory surrogate.

Implemented a first generic compiler-owned production preview-drive IR and
WASM target:

- Added `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`
  as the TypeScript compiler/lowering boundary from generic `GameDef`
  action/action-pipeline effects into WASM preview-drive batches.
- Advanced the WASM ABI to version `9` and the preview-drive layout to
  `0x1500_0014`.
- Added generic preview-state slot mutation ops so WASM can update named
  scalar preview-state slots, not only the primary synthetic value.
- Added focused parity/fail-closed tests proving supported generic production
  action-pipeline preview drives, multi-slot `setVar`, and unsupported
  other-seat publication diagnostics.
- Updated the FITL preview-drive inventory to report a distinct
  `productionApplicationPublication` row so old scalar
  `initialMoveApplication` / `decisionStackPublication` / `completionExits`
  support can no longer be mistaken for this production substrate.

Current decisive FITL inventory remains red for this ticket:

- Command: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-ir-kind-inventory`
- Result: `productionApplicationPublication supportedByEncodedPreviewDriveAbi=false`,
  `productionPreviewDriveSubstrateSupported=false`,
  `failClosedClass=unsupported-effect`,
  `successorOwner=tickets/150FITLWASM-014.md`.
- Exact residual buckets include unsupported generic effect families
  `forEach`, `if`, `let`, and nonliteral `addVar` deltas. These are still owned
  by this ticket before production routing can truthfully return to
  `tickets/150FITLWASM-010.md`.

Status remains `PENDING`; do not mark this ticket complete until the current
FITL same-seam production application/publication row is supported or an
explicit user-approved boundary reset changes the deliverable.

### 2026-05-03 — Scalar expression and runtime-binding IR support added

Extended the compiler-owned production preview-drive IR substrate with a
generic deterministic scalar evaluation layer:

- Added arithmetic numeric expressions, tracked global-slot references,
  numeric `if` expressions, scalar `if` effect branch selection, and lexical
  `let` bindings.
- Seeded action-pipeline runtime bindings with the same generic
  `buildMoveRuntimeBindings` / `resolvePipelineDecisionBindingsForMove`
  path used by production application, including `__actionClass` and
  `__freeOperation`.
- Added scalar-array binding reads, binding-count aggregates, scalar `in`
  conditions, and global-marker-state reads for deterministic branch
  selection.
- Extended focused preview-driver tests with a production action-pipeline
  fixture proving arithmetic, branch, and let-bound deltas match the
  TypeScript preview driver through WASM.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-runtime-bindings-inventory`

Latest decisive FITL inventory remains red for this ticket:

- `productionApplicationPublication supportedByEncodedPreviewDriveAbi=false`
- `productionPreviewDriveSubstrateSupported=false`
- `failClosedClass=unsupported-effect`
- Residual leading unsupported owners are now `effect.forEach`, non-enum
  `chooseN`, `effect.shiftMarker`, and aggregate-heavy `let`.
- The nonliteral scalar `addVar` bucket for `nvaTransferResources` is now
  supported in this witness, proving the scalar expression slice is live.

Status remains `PENDING`; next implementation work should target a generic
query-backed publication/binding substrate for non-enum `chooseN` and
`forEach`, before deciding how marker/token mutations materialize in the
supported preview-state artifact.

### 2026-05-03 — Query-backed publication and forEach binding substrate added

Extended the production preview-drive compiler to evaluate generic
`OptionsQuery` publications through the existing kernel query evaluator, then
lower deterministic scalar query results into WASM preview-drive publication
steps and lexical bindings:

- `chooseOne` / `chooseN` no longer require enum-only options when the query
  resolves to deterministic scalar options.
- `chooseN` now resolves deterministic numeric bounds and binds the greedy
  selected scalar set for later effects.
- `forEach` now iterates deterministic scalar query results, threads the
  iteration binding through nested effects, supports deterministic limits, and
  supports `countBind` for `in` effects.
- Binding-template names such as `$choice@{$space}` are resolved generically
  from current preview bindings.
- Focused WASM test coverage now proves scalar expressions plus query-backed
  publication and `forEach` binding lower into deterministic preview-state
  rows.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-query-bindings-inventory`

Latest decisive FITL inventory remains red:

- `productionApplicationPublication supportedByEncodedPreviewDriveAbi=false`
- `productionPreviewDriveSubstrateSupported=false`
- `failClosedClass=unsupported-effect`
- Previously red action buckets now newly supported include `vc-baseline`
  `rally`, `nva-baseline` `rally`, and `nva-baseline`
  `coupNvaRedeployTroops`, proving the query/binding slice is active.
- Leading residual unsupported owners are now scalar-only `forEach` queries
  that resolve non-scalar token/object items, aggregate-heavy `let`, marker
  mutations (`shiftMarker`), token/object-backed `chooseN`, and remaining
  condition/addVar expressions that depend on those richer values.

Status remains `PENDING`; next implementation work should choose the generic
preview materialization boundary for token/object query results and marker
mutations rather than expanding scalar preview slots further.

### 2026-05-03 — Token/object materialization and token state tracking added

Extended the production preview-drive compiler with a generic preview
materialization boundary for token/object query results and token structural
state:

- Added `packages/engine/src/agents/policy-wasm-production-preview-values.ts`
  for reusable scalar/object materialization, marker tracking, token-zone
  tracking, token move support, and token property mutation support.
- Query-backed publications and `forEach` bindings can now materialize object
  results with stable string `id` fields, including token ids and map-space
  ids.
- The compiler now tracks preview-local token zones across deterministic
  `moveToken` effects, including `top` / `bottom` placement, zone-entry prop
  resets through the kernel helper, stacking checks, dynamic string
  concatenation, and `tokenZone` / binding-backed zone selectors.
- The compiler now tracks scalar `setTokenProp` updates so later preview
  queries and filters observe the mutated token props within the same compiled
  pass.
- Focused preview-driver coverage now proves token-object `chooseN`,
  token-id `forEach`, deterministic `moveToken`, `setTokenProp`,
  marker-shift branch selection, and scalar preview-state output in the same
  WASM production preview-drive witness.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-token-prop-inventory`

Latest decisive FITL inventory remains red:

- `productionApplicationPublication supportedByEncodedPreviewDriveAbi=false`
- `productionPreviewDriveSubstrateSupported=false`
- `failClosedClass=unsupported-effect`
- Newly supported action buckets include `arvn-baseline`
  `coupArvnRedeployPolice`, `arvn-baseline`
  `coupArvnRedeployOptionalTroops`, `nva-baseline` `infiltrate`, and
  `arvn-baseline` `train`, proving token move/property tracking is live.
- Leading residual unsupported owners are now marker mutations
  (`shiftMarker`), non-scalar `let` / `if` branches, `chooseN` bounds,
  non-integer `addVar` deltas, and `removeByPriority`.

Status remains `PENDING`; next implementation work should target the generic
marker-shift / condition-expression residuals before reassessing the smaller
`chooseN`, `addVar`, and `removeByPriority` buckets.

### 2026-05-03 — Constrained marker shifts and zone-property conditions added

Extended the production preview-drive compiler with the next generic
condition/materialization slice:

- `shiftMarker` now evaluates marker lattice constraints through the
  preview-local condition evaluator instead of rejecting any constrained
  lattice. Constraint violations resolve as the same no-op destination used by
  the kernel marker rules.
- Scalar expression evaluation now supports generic `zoneProp` reads.
- Condition evaluation now supports generic `zonePropIncludes` checks over
  array-valued zone attributes.
- Focused preview-driver and FITL inventory proof remain on the same
  compiler-owned production preview-drive path; no FITL ids or route shortcuts
  were introduced.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-marker-constraints-inventory`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-zoneprop-includes-inventory`

Latest decisive FITL inventory remains red:

- `productionApplicationPublication supportedByEncodedPreviewDriveAbi=false`
- `productionPreviewDriveSubstrateSupported=false`
- `failClosedClass=unsupported-effect`
- Newly supported action buckets include `vc-baseline` `coupAgitateVC`,
  `us-baseline` `coupPacifyUS`, `arvn-baseline` `coupPacifyARVN`,
  `nva-baseline` `march`, `arvn-baseline` `govern`, `us-baseline`
  `assault`, `us-baseline` `advise`, and `arvn-baseline` `sweep`.
- Remaining unsupported owners are now `production-preview-drive.chooseN`
  for `vc-baseline` `attack` (count `5`),
  `production-preview-drive.effect.removeByPriority` for `vc-baseline`
  `ambushVc` (count `4`) and `us-baseline` `coupCommitmentResolve`
  (count `1`), and `production-preview-drive.effect.if` for `nva-baseline`
  `terror` (count `2`).

Status remains `PENDING`; next implementation work should target the generic
`removeByPriority` state-mutating control-flow primitive with a focused
preview-driver witness before revisiting the remaining `chooseN` and `if`
buckets.

### 2026-05-03 — Generic removeByPriority support added

Extended the production preview-drive compiler with generic
`removeByPriority` support over deterministic token-id query results:

- `removeByPriority` now evaluates deterministic non-negative budgets, visits
  priority groups in order, resolves group token ids, moves each token through
  the preview-local zone map, and exports `countBind` / `remainingBind`
  values for nested effects.
- Scalar expression evaluation now supports generic `tokenProp` reads, so
  remove destinations can be built from token properties without FITL-specific
  branches.
- The `forEach` compiler path now threads preview-local marker and zone state
  back to the outer compile state, which is required for later effects to see
  token moves made inside the loop.
- Focused preview-driver coverage now proves `forEach` token movement,
  `removeByPriority`, token-property destination construction, and count-bound
  score publication in the same WASM production preview-drive witness.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-remove-by-priority-inventory`

Latest decisive FITL inventory remains red:

- `productionApplicationPublication supportedByEncodedPreviewDriveAbi=false`
- `productionPreviewDriveSubstrateSupported=false`
- `failClosedClass=unsupported-effect`
- Newly supported action bucket: `vc-baseline` `ambushVc`, proving the
  `removeByPriority` slice is live.
- `us-baseline` `coupCommitmentResolve` advanced past
  `removeByPriority` and now fails on
  `production-preview-drive.effect.moveAll` (count `1`).
- Remaining unsupported owners are now `production-preview-drive.chooseN` for
  `vc-baseline` `attack` (count `5`),
  `production-preview-drive.effect.if` for `nva-baseline` `terror`
  (count `2`), and `production-preview-drive.effect.moveAll` for
  `us-baseline` `coupCommitmentResolve` (count `1`).

Status remains `PENDING`; next implementation work should target the small
generic `moveAll` residual before reassessing the remaining dynamic `chooseN`
and condition buckets.

### 2026-05-03 — Generic filtered moveAll support added

Extended the production preview-drive compiler with generic `moveAll` support:

- `moveAll` now resolves deterministic source/destination zones, preserves
  moved-token source order at the front of the destination zone, applies
  zone-entry resets, and enforces stacking constraints through the same helper
  surface used by token moves.
- Filtered `moveAll` now evaluates the existing generic condition evaluator
  with a preview-local `$token` binding, so token-property filters remain
  generic and fail closed if the condition cannot resolve deterministically.
- Focused preview-driver coverage now includes `moveAll` in the same
  token-mutation production preview-drive witness as `removeByPriority`.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-filtered-move-all-inventory`

Latest decisive FITL inventory remains red:

- `productionApplicationPublication supportedByEncodedPreviewDriveAbi=false`
- `productionPreviewDriveSubstrateSupported=false`
- `failClosedClass=unsupported-effect`
- Newly supported action bucket: `us-baseline` `coupCommitmentResolve`,
  proving the filtered `moveAll` slice is live.
- Remaining unsupported owners are now `production-preview-drive.chooseN` for
  `vc-baseline` `attack` (count `5`) and
  `production-preview-drive.effect.if` for `nva-baseline` `terror`
  (count `2`).

Status remains `PENDING`; next implementation work should inspect the live
`terror` condition shape before choosing between a small generic condition
extension and the larger dynamic `chooseN` bound semantics for `attack`.

### 2026-05-03 — Zone-variable condition reads added

Extended the deterministic condition/value evaluator with generic read-only
`zoneVar` value support:

- Scalar expression evaluation can now resolve `{ ref: "zoneVar" }` through
  the preview-local zone selector and current `GameState.zoneVars`.
- Focused preview-driver coverage now proves zone-variable reads inside the
  same deterministic `if` condition path as marker-state reads.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-zonevar-if-inventory`
- `pnpm -F @ludoforge/engine-wasm build`

Latest decisive FITL inventory remains red:

- `productionApplicationPublication supportedByEncodedPreviewDriveAbi=false`
- `productionPreviewDriveSubstrateSupported=false`
- `failClosedClass=unsupported-effect`
- The `nva-baseline` `terror` residual advanced from
  `production-preview-drive.effect.if` to
  `production-preview-drive.addVar`, reason
  `only matching global scalar addVar effects are supported`, proving the
  condition read slice is live and the next missing piece is zone-variable
  mutation/materialization rather than condition evaluation.
- Remaining unsupported owners are now `production-preview-drive.chooseN` for
  `vc-baseline` `attack` (count `5`) and
  `production-preview-drive.addVar` for `nva-baseline` `terror` (count `2`).

Status remains `PENDING`; next implementation work needs an explicit boundary
choice for generic zone-variable mutation support in the preview-drive
compiler, because that touches preview-local state materialization rather than
just scalar condition reads.

### 2026-05-03 — Preview-local zone-variable mutation added

Extended the production preview-drive compiler with generic preview-local
zone-variable state:

- Added preview-local `zoneVars` materialization alongside token-zone and
  marker state so deterministic query evaluation sees zone-variable mutations
  made earlier in the compiled production preview-drive pass.
- `addVar` and `setVar` now support `scope: "zoneVar"` for deterministic
  integer zone-variable writes, using generic zone selectors, scoped variable
  names, and the compiled `GameDef` zone-variable bounds.
- Scalar `zoneVar` reads now come from preview-local zone-variable state
  instead of the root `GameState`, so later conditions observe earlier
  zone-variable effects.
- Focused preview-driver coverage now proves a zone-variable mutation followed
  by a zone-variable condition read in the same WASM production preview-drive
  witness.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-zonevar-mutation-inventory`

Latest decisive FITL inventory remains red:

- `productionApplicationPublication supportedByEncodedPreviewDriveAbi=false`
- `productionPreviewDriveSubstrateSupported=false`
- `failClosedClass=unsupported-effect`
- Newly supported action bucket: `nva-baseline` `terror`, proving the
  zone-variable mutation/materialization slice is live.
- The only remaining unsupported owner is
  `production-preview-drive.chooseN` for `vc-baseline` `attack`
  (count `5`), reason `chooseN bounds must fit deterministic option count`.

Status remains `PENDING`; next implementation work should target generic
dynamic `chooseN` bound semantics for `attack`, with the kernel publication
contract as the proof boundary.

### 2026-05-03 — Dynamic chooseN bounds and final substrate proof

Extended the production preview-drive compiler and WASM preview-drive ABI with
generic underfilled `chooseN` semantics aligned to the kernel publication
contract:

- `chooseN` now encodes deterministic non-negative bounds even when the
  kernel-clamped maximum is below `min`; authored negative or internally
  inverted bounds still fail closed before scoring.
- The Rust preview-drive evaluator now returns a per-row `failed` outcome for
  underfilled greedy `chooseN` completions and skips later ops for those rows,
  matching the TypeScript preview runtime's `noPreviewDecision` behavior.
- Focused WASM coverage proves underfilled encoded `chooseN` rows fail without
  allowing later score mutations to leak through.

Verification:

- `pnpm -F @ludoforge/engine-wasm build`
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-choose-n-underfilled`

Final decisive FITL inventory is green for this prerequisite:

- `productionApplicationPublication supportedByEncodedPreviewDriveAbi=true`
- `previewStateSubstrateSupported=true`
- `productionPreviewDriveSubstrateSupported=true`
- `wasmScoreRowUnsupportedCount=0`
- `wasmPreviewCandidateFeatureRowUnsupportedCount=0`
- All 40 production application/publication profile/action buckets are
  supported, including `vc-baseline` `attack`.

This ticket's generic production preview-drive substrate prerequisite is
implemented. Successor ownership returns to `tickets/150FITLWASM-010.md` for
production routing, fail-closed route activation, and the same-seam perf gate.

## Architecture Check

1. The substrate must remain generic. No FITL-specific ids, card logic,
   branch tables, schemas, or bridge shortcuts may appear in TypeScript or
   Rust/WASM.
2. The one-rules protocol remains authoritative. Supported WASM preview-drive
   results must be equivalent to the kernel-owned publication/application
   contract for the supported subset; unsupported classes fail closed before
   scoring.
3. Determinism, boundedness, and immutability are required. WASM may mutate
   private buffers internally, but caller-visible state, replay identity, and
   preview outcomes must match the TypeScript reference.
4. This ticket may evolve the ABI, but it must not introduce a compatibility
   fallback in any route counted as WASM-supported production routing.

## What to Change

### 1. Generic production application/publication substrate

Design and implement the smallest generic encoded substrate that can execute
the production preview-drive transition classes needed by the current FITL
same-seam surface without TypeScript applying the candidate move or driving the
completion loop for a route counted as WASM-supported.

### 2. Preview-state materialization contract

Expose a generic output artifact that the TypeScript policy runtime can consume
without walking the TypeScript `GameState` object graph on the supported hot
path. The artifact may be an encoded preview-state buffer, generic preview
surface rows, or another buffer-oriented contract, but it must be sufficient
for `150FITLWASM-010` to route production scoring through the supported WASM
drive path.

### 3. Fail-closed diagnostics

Unsupported production preview-drive classes must reject deterministically
before scoring and report at least profile id, candidate count, unsupported
class, and owner. A TypeScript fallback result must not be merged into a result
path counted as WASM-supported.

### 4. Handoff back to production routing

When the substrate is proven, update `tickets/150FITLWASM-010.md`,
`tickets/149FITLEVNUMVM-016.md`, `tickets/149FITLEVNUMVM-022.md`, and
`archive/specs/150-fitl-policy-vm-wasm-port.md` so the successor graph returns to
production routing and the same-seam perf gate.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` or adjacent generic preview-drive helpers
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`
- `packages/engine/src/agents/policy-wasm-production-preview-values.ts`
- `packages/engine/src/agents/policy-wasm-preview-drive.ts`
- `packages/engine/src/agents/policy-wasm-runtime.ts`
- `packages/engine-wasm/policy-vm/src/preview_drive.rs`
- focused unit/integration witnesses near the preview-drive and WASM seams
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` if the proof harness needs a substrate diagnostic
- dependent tickets/specs listed above when the prerequisite unblocks

## Out of Scope

- Production policy scoring/routing through the new substrate; `150FITLWASM-010`
  owns that after this prerequisite is complete.
- Weakening the Spec 149 `<=250 ms` gate.
- FITL-specific opcodes, ids, schemas, or bridge branches.
- Default-flipping policy evaluation or deleting closure-tree infrastructure.

## Acceptance Criteria

### Tests That Must Pass

1. Focused parity witness proves supported generic production preview-drive
   substrate results match the TypeScript preview driver.
2. A FITL same-seam direct witness proves current production preview-drive
   classes are substrate-supported without relying on TypeScript-produced
   preview `GameState` materialization for the route counted as supported, or
   records exact residual fail-closed classes and successor owner.
3. Unsupported production preview-drive classes fail closed with deterministic
   diagnostics and no TypeScript fallback merge.
4. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
5. Existing suite: `pnpm -F @ludoforge/engine build`.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the supported
   hot FFI path.
2. Preview outcomes, depth caps, stochastic exits, hidden-sampling behavior,
   rollback/recovery compatibility, and replay identity remain equivalent to
   the TypeScript reference for supported classes.
3. Unsupported classes are deterministic and fail closed rather than merged
   with TypeScript fallback rows.

## Test Plan

### New/Modified Tests

1. Focused preview-drive/WASM parity tests for the production substrate.
2. Focused unsupported-class fail-closed tests for diagnostics and no fallback
   merge.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused production preview-drive substrate parity test command.
4. Focused unsupported-class fail-closed test command.
5. A FITL same-seam direct witness or inventory command proving the route no
   longer depends on TypeScript preview `GameState` materialization for
   supported rows.

## Outcome

Completed on 2026-05-03.

What changed:

- Added a generic production preview-drive compiler/lowering boundary for
  action/action-pipeline effects into WASM preview-drive batches.
- Advanced the preview-drive ABI/layout and added generic scalar preview-state
  slot mutation plus per-row failed outcomes.
- Added generic deterministic support for the current FITL same-seam
  production application/publication classes: scalar expressions, runtime
  bindings, query-backed `chooseOne` / `chooseN`, `forEach`, token/object
  materialization, token moves/properties, marker shifts, zone-property
  conditions, `removeByPriority`, `moveAll`, zone-variable reads/writes, and
  underfilled `chooseN` completion failure semantics.
- Updated the profiling inventory to report the distinct
  `productionApplicationPublication` substrate surface.
- Updated `tickets/150FITLWASM-010.md`,
  `tickets/149FITLEVNUMVM-016.md`, `tickets/149FITLEVNUMVM-022.md`, and
  `archive/specs/150-fitl-policy-vm-wasm-port.md` so successor ownership returns to
  `150FITLWASM-010`.

Post-review correction:

- Propagated preview-local zone/token, marker, and zone-variable state out of
  `let` bodies, and extended the existing production preview-drive test fixture
  so a zone-variable mutation inside `let` is observed by a later condition.

Verification:

- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` — passed.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-post-review-let-state` — passed; `productionApplicationPublication supportedByEncodedPreviewDriveAbi=true`, `productionPreviewDriveSubstrateSupported=true`, all 40 production application/publication profile/action buckets supported, `wasmScoreRowUnsupportedCount=0`, and `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.

Deviations:

- Production policy scoring/routing through the new substrate remains out of
  scope and is owned by `tickets/150FITLWASM-010.md`.
- The Spec 149 `<=250 ms` same-seam performance gate remains unchanged and is
  not claimed by this prerequisite ticket.
