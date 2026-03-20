# 15GAMAGEPOLIR-004: Add Policy Visibility Metadata and Canonical Seat Binding Validation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler/kernel visibility and seat-resolution contracts
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-001-add-authored-agents-section-to-gamespecdoc.md, archive/tickets/15GAMAGEPOLIR-002-lower-agent-parameters-profiles-and-bindings.md

## Problem

Spec 15 explicitly forbids hidden-information leaks and player-index-based seat semantics. Until the engine classifies policy-visible authored surfaces and validates bindings against resolved canonical seat ids, compiled policies can still cheat or bind incorrectly.

## Assumption Reassessment (2026-03-19)

1. The current repo already has authored agent-policy lowering in `packages/engine/src/cnl/compile-agents.ts` and a seat-identity contract built in `packages/engine/src/cnl/compiler-core.ts` via `buildSeatIdentityContract(...)`.
2. `packages/engine/src/kernel/seat-resolution.ts` is only a re-export shim today; it is not the architectural seam where authored policy binding validation belongs.
3. The current policy-visible runtime surface is already syntactically gated to explicit refs such as `metric.*`, `victory.currentMargin.*`, `victory.currentRank.*`, `var.global.*`, `var.seat.*`, `seat.*`, `turn.*`, `candidate.*`, and limited `preview.*`. That means raw hidden state traversal and `visual-config.yaml` access are already rejected as unsupported refs, even though no explicit `public` / `seatVisible` / `hidden` metadata has been added yet.
4. The real gap is narrower: authored `agents.bindings` are currently validated only against known profile ids, not against the resolved canonical seat ids selected by the scenario/seat-catalog pipeline.
5. Corrected scope: keep the existing approved policy surface model, strengthen tests around forbidden refs, and add canonical-seat binding validation in the compiler. Do not add preview execution or broaden the policy runtime surface in this ticket.

## Architecture Check

1. Reusing the existing seat-identity contract is cleaner than introducing a second policy-specific seat resolver or pushing authored binding checks into the kernel shim layer.
2. Resolving bindings against canonical seats preserves authored seat semantics across scenario selection and prevents player-order coupling.
3. The current explicit allowlist of policy runtime refs is already a cleaner boundary than trying to special-case hidden state or `visual-config.yaml`; strengthen that boundary instead of broadening it.
4. No game-specific visibility branches or seat remapping hacks should be introduced.

## What to Change

### 1. Validate policy refs against the approved policy-visible surface

Reject policy refs that target:

- hidden data
- visual config/presentation metadata
- raw state traversal not surfaced as vars/metrics/public metadata

Use the existing compiler allowlist boundary rather than adding new policy-only runtime escape hatches.

### 2. Bind authored policies against canonical resolved seats

Validate authored bindings only after scenario/seat-catalog resolution and reject:

- unresolved canonical seat resolution
- authored bindings for absent seats
- authored bindings that can only be interpreted positionally/player-index-wise

## File List

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)

## Out of Scope

- preview caching/execution
- score/pruning runtime
- runner UI changes
- FITL/Texas authored baseline profiles

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` rejects unsupported policy refs that attempt to reach presentation-only or raw-state paths, and continues rejecting preview-unsafe refs.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves authored policy bindings validate against canonical scenario-selected seat ids and reject unresolved/absent seat-catalog resolution.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Hidden information unavailable to the acting seat is not admitted into compiled policy refs via unsupported raw-state/presentation refs.
2. Policy semantics are seat-based, not player-index-based.
3. `visual-config.yaml` remains presentation-only and cannot influence policy compilation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — forbidden-ref coverage and canonical seat-binding rejection paths.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- Actual changes:
  - Corrected the ticket scope to match the real architecture: canonical seat validation belongs in the CNL compiler path, not the kernel seat-resolution shim.
  - Reused the existing seat-identity contract from `compiler-core` and validated `doc.agents.bindings` against resolved canonical seat ids during agent lowering.
  - Added explicit compiler diagnostics for unresolved seat-catalog-backed binding validation and for bindings that target seats absent from the resolved canonical seat catalog.
  - Strengthened existing authoring tests to cover valid canonical-seat-backed bindings, missing seat-catalog resolution, unknown canonical seats, and unsupported presentation/raw-state refs.
- Deviations from original plan:
  - No new generic `public` / `seatVisible` / `hidden` metadata was added because the current policy-visible runtime surface already rejects unsupported raw-state and presentation refs by allowlist.
  - No kernel `seat-resolution.ts` work was needed; that file remains a shim and was not the correct ownership boundary for this invariant.
  - The work stayed in existing compiler and authoring-test seams instead of introducing new test files.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
  - `pnpm turbo test`
