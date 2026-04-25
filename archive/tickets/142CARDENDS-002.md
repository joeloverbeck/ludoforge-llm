# 142CARDENDS-002: Generic non-FITL regression for Future-Stream Class-Filter Pattern

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — tests only
**Deps**: `specs/142-card-driven-campaign-end-semantics.md`

## Problem

Spec 142 Testing Requirement #4 requires a generic kernel/terminal test exercising future-card-class terminal semantics outside FITL-specific fixtures. Today, terminal tests under `packages/engine/test/` are either generic kernel invariants without future-stream class semantics (e.g., `terminal.test.ts`, `terminal-phase-gating.test.ts`) or FITL-specific integrations (`fitl-coup-victory-phase-gating.test.ts`).

A genuine cross-game regression of the Future-Stream Class-Filter Pattern is missing. Without it, the architectural contract that the FITL encoding exemplifies is proven only for FITL — any future card-driven game could reintroduce the pre-FITLDETBOUND-001 bug (single-phase gate + single-zone emptiness check) without a generic regression catching it.

## Assumption Reassessment (2026-04-24)

1. `terminalResult(def, state)` is the single kernel gate; `phase-advance.ts:687` runs `while (terminalResult(def, nextState, cachedRuntime) === null) { ... }` — validated during the Spec 142 reassessment earlier in this session.
2. `tokensInZone(zone, filter: {...})` with property filters (e.g. `{prop: <name>, op: eq, value: <value>}`) is the authored primitive used by the FITL production encoding — validated via `data/games/fire-in-the-lake/90-terminal.md:273-315`.
3. Existing terminal test venues: `packages/engine/test/unit/terminal.test.ts`, `packages/engine/test/unit/terminal-phase-gating.test.ts` — validated via directory listing during reassessment.
4. A new synthetic fixture is appropriate; no existing non-FITL fixture with a card-stream zone structure (`played:*`, `lookahead:*`, `deck:*`) exists to extend.
5. `.claude/rules/testing.md` requires every engine test file in `packages/engine/test/**/*.test.ts` to declare a file-top class marker (e.g. `// @test-class: architectural-invariant`). This test proves an architectural property over any card-driven game, so it is `architectural-invariant` — not `convergence-witness`.

## Architecture Check

1. Test uses a synthetic, minimal GameDef — no FITL data assets imported, no FITL-specific types. Foundation 1 (engine agnosticism) proven: the pattern works for any card-driven game, not only FITL.
2. Test uses only existing DSL primitives (`tokensInZone`, `phases`, aggregate `count`) — no new engine surface introduced. Foundation 15 preserved; matches Spec 142's explicit rejection of new DSL keywords.
3. Fixture tags future-stream cards by an arbitrary property (not `isCoup`), decoupling the test from any FITL-specific property name and proving the pattern is property-agnostic.
4. Test is an `architectural-invariant` per `.claude/rules/testing.md` — it proves a property that must hold across every legitimate card-driven GameDef, not a trajectory-specific witness.

## What to Change

### 1. Construct a synthetic minimal GameDef fixture

The fixture must model a card-driven turn flow that the existing `phase-advance` loop and `terminalResult` pipeline can execute without any FITL-specific adaptation:

- **Zones**: `played:none`, `lookahead:none`, `deck:none` — mirrors the card-slot shape that `phase-advance` uses for card reveal/publication ordering.
- **Phases**: at least two phases where the terminal boundary can fire (call them e.g. `phaseA` and `phaseB`) — this exercises the multi-phase gating rule of the Future-Stream Class-Filter Pattern.
- **Token types**: at least two card types tagged by an arbitrary property (e.g. `class: "special"` vs `class: "ordinary"`). Do NOT use `isCoup` or any FITL-specific property name.
- **Terminal checkpoint**: uses the Future-Stream Class-Filter Pattern verbatim:
  - `phases: [phaseA, phaseB]`
  - `when:` counts `class == "special"` tokens across `played:none` (== 1), `lookahead:none` (== 0), and `deck:none` (== 0), combined with `op: and`.

Use helpers under `packages/engine/test/helpers/` or `packages/engine/test/fixtures/` where they match — verify existing synthetic-GameDef construction patterns during implementation and extend rather than duplicate. If no suitable helper exists, inline the fixture in the test file.

### 2. Author the regression

Place the test at `packages/engine/test/unit/terminal-future-stream-class-filter.test.ts` with a file-top class marker:

```ts
// @test-class: architectural-invariant
```

Author two assertion cases:

1. **Class exhaustion → checkpoint fires in the expected phase**. Seed the fixture so:
   - `played:none` contains one `class: "special"` token (the "current" final-class card).
   - `lookahead:none` and `deck:none` contain only `class: "ordinary"` tokens.
   - Current phase is `phaseA` (or iterate across `[phaseA, phaseB]` to prove multi-phase gating).
   - Assert `terminalResult(def, state) !== null` and that the checkpoint id matches the authored one.
2. **No decision publication after the checkpoint fires**. After the checkpoint fires:
   - Invoke whichever kernel surface advances the game (prefer the minimal path — e.g. call `phase-advance`'s public entry or `legalMoves` directly against the post-checkpoint state).
   - Assert no further decisions are published / no further cards are revealed / `legalMoves` returns empty or the state is unchanged.

### 3. Forward-reference from the convention doc

Once `142CARDENDS-001` lands (or during concurrent implementation), add a one-line reference from the convention doc pointing to this test file as the generic invariant. If `142CARDENDS-002` lands first, the cross-reference is added during `142CARDENDS-001`'s implementation; if `142CARDENDS-001` lands first, add the forward-reference here during this ticket's implementation.

## Files to Touch

- `packages/engine/test/unit/terminal-future-stream-class-filter.test.ts` (new)
- Possibly `packages/engine/test/helpers/` or `packages/engine/test/fixtures/` (modify) — only if an existing synthetic-GameDef helper is the natural extension point; verify via directory listing and grep during implementation.

## Out of Scope

- FITL-specific fixtures, imports, type references, or property names (`isCoup`, `isMonsoon`, etc.).
- New engine primitives, DSL keywords, or schema changes.
- Modifying the FITL production encoding (`data/games/fire-in-the-lake/90-terminal.md`) or the existing FITL regressions (`fitl-coup-victory-phase-gating.test.ts`).
- Modifying `phase-advance.ts`, `terminal.ts`, or any other kernel module — the test uses existing kernel surfaces only.
- Testing behaviors beyond the two acceptance cases (e.g., replay identity, multi-turn traces) — keep the regression minimal and focused on the two properties Spec 142 names.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/terminal-future-stream-class-filter.test.ts` passes via `pnpm -F @ludoforge/engine test:unit` (or the equivalent `node --test` invocation against compiled JS).
2. Existing FITL regressions at `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts:153,197` remain green.
3. Existing suite: `pnpm turbo test` (determinism corpus + full engine + runner suites remain green).

### Invariants

1. The test imports zero FITL-specific types, fixtures, or game data.
2. The test uses only `tokensInZone(zone, filter)` and other existing DSL primitives — no new DSL keywords introduced.
3. The test exercises both required cases: (a) class exhaustion → checkpoint fires in the expected phase; (b) no decision publication after the checkpoint.
4. The test declares `// @test-class: architectural-invariant` at the file top per `.claude/rules/testing.md`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/terminal-future-stream-class-filter.test.ts` (new) — generic architectural-invariant test with the two assertion cases described in §What to Change.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit` — targeted run of the new test.
3. `pnpm -F @ludoforge/engine test:integration` — confirms FITL regressions remain green.
4. `pnpm turbo test` — full suite including determinism/canary corpus.
5. `pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed on 2026-04-24.

- Added `packages/engine/test/unit/terminal-future-stream-class-filter.test.ts` as the generic, non-FITL architectural invariant for the Future-Stream Class-Filter Pattern.
- The test uses a synthetic card-driven `GameDef` with arbitrary `class: "special"` / `class: "ordinary"` card properties, not FITL fixtures or FITL-specific property names.
- The regression proves both required cases: the final-class checkpoint fires across both authored phases when only ordinary future cards remain, and `advanceToDecisionPoint` does not advance phase, reveal another card, or emit lifecycle logs once the checkpoint is terminal.
- Since `142CARDENDS-001` had already landed, updated `docs/card-driven-terminal-authoring.md` to cite this generic invariant test by path.
- Engine/schema/artifact fallout: none.

Verification set:

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/terminal-future-stream-class-filter.test.js` from `packages/engine/`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm test`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`
