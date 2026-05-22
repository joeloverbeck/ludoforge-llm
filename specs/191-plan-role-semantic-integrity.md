# Spec 191 — Plan/Role Semantic Integrity: Enforce Compiled Plan Metadata Instead of Accepting It

**Status**: PROPOSED
**Priority**: High — this is the hardening substrate the plan-primary root authority (Spec 190) relies on. The compiler currently accepts plan/role metadata that the runtime silently ignores, which violates the compiler/kernel validation boundary and lets authored intent diverge from enforced behavior.
**Complexity**: M (M–L if many authored values fail validation) — engine + compiler changes, no new DSL surface area; corrective fixes to existing authored profile values that fail the new validation are in scope (see §2).
**Date**: 2026-05-22
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED — plan-template IR, role selectors, execution controller, fallback ladder, compiler validation)
- `archive/specs/187-whole-turn-posture-and-ally-rival-metadata.md` (COMPLETED — posture evaluators + relationship metadata)

**Trigger report**:
- `reports/ludoforge-ai-overhaul-first-iteration.md` (ChatGPT-Pro "Requirements-First AI Architecture Audit", 2026-05-22). This spec adopts the audit's verified findings #4, #5, #6, and #9 — the semantic-validation gaps — and rejects/defers the rest per §8 below. The audit's central "second major architectural iteration" framing is corrected: the landed 186–188 series already realizes the Doctrine–Plan–Role–Target shape the audit re-proposes; what remains is enforcing the metadata the series compiled but did not check, plus root authority (Spec 190).

**Ticket namespace**: `191PLANSEMINT` (proposed)

---

## 1. Goal

Make every piece of compiled plan/role metadata either **enforced at runtime** or **rejected at compile time** — never silently accepted and ignored. Concretely:

1. **Role constraints** — every authored constraint kind has a runtime implementation, or the compiler rejects it. Today `notEqual` is enforced and `locatedIn` falls through to `return true` (`plan-proposal.ts:438`), so the compiler accepts richer-looking constraints than the runtime honours.
2. **Plan step matching** — the controller consumes and the compiler validates the `decisionPath`, `targetKind`, and `stageIndex` fields. Today all three are compiled into `CompiledPlanStepMatch` (`kernel/types-core.ts:1227`) but never read by `decisionMatchesStep` (`plan-controller.ts:75–107`), which matches only `decisionKind`, `actionTag`, and selected value.
3. **Compound sequencing metadata** — `root.compound` (`specialTags`, `timing`, `interruptAfterStage`) is validated against at least one legal continuation witness. Today it is copied through `compile-agent-plan-templates.ts` and never cross-checked against any action's actual special-activity grant semantics.
4. **Semantic golden traces** — golden tests prove authored plan roots, role target kinds, decision paths, and stage indices align with the kernel-published continuation frontier — not merely that selected values are members of `legalActions`.

## 2. Non-Goals

- **No root-selection change.** Whether the plan or the scalar evaluator chooses the action-selection root is Spec 190's concern. This spec hardens matching and validation regardless of who chooses the root.
- **No new selector sources or constraint kinds.** This spec implements or rejects the kinds that already exist in the type surface; it does not add `reachableFrom`, route reachability, or other new semantics. New constraint kinds are a follow-up justified by a concrete authoring need.
- **No NEW profile authoring.** The four-faction authoring landed in Spec 188; this spec adds no new templates, roles, or constraints. It does, however, move existing authored metadata from compiled-but-ignored to enforced: the FITL profile authors 48 `decisionPath`, 48 `targetKind`, 4 `stageIndex`, and ≈23 `compound`-family values that P2/P3 begin validating. **Corrective fixes to any such authored value that fails the new validation are in scope** and land in the same change (Foundation #14), not deferred or shimmed. (`locatedIn`, by contrast, is authored zero times, so rejecting it breaks no profile.)
- **No kernel/legality changes.** Constructibility and the published frontier are unchanged.

## 3. Context (verified against codebase, 2026-05-22)

- **Role constraints** — `constraintsSatisfied` (`packages/engine/src/agents/plan-proposal.ts:425–440`) handles `notEqual` and falls through to `return true` for everything else. `CompiledPlanRoleConstraint` (`kernel/types-core.ts:1216`) admits `notEqual` and `locatedIn`. `locatedIn` is therefore a no-op the compiler accepts.
- **Step matching** — `decisionMatchesStep` (`packages/engine/src/agents/plan-controller.ts:75–107`) checks `decisionKind`, then for `actionSelection` checks `actionTag` (via `def.actionTagIndex`) or template root membership, and for `chooseOne`/`chooseNStep` checks `decision.value === binding.selectedId`. It never reads `step.match.decisionPath`, `step.match.targetKind`, or `step.match.stageIndex`, all defined on `CompiledPlanStepMatch` (`kernel/types-core.ts:1227–1233`). Note `decisionPath` and `targetKind` are **required** fields; `actionTag` and `stageIndex` are optional.
- **Compound metadata** — `compile-agent-plan-templates.ts:93–100` copies `root.compound.specialTags`/`timing`/`interruptAfterStage` verbatim. `validate-agent-plan-templates.ts` validates roles, selector references, caps, step role references, fallback targets, and fallback cycles — but never `root.compound`.
- **Test coverage** — `plan-controller-legality-frontier.test.ts` (`@test-class: architectural-invariant`) proves selected role values are members of the published frontier and that fallback is deterministic. No test proves `decisionPath`/`targetKind`/`stageIndex` correspond to the actual decision shape, or that compound special-activity timing is grantable.
- **Compiler validation inventory (accurate)** — the audit's claim #1 enumeration of what the compiler validates is correct (`validate-agent-plan-templates.ts:51–264`): selector existence, constraint role-precedence, stable-key ordering, step role references, cap classes, max-steps ≤ cap budget, fallback target validity, fallback cycle rejection.
- **Authored field usage (FITL profile, verified 2026-05-22)** — `data/games/fire-in-the-lake/92-agents.md` authors `decisionPath`×48, `targetKind`×48, `stageIndex`×4, and `compound`-family fields ×≈23 — all currently compiled-but-unenforced — and `locatedIn`×0. P2/P3 move the former four from dead metadata to load-bearing (so they constitute real in-scope migration surface, see §2); the latter is safe to compile-reject.

## 4. Architecture

### 4.1 Role-constraint runtime/compile parity

Introduce a single source of truth for which constraint kinds the runtime enforces — a `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` set consumed by both `constraintsSatisfied` and the compiler validator. Two acceptable resolutions per kind, chosen per kind in implementation:

- **Implement** `locatedIn` in `constraintsSatisfied` with real location semantics (the bound target's zone/container matches the referenced role's bound zone/container), using only observer-safe state already available to the proposer; or
- **Compile-reject** `locatedIn` until it has a runtime implementation, with a role/constraint-named diagnostic.

The invariant after this spec: `validate-agent-plan-templates.ts` rejects any constraint kind not in the supported set, so the runtime fall-through `return true` becomes unreachable for accepted specs. The recommended disposition is to **compile-reject `locatedIn`**: it is authored zero times in the FITL profile (verified 2026-05-22), so rejection breaks nothing and avoids implementing runtime semantics no profile uses (YAGNI). Implement it only if a profile later needs it; the registry guarantee holds either way.

### 4.2 Step-match field validation and use

- **Compile-time** — `validate-agent-plan-templates.ts` validates that each step's `decisionPath` resolves to a declared decision-surface path, `targetKind` is a known target kind compatible with the step's role selector result type, and `stageIndex` is within the template's declared stage range. Mismatches emit role/step-named diagnostics (Foundation #12: knowable-from-spec checks fail at compile time).
- **Runtime** — `decisionMatchesStep` additionally requires `decisionPath`, `targetKind`, and `stageIndex` to correspond to the current decision, so a step matches the *intended* frontier position rather than any frontier with the right kind/tag. `decisionPath` and `targetKind` are **required** on `CompiledPlanStepMatch` (always present → always enforced); only `actionTag` and `stageIndex` are optional, and an omitted optional field remains a wildcard (back-compatible with steps that omit it). Because every existing authored step carries `decisionPath`/`targetKind`, this enforcement is immediate and unconditional for the current profile — see §2 on the resulting in-scope profile corrections.

### 4.3 Compound-sequencing witness validation

`validate-agent-plan-templates.ts` cross-checks `root.compound` against the compiled action surface: for each template whose root declares `specialTags`/`timing`/`interruptAfterStage`, at least one legal continuation witness in the authored conformance fixtures must exhibit the described special-activity timing and continuation path. A template that describes a sequencing pattern no action can grant fails compilation with a template-named diagnostic (Foundation #16: the metadata is proven, not asserted).

### 4.4 Semantic golden traces

Add golden trace tests that pin, for representative authored templates, the correspondence between the authored role target kind / decision path / stage index and the kernel-published continuation frontier at each step — `@test-class: golden-trace`, re-blessable only under the testing-guide protocol.

## 5. Data flow / Process

Compile time: template → existing structural validation → **new** constraint-kind support check, step-field surface check, compound-witness check → compiled artifact. Runtime: frontier decision → `decisionMatchesStep` (now consuming all match fields) → role binding/selection within frontier (unchanged) → constraint check (now with `locatedIn` honoured or unreachable).

## 6. Determinism and replay (Foundations #8, #16)

All additions are pure validation and deterministic matching over already-deterministic inputs. New compiler diagnostics must replay byte-identically; new golden traces must be replay-identical. No RNG, no wall-clock, no iteration-order dependence introduced.

## 7. Edge cases

- A constraint kind present in authored profiles but not implemented → compile error (resolved by implementing it or removing the authored use in the same change).
- A step `targetKind` incompatible with its role selector's result type → compile error.
- A `stageIndex` beyond the template's stage range → compile error.
- `root.compound` describing a timing no action grants → compile error.
- Steps that omit `decisionPath`/`targetKind`/`stageIndex` → unchanged wildcard matching (no regression for existing templates).

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Role-constraint runtime/compile parity (§4.1) | Supported-kind registry consumed by runtime + compiler; `locatedIn` implemented or compile-rejected; crafted spec with unsupported constraint fails compilation; runtime fall-through unreachable for accepted specs; determinism preserved | S–M |
| **P2** | Step-match field validation + use (§4.2) | Compiler rejects bad `decisionPath`/`targetKind`/`stageIndex`; `decisionMatchesStep` consumes all present fields; field-absent steps unchanged; architectural-invariant test for match correspondence; the existing FITL profile's authored `decisionPath`/`targetKind`/`stageIndex` pass the new validation or are corrected in the same change | M |
| **P3** | Compound-sequencing witness validation (§4.3) | Template with ungrantable `root.compound` fails compilation with template-named diagnostic; valid templates compile against a continuation witness; the existing FITL profile's authored `compound` templates pass the witness validation or are corrected | M |
| **P4** | Semantic golden traces (§4.4) | Golden traces pin role-kind/path/stage ↔ frontier correspondence for representative templates; replay-identical | S |

## 9. Test plan

- **Compiler error corpus** — unsupported constraint kind; `targetKind`/selector mismatch; out-of-range `stageIndex`; non-resolving `decisionPath`; ungrantable compound timing. Each fails with a role/step/template-named diagnostic; diagnostics replay byte-identically.
- **Runtime architectural-invariant** — `decisionMatchesStep` matches only the intended frontier position when match fields are present; field-absent steps match as before.
- **Golden trace** — `@test-class: golden-trace` correspondence pins per §4.4.
- **Determinism** — compile-twice byte-identity preserved; plan traces replay-identical.

## 10. Foundation alignment

#1 (generic constraint/target-kind machinery, no game words) · #12 (everything knowable from the spec is validated at compile time; no runtime-only acceptance gaps) · #14 (dead metadata is enforced or deleted, not left as an accepted no-op; existing authored values that fail the new validation are migrated in the same change, not shimmed) · #15 (root-cause: close the accept-but-ignore gap, not paper over it) · #16 (compound timing and frontier correspondence proven by tests, not asserted).

## 11. Reassessment of the external proposal (`reports/ludoforge-ai-overhaul-first-iteration.md`)

**Adopted (this spec's slice):**
- Claim #4 (role constraints underpowered; `locatedIn` returns true) → §4.1.
- Claim #5 (plan step matching ignores `decisionPath`/`stageIndex`/`targetKind`) → §4.2.
- Claim #6 (compound sequencing metadata descriptive, not proven) → §4.3.
- Claim #9 (validation proves structure, not semantics) → §4.4 + §9.

**Corrected:**
- Claim #7 (`noPreviewDecision` in the normal root path) — **refuted by verification**: `noPreviewDecision` exists only in plan-posture evaluation (`plan-proposal.ts:505`), not the scalar root path. No work warranted.
- The audit's framing that these gaps require a "second major architectural iteration" / new Doctrine–Plan–Role–Target architecture — corrected: the landed 186–188 series already realizes that shape (see Spec 186 §11). These are enforcement gaps in a built architecture, not a missing architecture.

**Deferred (named follow-ups, not in this spec):**
- `docs/agent-dsl-cookbook.md` rewrite around plan-primary framing (claim #8) — deferred to the `reassess-agent-dsl-cookbook` skill *after* Spec 190 lands, since the cookbook should describe the realized plan-primary behaviour.
- Relationship-matrix strengthening (audit §12) — Spec 187 already landed conditional ally-rival weighting; multiple-active-relationships-per-role is uncommitted until a concrete competence requirement needs it.
- Evolution-loop revival mutating doctrine/plan/role structure (audit §15) — remains the deferred Spec 183 reassessment.

**Rejected (with rationale):**
- New doctrine layer replacing strategy modules (audit §6 Layer 2, §17.2) — Spec 186 §11 already decided doctrine reuses Spec 182 modules as carriers; a new layer is churn against a settled, Foundations-justified decision (#14).
- "Weights have failed / abolish considerations" (audit §3, §18) — Spec 186 §11 corrected this; considerations are demoted to leaf scorers, and Spec 190 (not a profile rewrite) is what relocates them to that subordinate role.
- Formal hidden-info 4-mode enum (audit §13) — Foundations #4 + #20 already mandate observer discipline and preview provenance; FITL is near-fully public; the enum is speculative (YAGNI) until the conformance hidden-info card game exercises it.
- Game-specific engine target kinds such as `lineOfCommunication` (audit §10) — Foundation #1 keeps game semantics ("LoC") in authored data; only generic kinds (`zone`, `token`, `route`, `originDestinationPair`, `subset`, `tuple`, `numericChoice`, …) belong in the engine.

## 12. Out of scope (named follow-on / sibling)

- **Spec 190** — plan-primary root selection (depends conceptually on this spec's trustworthy step matching; see `specs/IMPLEMENTATION-ORDER.md`).
- Cookbook rewrite, relationship-matrix, evolution-loop revival — per §11 deferred.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-22 (namespace `191PLAROLSEM`):

- [`archive/tickets/191PLAROLSEM-001.md`](../archive/tickets/191PLAROLSEM-001.md) — COMPLETED — Role-constraint runtime/compile parity (registry; compile-reject `locatedIn`) (covers §4.1 / P1)
- [`tickets/191PLAROLSEM-002.md`](../tickets/191PLAROLSEM-002.md) — Step-match field validation + use + FITL profile corrections (covers §4.2 / P2)
- [`tickets/191PLAROLSEM-003.md`](../tickets/191PLAROLSEM-003.md) — Compound-sequencing witness validation + FITL profile corrections (covers §4.3 / P3)
- [`tickets/191PLAROLSEM-004.md`](../tickets/191PLAROLSEM-004.md) — Semantic golden traces (covers §4.4 / P4)

## Outcome

TBD.
