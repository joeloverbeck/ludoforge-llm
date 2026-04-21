# 140MICRODECPRO-013: D10 + D11 — FOUNDATIONS amendments + documentation updates

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — docs only
**Deps**: `archive/tickets/140MICRODECPRO-012.md`

## Problem

With the microturn protocol fully implemented and the certificate machinery retired, the canonical architecture documents must catch up. `docs/FOUNDATIONS.md` needs four amendments (F5, F10, F18 restated + F19 new), and `docs/architecture.md` + `docs/project-structure.md` need microturn-era rewrites.

## Assumption Reassessment (2026-04-20)

1. `docs/FOUNDATIONS.md` currently defines F1-F18 and an Appendix that references Spec 139 — confirmed.
2. `docs/architecture.md` currently has sections "Legal Move Admission Contract", "Agent Fallback", "Admission Search Shape" — confirmed by Explore agent during reassessment.
3. `docs/project-structure.md` does not yet mention `packages/engine/src/kernel/microturn/` — confirmed.
4. Appendix text: "Spec 139 added Foundation #18 and refined Foundations #5 and #10 to formalize the constructibility-carrying legality contract." — confirmed at FOUNDATIONS.md lines 119-128.

## Architecture Check

1. Documentation-only ticket — zero code changes, zero test changes. Clean reviewable diff.
2. Alignment with F14: no compatibility framing left in docs. Old "admission contract" terminology is replaced with microturn-protocol terminology.
3. Preserves downstream skill inputs: section headings `## Foundations` / `## N. <Name>` stay stable; the only changes are content within existing headings + one new heading (F19).

## What to Change

### 1. Amend `docs/FOUNDATIONS.md` F5

Replace the "Constructibility clause" at the end of F5 with spec 140 D10.1:

> **Constructibility clause**: Every client-visible legal action is directly executable at its microturn scope. Client-side search, template completion, or completion certificates are not part of the legality contract. Each microturn publishes a finite list of atomic decisions; selecting any decision is sufficient to advance kernel state.

### 2. Amend `docs/FOUNDATIONS.md` F10

Replace the third sentence onward (currently about completion certificates / split decision-state continuations) with spec 140 D10.2:

> The kernel must finitely enumerate the current executable decision frontier in stable deterministic order. A compound human-visible turn is modeled as a bounded sequence of kernel-owned decision states (microturns), each of which exposes atomic legal actions only. Mechanics emerge from composition of a small instruction set, not bespoke primitives.

### 3. Amend `docs/FOUNDATIONS.md` F18

Replace the existing second paragraph with spec 140 D10.3:

> Every kernel-published legal action is constructible atomically at its microturn scope. No client-side search, no template completion, no satisfiability verdict distinct from publication, no `unknown` legal actions. The microturn publication pipeline is the single kernel artifact that establishes legality and executability; they cannot diverge.

### 4. Add `docs/FOUNDATIONS.md` F19

Append after F18:

```markdown
## 19. Decision-Granularity Uniformity

**Every kernel-visible decision is atomic. Compound human-visible turns emerge from decision sequences grouped by `turnId`, not from templates or pre-declared compound shapes.**

Player agents and chance / kernel agents operate under the same microturn protocol; the only distinction is who decides. Player decisions require agent consultation; chance decisions resolve via the authoritative RNG; kernel-owned decisions (outcome grants, turn retirement) resolve via deterministic kernel rules. No compound shape is ever exposed as a legal action. No grammar layer in the kernel or runtime ever aggregates multiple kernel decisions into a single client-visible unit except for analytics-side summaries (`compoundTurns[]`), which are derived post-hoc from `decisions[]` and never authoritative.
```

### 5. Update FOUNDATIONS Appendix

Replace "Spec 139 added Foundation #18 and refined Foundations #5 and #10 to formalize the constructibility-carrying legality contract." with:

> Spec 140 amended Foundations #5, #10, and #18, and added Foundation #19, to formalize the microturn-native decision protocol. Spec 139's certificate-carrying contract (the prior iteration of #18) is retired.

### 6. Rewrite `docs/architecture.md` admission-contract section

Replace the "Legal Move Admission Contract" + "Agent Fallback" + "Admission Search Shape" subsections with a "Microturn Protocol" section per spec 140 D11:

> ## Microturn Protocol
>
> The kernel publishes one atomic decision at a time. `publishMicroturn(def, state)` returns a `MicroturnState` whose legal actions are all directly executable. `applyDecision(def, state, decision)` advances exactly one decision, possibly opening sub-decisions via the decision stack. `advanceAutoresolvable(def, state, rng)` auto-applies chance / grant / turn-retirement microturns until the next player decision.
>
> Compound human-visible turns are derived post-hoc from the decision sequence by `turnId` grouping. See `GameTrace.compoundTurns[]`.

Expand with decision-stack details, effect-frame suspend/resume narrative, hidden-information projection semantics, and trace protocol.

### 7. Update `docs/project-structure.md`

Add `packages/engine/src/kernel/microturn/` to the kernel subsection of the directory tree, with one-line descriptions of `types.ts`, `constants.ts`, `publish.ts`, `apply.ts`, `advance.ts`.

## Files to Touch

- `docs/FOUNDATIONS.md` (modify — amendments + F19 + Appendix)
- `docs/architecture.md` (modify — admission-contract section rewrite)
- `docs/project-structure.md` (modify — microturn dir addition)

## Out of Scope

- Test suite regeneration — ticket 014.
- Any code change.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all green (no source change — regression-safety check only).
2. Manual doc review: FOUNDATIONS.md F5, F10, F18 match spec 140 D10.1/D10.2/D10.3 text verbatim; F19 is present and matches D10.4.

### Invariants

1. FOUNDATIONS.md has exactly 19 numbered foundations (plus Appendix) after this ticket.
2. `docs/architecture.md` contains no "Legal Move Admission Contract", "Agent Fallback", or "Admission Search Shape" section headings after this ticket.
3. `docs/project-structure.md` mentions `packages/engine/src/kernel/microturn/`.

## Test Plan

### New/Modified Tests

None — docs-only ticket.

### Commands

1. `grep -c '^## ' docs/FOUNDATIONS.md` — confirms foundation count.
2. `grep -n "Legal Move Admission Contract\|Agent Fallback\|Admission Search Shape" docs/architecture.md` — zero hits.
3. `grep -n "microturn" docs/project-structure.md` — at least one hit.
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
