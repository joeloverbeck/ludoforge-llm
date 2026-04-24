# 142CARDENDS-001: Document the Future-Stream Class-Filter Pattern

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — docs only
**Deps**: `specs/142-card-driven-campaign-end-semantics.md`

## Problem

Spec 142 names a recurring pattern for authoring card-driven terminal conditions that query classes of future cards (e.g. "no future coup cards remain"). The pattern is currently implicit in the corrected FITL final-coup encoding at `data/games/fire-in-the-lake/90-terminal.md:273-315`, but nothing discoverable by convention name guides new authors (or LLM-generated specs) toward the right approach.

New card-driven games — or authored events that need similar class-exhaustion checks — risk repeating the pre-FITLDETBOUND-001 mistake: using zone-emptiness of a single zone as a proxy for class exhaustion, or gating a checkpoint to a single phase when the boundary can arise in multiple. This ticket makes the pattern discoverable by name and cross-linked to its production witness and regression tests.

## Assumption Reassessment (2026-04-24)

1. Spec 142 Design section defines the pattern in three numbered rules (phase-gating, future-stream class filter, current-card class filter) — validated in the spec file just written.
2. Production witness at `data/games/fire-in-the-lake/90-terminal.md:273-315` uses `tokensInZone(zone, filter: {prop: isCoup, op: eq, value: true})` across `played:none`, `lookahead:none`, and `deck:none` — validated during the Spec 142 reassessment earlier in this session.
3. Existing FITL regressions at `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts:153,197` cover the coupRedeploy and main-phase suppressed-coup cases — validated during reassessment.
4. Existing convention docs: `docs/agent-dsl-cookbook.md` (agent policy DSL only), `docs/fitl-event-authoring-cookbook.md` (FITL-specific event authoring), `docs/architecture.md`, `docs/FOUNDATIONS.md`. None currently covers cross-game terminal-checkpoint authoring. Exact placement is deferred to implementation to honor Spec 142's "co-locate with existing FITL/card-flow guidance" hint while preserving the cross-game framing.

## Architecture Check

1. Documentation-only: no compiler, schema, or engine surface changes. Foundation 15 preserved — the root cause addressed by FITLDETBOUND-001 was data, and the fix here is a naming convention over existing primitives.
2. Pattern names a generic card-driven concept using existing DSL primitives (`tokensInZone`, `phases`, aggregate `count`). Foundation 1 (engine agnosticism) preserved; no new engine keywords introduced; the convention applies to any future card-driven game.
3. No backwards-compatibility shims — the convention documents what the production FITL encoding already does as of FITLDETBOUND-001.

## What to Change

### 1. Select the convention's documentation venue

Decide among these candidates at implementation time. Grep `docs/` for existing "convention" / "pattern" / "authoring" sections to confirm the best fit:

- **Preferred**: new file `docs/card-driven-terminal-authoring.md`. Appropriate because the pattern is generic across card-driven games (FITL, future titles, Texas Hold'em card flow if extended). A standalone file is easily discoverable by name.
- **Alternative**: new subsection "Future-Stream Class-Filter Pattern (generic)" inside `docs/fitl-event-authoring-cookbook.md` with an explicit cross-game disclaimer. Appropriate if co-location with card-flow guidance outweighs the cross-game framing cost.
- **Not preferred**: `docs/agent-dsl-cookbook.md` — that doc is about agent policy DSL (scoring, heuristics, tie-breaking), not game-authoring YAML.

### 2. Document the Future-Stream Class-Filter Pattern

Follow Spec 142 Design §Future-Stream Class-Filter Pattern verbatim:

1. Phase-gating rule: `phases: [<every-phase-where-the-boundary-can-arise>]`. Include any phase where the boundary may arise because a coup-round (or equivalent) is suppressed.
2. Future-stream class-filter rule: count matching tokens across EVERY future-stream zone (typically `lookahead:*` and `deck:*`) via `tokensInZone(<zone>, filter: {<class-predicate>})`. Do NOT rely on zone-emptiness of a single zone as a proxy for class exhaustion.
3. Current-card class-filter rule: count matching tokens in the played zone (typically `played:*`) with the same class filter.

Include:
- An **anti-pattern** callout: "single-phase gate + single-zone emptiness check" is the pre-FITLDETBOUND-001 bug; the reader must understand why it fails.
- A citation to the canonical production witness: `data/games/fire-in-the-lake/90-terminal.md:273-315` (checkpoint id `final-coup-ranking`).
- Citations to the existing FITL regressions: `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts:153,197`.
- A forward reference to the generic non-FITL regression added in `142CARDENDS-002` (add the cross-reference during whichever ticket lands second, or update in both tickets' implementation sessions).

### 3. Cross-link from architecture/authoring overviews

Grep `docs/architecture.md` and `docs/project-structure.md` for existing terminal/retirement/authoring references. If any natural cross-link point exists, add a one-line link to the new convention.

## Files to Touch

- `docs/card-driven-terminal-authoring.md` (new) — preferred venue; final venue decided at implementation time per §1.
- `docs/fitl-event-authoring-cookbook.md` (modify) — fallback venue if standalone file is rejected; or add a short "see also" cross-link pointing to the new file.
- `docs/architecture.md` (possibly modify) — for a cross-link from the terminal/retirement section if one exists; verify via grep during implementation.

## Out of Scope

- New DSL keywords (`currentCard`, `futureCards`, `futureCardsMatching`). Spec 142 explicitly rejects these via Foundation 15 — the production witness proves existing primitives suffice.
- Engine, compiler, or schema changes.
- Renaming or moving the production FITL witness or existing regressions.
- Changing `phase-advance.ts`, `terminal.ts`, or any other kernel module.
- Authoring the generic non-FITL regression — that is `142CARDENDS-002`'s deliverable.

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm turbo lint` (catches markdown-lint or link-check regressions if configured).
2. Existing suite: `pnpm turbo test` (no regressions; documentation change should not affect any test).

### Invariants

1. The convention is discoverable by name: `grep -rn "Future-Stream Class-Filter Pattern" docs/` returns at least one hit in the new/modified venue.
2. The convention cites the production witness by file+line (`data/games/fire-in-the-lake/90-terminal.md:273-315`).
3. The convention cites the existing FITL regressions by file+line (`fitl-coup-victory-phase-gating.test.ts:153` and `:197`).
4. The convention includes an anti-pattern callout describing the pre-FITLDETBOUND-001 bug (single-phase gate + single-zone emptiness check).

## Test Plan

### New/Modified Tests

None — documentation-only.

### Commands

1. `grep -rn "Future-Stream Class-Filter Pattern" docs/` — confirm discoverability by name.
2. `grep -rn "90-terminal.md:273-315" docs/` — confirm witness citation landed.
3. `grep -rn "fitl-coup-victory-phase-gating" docs/` — confirm regression citations landed.
4. `pnpm turbo lint`
5. `pnpm turbo test` (confirm no incidental breakage)

## Outcome

Completed on 2026-04-24.

- Added the standalone generic convention doc at `docs/card-driven-terminal-authoring.md`.
- Cross-linked the convention from `docs/fitl-event-authoring-cookbook.md` and `docs/architecture.md`.
- Kept this ticket documentation-only; `142CARDENDS-002` remains the owner for the generic non-FITL regression.
- Schema/artifact fallout: none.

Verification set:

1. `grep -rn "Future-Stream Class-Filter Pattern" docs/`
2. `grep -rn "90-terminal.md:273-315" docs/`
3. `grep -rn "fitl-coup-victory-phase-gating" docs/`
4. `pnpm turbo lint`
5. `pnpm turbo test`
