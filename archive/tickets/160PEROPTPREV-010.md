# 160PEROPTPREV-010: Cookbook documentation for `preview.inner` and `preview.option.*`

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — docs-only
**Deps**: `archive/tickets/160PEROPTPREV-005.md`, `archive/tickets/160PEROPTPREV-006.md`, `archive/tickets/160PEROPTPREV-007.md`

## Problem

Spec 160 introduces a new authoring surface (`preview.inner` config + `preview.option.*` ref family) that operators encode in profile YAML. Without cookbook coverage, operators discovering Spec 160's capability through ticket history would have to reverse-engineer the feature from the schema and tests. The cookbook is the canonical operator-facing reference (`docs/agent-dsl-cookbook.md`).

This ticket adds documentation for `preview.inner` configuration, the eight `preview.option.*` refs, and a worked example showing a govern-mode chooseOne with a `preferOptionProjectedMargin` consideration that flips an option choice based on per-option projected margin.

## Assumption Reassessment (2026-05-06)

1. The cookbook lives at `docs/agent-dsl-cookbook.md` (24387 bytes per reassess-spec).
2. Tickets 005-007 have landed the full feature; the cookbook documents working behavior.
3. Existing cookbook conventions establish the format: per-feature section with config snippet, ref enumeration, and a worked example.

## Architecture Check

1. **Specs are data** (Foundation 7): cookbook documents declarative configuration only — no executable code is documented as authorable.
2. **Engine-agnostic** (Foundation 1): the worked example uses generic ref names; FITL identifiers appear only in the example itself, framed as illustrative.
3. **Documentation discipline**: cite the spec by number (Spec 160) and the relevant FOUNDATIONS principles (F#10 boundedness, F#19 granularity uniformity) so operators can trace provenance.

## What to Change

### 1. New cookbook section: `preview.inner` configuration

Add a section to `docs/agent-dsl-cookbook.md` covering:

- The opt-in flags (`chooseOne`, `chooseNStep`) and their defaults (`false`).
- The triple-product budget (`maxOptions × chooseNBeamWidth × depthCap`) and the hard cap (`INNER_PREVIEW_HARD_CAP = 256`).
- The compile-time warning emitted when `chooseOne: true` is set without a `preview.option.*` consideration (ticket 008).

### 2. New cookbook section: `preview.option.*` ref family

Enumerate the eight ref kinds with one-sentence descriptions:

- `preview.option.victory.currentMargin.self` — projected victory margin after the option.
- `preview.option.victory.currentRank.self` — projected rank.
- `preview.option.delta.victory.currentMargin.self` — change in margin (post-option − pre-option); the high-leverage signal.
- `preview.option.var.global.<id>` — projected global variable value.
- `preview.option.var.player.self.<id>` — projected per-player variable.
- `preview.option.metric.<id>` — projected metric value.
- `preview.option.outcome` — drive outcome (`'ready'`, `'hidden'`, `'depthCap'`, etc.).
- `preview.option.driveDepth` — depth reached.

Note hidden-info handling: refs touching hidden surfaces surface as `previewOutcome: 'hidden'` (Foundation 4).

### 3. Worked example: govern-mode `preferOptionProjectedMargin`

Show a govern-mode chooseOne profile snippet with:

- `preview.inner.chooseOne: true`
- A microturn-scope consideration `preferOptionProjectedMargin` with `weight: 300` and a `value` policy expression referencing `preview.option.delta.victory.currentMargin.self`
- Brief commentary explaining how this flips the agent from greedy alphabetical (`aid`) to the option whose projected margin delta is highest.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify — add three sections per above)

## Out of Scope

- Schema reference documentation — that lives in the schema artifacts, not the cookbook.
- Game-specific FITL profile changes — the worked example is illustrative; production FITL profile changes would be a separate spec.
- Migrating other cookbook examples to use `preview.inner` — out of scope; existing examples remain valid.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo lint` — markdown lint (if applicable to docs).
2. Manual verification: the worked example's YAML snippet validates against the schema (ticket 003) and triggers the chooseOne driver path (ticket 005) when compiled.
3. Existing engine and runner suites: `pnpm turbo test`.

### Invariants

1. The cookbook's `preview.inner` section references Spec 160 by number and Foundation 10 + Foundation 19 explicitly.
2. The eight `preview.option.*` refs are documented in the same order as registered in `feature-table.ts` (consistency for readers cross-referencing).

## Test Plan

### New/Modified Tests

- None — docs-only ticket.

### Commands

1. `pnpm turbo lint`
2. Manual: copy the worked-example snippet into a test diagnostic profile and confirm it compiles + triggers the driver.

## Outcome

Completed on 2026-05-07.

- Landed docs-only cookbook coverage in `docs/agent-dsl-cookbook.md`.
- Added a `preview.inner` configuration section covering `chooseOne`, `chooseNStep`, `maxOptions`, `chooseNBeamWidth`, `depthCap`, the `maxOptions * chooseNBeamWidth * depthCap <= 256` hard cap, and the warning for `chooseOne: true` without a microturn `preview.option.*` consideration.
- Added a `preview.option.*` reference table in the same order as `PREVIEW_OPTION_REF_KIND_CODE` in `packages/engine/src/cnl/policy-bytecode/feature-table.ts`.
- Added a govern-mode `preferOptionProjectedMargin` worked example using `preview.option.delta.victory.currentMargin.self`.
- Boundary corrections: hidden-info wording follows the live implementation's existing hidden preview outcome and hidden outcome breakdown; no schema/code/profile migration is owned by this docs-only ticket.
- Manual validation plan: use the existing Spec 160 diagnostic FITL profile and golden test, which already compile the `preferOptionProjectedMargin` diagnostic profile and prove the inner-preview driver is active.
- Verification:
  - `rg -n 'Spec 160|Foundation 10|Foundation 19|preview\.option\.victory\.currentMargin\.self|preview\.option\.victory\.currentRank\.self|preview\.option\.delta\.victory\.currentMargin\.self|preview\.option\.var\.global\.<id>|preview\.option\.var\.player\.self\.<id>|preview\.option\.metric\.<id>|preview\.option\.outcome|preview\.option\.driveDepth|preferOptionProjectedMargin' docs/agent-dsl-cookbook.md` — passed; all required cookbook anchors present.
  - `git diff --check` — passed.
  - `pnpm -F @ludoforge/engine build` — passed.
  - `node --test dist/test/integration/policy-preview-inner-fitl-canary-golden.test.js` from `packages/engine` — passed; 1 test.
  - `pnpm turbo lint` — passed; 2 tasks successful.
  - `pnpm turbo test` — passed; 5 tasks successful.
  - `pnpm run check:ticket-deps` — passed; 1 active ticket and 2266 archived tickets checked.
- No-invalidation: terminal status/proof transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, or dependency classification changed after the final proof lanes.
- No-invalidation after dependency-check transcription: checker-result transcription only; no ticket graph, scope, acceptance, command semantics, touched-file ownership, proof claim, follow-up ownership, or dependency classification changed.
