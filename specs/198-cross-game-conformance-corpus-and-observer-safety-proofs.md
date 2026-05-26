# Spec 198 — Cross-Game Conformance Corpus and Observer-Safety Proofs

**Status**: PROPOSED
**Priority**: High — Foundation #16 literally mandates "a conformance corpus spanning materially different game families: at minimum one perfect-information board game, one hidden-information card game, one stochastic game, and one asymmetric or phase-heavy game." The repo today has FITL (asymmetric phase-heavy) and Texas Hold'em (hidden + stochastic). The perfect-information board game is missing, and no architectural-invariant tests exercise the agent layer across game families. This spec closes that gap and, as a downstream benefit, becomes the vehicle for the second-iteration audit's observer-safety proofs (proposal #8) and authoring-error negative tests (proposal #11) — neither of which has a productive home until the corpus exists.
**Complexity**: M–L — authoring one new minimal perfect-info board game data spec, building a cross-family architectural-invariant test surface, and adding authoring-error negative-test infrastructure. No engine changes for the corpus itself; observer-safety proofs may surface engine bugs that are then fixed in scope.
**Date**: 2026-05-26
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED — agent layer the corpus exercises)
- `archive/specs/187-whole-turn-posture-and-ally-rival-metadata.md` (COMPLETED)
- `archive/specs/190-plan-primary-root-selection.md` (COMPLETED — plan root authority)
- `archive/specs/191-plan-role-semantic-integrity.md` (COMPLETED — `targetKind` validation surface that authoring-error negative tests exercise)
- `archive/specs/170-partial-visibility-observer-policy.md` (COMPLETED — observer policy that hidden-info conformance asserts)
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED — role-constraint registry extended beyond `notEqual`; authoring-error negative tests exercise the extended registry)
- `archive/specs/197-doctrine-gated-plan-template-eligibility.md` (COMPLETED — `enablesPlanTemplates` field; authoring-error negative tests exercise unknown-id rejection)

**Trigger reports**:
- `reports/ai-agent-policy-overhaul-second-iteration.md` (ChatGPT-Pro second iteration, 2026-05-26). Adopts proposals #8, #10, #11; this spec is their joint operationalization. Spec 191 §11 deferred a formal hidden-info validation enum until the conformance hidden-info card game existed to exercise it — i.e., the corpus is the architectural vehicle. Now that Spec 191 has landed, this spec authors the corpus and the proof harness on top of it.
- `reports/fitl-competent-agent-ai.md` — supplies hidden-info / asymmetric requirements that the corpus must keep proving on FITL alongside the new game families.

**Ticket namespace**: `198GAMECONFCORP`

---

## 1. Goal

Make Foundation #16's conformance corpus exist, and use it to prove agent-layer invariants across game families. Concretely:

1. **Author one minimal perfect-information board game data spec** (e.g., a small competitive control game — *not* a full chess port, but a generic perfect-info game with role-bound targets and bounded turns) sufficient to exercise the agent layer end-to-end. Targets ~150-300 lines of YAML and a handful of fixtures.
2. **Treat the existing FITL and Texas Hold'em data as the asymmetric/phase-heavy and hidden+stochastic axes** respectively. Add the conformance-test harness that loads them as test corpora.
3. **Build a cross-family architectural-invariant test surface** that asserts the agent layer's contracts on every corpus game: legality publication, plan controller frontier authority, observer-safety on selectors/previews/posture/trace fields, determinism, replay identity.
4. **Add authoring-error negative-test infrastructure** that, for each new validation surface (Spec 191's `targetKind`, Spec 196's role-constraint registry, Spec 197's eligibility gating), confirms compile-time rejection of malformed authoring.
5. **Promote observer-safety proofs from informal expectation to enforced invariant**: the test harness asserts every selector source, preview ref, posture evaluator, and trace field carries observer-scope evidence at the agent's declared scope (Foundation #4 + #20).

## 2. Non-Goals

- **No competitive agent tuning per game.** The corpus exercises *legality and architecture*, not agent quality. A randomly-played game in the perfect-info board game terminates correctly; the corpus does not require the agent to *win* the game.
- **No replacement of FITL as primary stress test.** FITL convergence witnesses remain the agent-quality benchmark; the corpus is the architectural-conformance harness.
- **No new engine primitives.** If a corpus game requires a primitive the engine lacks, that's an out-of-scope finding (recorded in §11 as a deferred concern), not a corpus failure.
- **No new visual config.** Corpus games may have minimal or no `visual-config.yaml`; runner integration is not required.
- **No full re-authoring of Texas Hold'em.** This spec adds conformance witnesses *over* Texas Hold'em as it stands; if witnesses surface engine bugs, those are fixed; if they surface authoring gaps in Texas Hold'em, those are deferred (named in §11).

## 3. Context (verified against codebase, 2026-05-26)

- **Foundation #16 corpus requirement** (`docs/FOUNDATIONS.md:103-107`): "Game-agnosticism is proven by a conformance corpus spanning materially different game families: at minimum one perfect-information board game, one hidden-information card game, one stochastic game, and one asymmetric or phase-heavy game."
- **Current corpus coverage** (`data/games/` inspection):
  - **FITL** — asymmetric, phase-heavy (4 factions, monsoon/coup turn structure, COIN insurgent asymmetry). Covers axis 4.
  - **Texas Hold'em** — hidden-information (private hole cards) + stochastic (community-card reveal). Covers axes 2 + 3 partially. Spec 33 archived.
  - **Perfect-information board game** — *MISSING*. No `data/games/<name>/` directory satisfies this axis.
- **Observer-safety machinery** — `archive/specs/170-partial-visibility-observer-policy.md` (COMPLETED) introduced the partial-visibility observer policy and its compile-time enforcement. `Foundations #4` mandates the contract; `Foundations #20` (preview signal integrity) extended it to previews via Spec 162/180. Today, no architectural-invariant test asserts the contract holds across every selector source / preview ref / posture evaluator / trace field — observer-safety is enforced piecemeal where authors remember to consider it.
- **Authoring-error negative tests** — Specs 191, 196, and 197 (all COMPLETED) introduce new validation surfaces. Each spec's own test plan covers happy-path validation. Cross-cutting negative-test coverage (which kinds of malformed authoring fail with which diagnostic) lives nowhere coherent today.
- **Agent layer entry points** — `policy-agent.ts`, `plan-proposal.ts`, `plan-controller.ts`, `policy-posture-eval.ts`, `policy-selector-eval.ts`, `policy-relationship-eval.ts` are the surfaces the cross-family harness exercises. Each takes an `input.def` (GameDef) and `input.state` (GameState); the harness invokes them against each corpus game and asserts cross-cutting invariants.
- **Test harness convention** — `packages/engine/test/architecture/` holds architectural-invariant tests; `@test-class: architectural-invariant` per `.claude/rules/testing.md`. New conformance tests land here.

## 4. Architecture

### 4.1 Minimal perfect-info board game spec

Author `data/games/<name>/` for a generic small perfect-info board game. Candidate shapes (final choice deferred to implementation; whichever is the smallest valid spec that exercises route/zone/token roles and bounded turns):

- **Generic Race**: 2-player zone-graph race-to-target with movement actions. Tokens occupy zones; legal moves are `move(token, adjacentZone)`; terminal when one player's token reaches the designated target zone. Exercises adjacency, zone-bound targets, deterministic turn order, terminal conditions.
- **Generic Capture**: 2-player capture-on-overlap. Tokens move into adjacent zones; if landing on opponent's token, opponent's token is removed; terminal when one player has zero tokens.
- **Generic Control**: 2-player control-majority with placement + movement. Players alternately place or move tokens; terminal when a chosen zone-set is uniformly controlled.

Selection criterion: pick the spec whose minimal authoring covers the largest fraction of the agent layer's surfaces (selectors, role constraints, posture, plan templates with composed turns). Implementation chooses; the architectural choice is "minimal but cross-cutting."

Author conventions to follow:
- All rule-authoritative data in GameSpecDoc YAML (Foundation #2).
- Generic `dataAssets` for any auxiliary game data (Foundation #6).
- Public observability — *no* hidden information (this is the perfect-info axis).
- One or two minimal agent profiles to exercise the agent layer.

### 4.2 Cross-family architectural-invariant test surface

Add `packages/engine/test/architecture/cross-family-conformance.test.ts` (and supporting files) that:

1. **Loads each corpus game** (FITL, Texas Hold'em, the new perfect-info spec) into a small fixture set.
2. **Per-game architectural-invariants**:
   - Compiler determinism: compile twice, byte-identical GameDef.
   - Legality publication: every published microturn frontier is finite and contains atomic decisions.
   - Plan controller frontier authority (where the game has an agent profile with plan templates): every plan-controller decision is in the published legal frontier.
   - Replay identity: same `(GameDef, seed, actions)` produces canonically-identical state.
3. **Cross-game property tests**: bounded fuzzed games (e.g., 20 random-seed games per corpus game, each bounded to 50 microturns) terminate without unhandled engine errors.

### 4.3 Observer-safety invariant proofs

Add `packages/engine/test/architecture/observer-safety-invariants.test.ts` asserting:

1. **Selector source observer scope**: for every selector source kind (`collection`, `product`, `routePairs`, `subset`, `candidateParams`, `microturnOptions`), evaluating against a state with hidden zones/tokens/cards returns only observer-visible items at the agent's scope. Hidden items are absent from the evaluated set; their absence does not leak (the agent cannot distinguish "no item exists" from "item exists but is hidden").
2. **Preview ref provenance** (Foundation #20): every preview ref consulted by the proposer/controller exposes `status: ready | unknown | hidden | stochastic | unresolved | failed | depth-capped | partial` per Foundation #20; no preview ref silently coerces unavailable status to a scalar contribution. The architectural-invariant test asserts the *semantic property* — every preview ref carries a typed status, and any non-`ready` status carries a declared fallback path or runtime advisory — not the literal abstract-vocabulary set, since the implementation enum (`PolicyWasmPreviewStatus` in `packages/engine/src/agents/policy-wasm-preview-drive.ts`, schema `previewStatus` in `packages/engine/src/kernel/schemas-core.ts`) is richer and uses concrete names (`gated`, `depthCap`, `postGrantCap`, `freeOperationCap`, `grantFlowPartial`, `noPreviewDecision`).
3. **Posture evaluator observer scope**: posture evaluators consult only observer-safe state; tests assert that posture deltas on hidden information are absent rather than guessed.
4. **Trace field observer scope**: plan trace fields that surface evidence (active doctrines, role bindings, rejected alternatives, guardrail effects) do not leak hidden information to the receiving observer.

These are exercised primarily against **Texas Hold'em** (hidden info present) and a **synthesized hidden-info fixture variant of the new perfect-info spec** (artificially marking some zone contents hidden to drive the harness on a smaller, cleaner test bed than FITL).

### 4.4 Authoring-error negative-test infrastructure

Add `packages/engine/test/architecture/authoring-error-negatives.test.ts` covering:

- **Unsupported role-constraint kind** (Spec 191 + Spec 196): an authored constraint with an unknown kind fails compile with a role/template-named diagnostic. Coverage spans the pre-Spec-196 `notEqual`-only registry AND the post-Spec-196 extended registry.
- **`targetKind` mismatch** (Spec 191 P2): step's `targetKind` does not align with its selector result type; compile fails.
- **Out-of-range `stageIndex`** (Spec 191 P2): authored `stageIndex` exceeds template max steps.
- **Ungrantable compound timing** (Spec 191 P3).
- **Unknown `enablesPlanTemplates` id** (Spec 197 §4.3).
- **Unbounded subset / route pair without cap** (Foundation #10).
- **Missing observer-scope declaration on a card selector** (Foundation #4).
- **Hidden preview ref without authored fallback** (Foundation #20).

Each test asserts the diagnostic message identifies the offending authoring element by name (role/template/module) and replays byte-identically.

## 5. Determinism and replay (Foundations #8, #16)

- New corpus game compiles deterministically; `pnpm turbo build` twice byte-identical.
- Cross-family fuzz tests use seeded PRNG; reproducible failures.
- Observer-safety tests' synthesized hidden-info fixtures are deterministic.

## 6. Edge cases

- **Texas Hold'em conformance failures** — if the new harness surfaces existing observer-safety bugs in the Texas Hold'em data spec, fix the data spec in scope. If the bugs are engine-side, fix the engine; if they require new primitives, defer to a follow-on spec named in §11.
- **New perfect-info game cannot exercise some agent-layer surface** (e.g., it has no plan templates with composed turns) — the cross-family harness skips that invariant for that corpus game; the test names which invariants apply per game (matrix form).
- **Conformance tests are slow** — bound per-game fuzz to 20 games × 50 microturns; if total runtime exceeds CI lane budget, partition into a separate lane or down-sample.
- **Authoring-error negatives become stale as validation surfaces evolve** — each Spec that introduces a new validation surface (196, 197, future specs) is responsible for adding negative tests in scope; this spec establishes the harness shape, not an exhaustive permanent list.
- **The new perfect-info game's authoring choice is not aligned with the existing repo conventions** — the implementation runs the spec by the user before committing the final game choice; corpus exists in service of Foundation #16, not as a competitive game.

## 7. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Perfect-info board game data spec (§4.1) | New `data/games/<name>/` directory; minimal GameSpecDoc compiles deterministically; one minimal agent profile; one fixture game plays to terminal under a seeded random agent | M |
| **P2** | Cross-family architectural-invariant tests (§4.2) | `cross-family-conformance.test.ts` loads all 3 corpus games; per-game invariants pass; bounded fuzz terminates; matrix of which invariants apply per game documented in test | M |
| **P3** | Observer-safety invariant proofs (§4.3) | `observer-safety-invariants.test.ts` exercises selector/preview/posture/trace observer scope on Texas Hold'em + synthesized hidden-info fixture; engine bugs surfaced are fixed in scope or named for follow-up | M–L |
| **P4** | Authoring-error negative-test infrastructure (§4.4) | `authoring-error-negatives.test.ts` covers each enumerated negative case; each Spec-191/196/197 surface has at least one negative-test entry; diagnostic identity is replay-byte-identical | M |

## 8. Test plan

- **Conformance lane**: a new test class `@test-class: architectural-invariant` lane runs the cross-family + observer-safety + authoring-error tests on every CI run.
- **Compilation determinism**: per-corpus-game build-twice byte-identity.
- **Bounded fuzz termination**: per-corpus-game seeded fuzz games terminate within bounded turns.
- **Observer-safety positive-negative pairs**: for each Foundation-#4/#20 invariant, a positive test asserts safe behavior on a hidden-info state, and a negative test asserts the same invariant fails closed on a state synthesized to violate it (proving the invariant has discriminating power).
- **Authoring-error replay identity**: each negative-test diagnostic is golden-checked.

## 9. Foundation alignment

#1 (cross-family corpus proves engine agnosticism is real, not aspirational) · #4 (observer-safety enforced by automated proof, not assumed) · #6 (no per-game schema added by the new corpus game) · #8 (corpus games compile and replay deterministically) · #12 (authoring-error negatives validate every compile-time-knowable property) · #15 (architecturally complete coverage of Foundation #16's corpus mandate) · #16 (the spec literally implements Foundation #16's corpus requirement) · #20 (preview signal integrity proven by observer-safety test suite).

## 10. Reassessment of source proposal (`reports/ai-agent-policy-overhaul-second-iteration.md`)

**Adopted (this spec's slice):**
- §10 (proposal #10: cross-game conformance corpus) → §4.1 + §4.2.
- §10 (proposal #8: observer-safe target and preview validation proofs) → §4.3.
- §10 (proposal #11: authoring-error negative tests) → §4.4.

**Corrected:**
- The audit lists five game-family axes (perfect-info board, hidden-info card, stochastic, phase-heavy asymmetric, tactical target-heavy). Foundation #16 lists four — and `tactical target-heavy` is already exercised by FITL. The spec adopts the Foundation #16 four-axis taxonomy as authoritative; the fifth "tactical" axis is not a separate corpus axis but a property FITL already proves.
- The audit's expectation that the corpus is the home for proving observer-safety is correct (and matches Spec 191 §11's note); this spec operationalizes that connection.

**Deferred (named follow-ups, not in this spec):**
- A *stochastic-axis-pure* game (currently only Texas Hold'em covers it, mixed with hidden info). Uncommitted until a concrete need surfaces that the mixed coverage cannot satisfy.
- Per-observer-scope test matrices (each scope gets its own invariant lane) — current scope is a single representative observer per fixture.
- Other proposals owned by sibling specs (constraints/route → Spec 196; doctrine gating → Spec 197; compound availability → Spec 199).

**Rejected (with rationale):**
- Authoring per-game agent tuning to win — out of scope; Foundation #16 corpus is about architectural agnosticism, not competitive quality.
- Adding a full chess port — disproportionate to the architectural need; a minimal perfect-info spec covers the axis at a fraction of the authoring cost.

## 11. Out of scope (named follow-on / sibling)

- **Spec 199** — compound availability at root proposal (mutually independent).
- Stochastic-axis-pure game data spec.
- Engine primitives surfaced by P3 as needed by the new corpus game but not currently available — promoted to follow-on specs as discovered.
- Visual-config / runner integration of the new corpus game.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-26:

- [`archive/tickets/198GAMECONFCORP-001.md`](../archive/tickets/198GAMECONFCORP-001.md) — Author minimal perfect-info board game data spec (COMPLETED 2026-05-26; covers §4.1 / P1)
- [`archive/tickets/198GAMECONFCORP-002.md`](../archive/tickets/198GAMECONFCORP-002.md) — Cross-family architectural-invariant tests (COMPLETED 2026-05-26; covers §4.2 / P2)
- [`tickets/198GAMECONFCORP-003.md`](../tickets/198GAMECONFCORP-003.md) — Observer-safety invariant proofs (covers §4.3 / P3)
- [`tickets/198GAMECONFCORP-004.md`](../tickets/198GAMECONFCORP-004.md) — Authoring-error negative-test infrastructure (covers §4.4 / P4)
