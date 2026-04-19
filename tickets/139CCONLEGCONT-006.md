## 139CCONLEGCONT-006: FOUNDATIONS.md amendments + docs/architecture.md + T10 Foundation #18 conformance

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — docs + one integration test
**Deps**: `archive/tickets/139CCONLEGCONT-005.md`

## Problem

Spec 139 D7 amends Foundation #5 (adding the constructibility clause), rewords Foundation #10 (clarifying what "finite listability" requires), and adds Foundation #18 (`Constructibility Is Part of Legality`). Spec 139 D8 updates `docs/architecture.md` to describe the new admission contract and certificate flow. Per Spec 139 G9 and Foundation #16, the implementation must satisfy the amended Foundations as proven invariants — not the other way around. This ticket lands after tickets 001–005 so the invariants are already implemented; the amendments formalize what the code now guarantees.

T10 is the test counterpart of Foundation #18: across the FITL canary corpus and the Texas Hold'em determinism corpus, every emitted classified incomplete move either carries a certificate (verdict `'satisfiable'`) or has verdict `'explicitStochastic'` with no certificate entry. Zero admitted moves have verdict `'unknown'`.

## Assumption Reassessment (2026-04-19)

1. `docs/FOUNDATIONS.md` currently has 17 numbered foundations followed by an Appendix. Adding #18 between #17 and the Appendix is clean and matches the spec's placement guidance.
2. The Appendix currently references Spec 136 only: "Spec 136 was written to eliminate". Per spec D7.3, update the reference to cite Spec 139 alongside Spec 136.
3. `docs/architecture.md` exists (confirmed via repo layout) and contains the kernel DSL reference + admission-pipeline description. D8 updates describe the new admission contract and certificate flow at the same level of detail.
4. T10 depends on the full contract (tickets 001–005) being live. Ticket 005 deletes the agent throws and wires the certificate fallback; T10 asserts the corpus-wide invariant that every admitted incomplete move has the expected certificate-presence state.

## Architecture Check

1. **Amendments encode implemented invariants.** The new Foundation #18 and the amended #5 clause are not aspirational — tickets 001–005 make them architecturally true. This ticket documents the contract at the Foundations level (Foundation #16: testing as proof).
2. **No code change beyond T10.** Docs-only for FOUNDATIONS.md and architecture.md; T10 is a new integration test that consumes the already-live admission contract.
3. **Downstream skills benefit.** Skills like `/reassess-spec`, `/spec-to-tickets`, and `/implement-ticket` cite `docs/FOUNDATIONS.md` as the architectural baseline. Amending it means future specs and tickets self-enforce the constructibility contract.

## What to Change

### 1. Amend Foundation #5 in `docs/FOUNDATIONS.md`

Per spec D7.1: append to the existing principle body:

> **Constructibility clause**: No client-visible legal action may require uncertified client-side search to become executable. A legal action exposed by the kernel must be either directly executable, explicitly stochastic with a kernel-owned stochastic continuation, or accompanied by a kernel-produced completion certificate or a split decision-state continuation.

### 2. Amend Foundation #10 in `docs/FOUNDATIONS.md`

Per spec D7.2: replace "Legal moves must be finitely listable and emitted in stable deterministic order — no free-text moves, no unbounded generation." with:

> The kernel must finitely enumerate the current executable decision frontier in stable deterministic order. A compound human-visible turn may be represented either as a fully bound move, an explicitly stochastic continuation, or a bounded sequence of kernel-owned decision states. Finite listability does not require eager expansion of all end-of-turn concretizations when that expansion is combinatorially explosive; instead, the kernel produces a per-move completion certificate or split decision-state continuation that is itself bounded and deterministic.

### 3. Add Foundation #18 to `docs/FOUNDATIONS.md`

Insert after Foundation #17 (Strongly Typed Domain Identifiers) and before the Appendix. Per spec D7.3:

```markdown
## 18. Constructibility Is Part of Legality

**A move is not legal for clients unless it is constructible under the kernel's bounded deterministic rules protocol. Existence without a construction artifact is insufficient.**

Legality and constructibility are a single property exposed by a single kernel artifact. Client-visible incomplete moves carry a kernel-produced completion certificate; client-visible stochastic moves carry an explicit stochastic continuation; everything else is fully bound. Internal search states with `unknown` verdicts MUST NOT be exposed as legal actions. Failure to certify a structurally satisfiable move within bounded computation is an engine defect, not a recoverable game state.
```

### 4. Update the Appendix in `docs/FOUNDATIONS.md`

Append a sentence referencing Spec 139 alongside the existing Spec 136 reference: "Spec 139 added Foundation #18 and refined Foundations #5 and #10 to formalize the constructibility-carrying legality contract."

### 5. Update `docs/architecture.md` (D8)

Extend the existing admission-pipeline description with:

- The new admission-classifier verdict set: `'satisfiable'`, `'unsatisfiable'`, `'unknown'`, `'explicitStochastic'`.
- The certificate-carrying admission contract: three admission shapes (Complete / Stochastic / Template-with-certificate).
- The `certificateIndex` side channel (kernel-internal, not worker-bridge-visible).
- The agent's certificate-fallback path in the dead-end branch.
- The memoized DFS + nogood recording mechanism (brief summary; detailed algorithm stays in spec 139).

Keep the kernel DSL reference section unchanged — the contract change is at the admission layer, not the DSL.

### 6. T10 — Foundation #18 conformance (integration test)

File: `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Assertions (per spec § Testing Strategy T10, updated):

- Across the FITL canary corpus (seeds 1002, 1005, 1010, 1013 × `[us-baseline, arvn-baseline, nva-baseline, vc-baseline]` and `[us-baseline, arvn-evolved, nva-baseline, vc-baseline]`) and the Texas Hold'em determinism corpus:
  - For every emitted classified move whose `viability.complete === false`:
    - If the classifier verdict was `'satisfiable'`, assert a corresponding certificate is present in `certificateIndex`.
    - If the classifier verdict was `'explicitStochastic'`, assert NO certificate entry is present for that move.
- Assert zero admitted incomplete moves have verdict `'unknown'` (the contract rejects them before admission).

## Files to Touch

- `docs/FOUNDATIONS.md` (modify)
- `docs/architecture.md` (modify)
- `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts` (new — T10)

## Out of Scope

- Any code change beyond adding T10. The Foundations changes are documentation.
- Renumbering existing foundations or restructuring the Appendix beyond appending one sentence.
- Updating skills or other meta-docs that reference FOUNDATIONS.md — skills read it at invocation time; no propagation needed.

## Acceptance Criteria

### Tests That Must Pass

1. T10 passes across the full FITL canary corpus and the Texas Hold'em determinism corpus.
2. Full suite `pnpm turbo test` green.
3. `docs/FOUNDATIONS.md` renders correctly (no broken markdown); all 18 foundations present in numerical order.

### Invariants

1. Foundation #18 is type-enforced via the `DecisionSequenceSatisfiability` union (from ticket 003) and runtime-enforced via the admission switch (from ticket 004).
2. T10 is the runtime conformance proof: for every state in the corpus, every admitted incomplete move maps to exactly one of two certificate-presence states.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts` (new) — T10.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:integration` — T10.
2. `pnpm turbo test` — full suite.
3. Visual review: `docs/FOUNDATIONS.md` rendered in the user's preferred markdown previewer — confirms #18 placement and amendment wording.
