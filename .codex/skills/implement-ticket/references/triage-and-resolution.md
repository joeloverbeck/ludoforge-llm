# Triage and Resolution

## Stale-vs-Blocking Triage

Distinguish clearly between:

| Category | Examples | Action |
|----------|----------|--------|
| **Nonblocking drift** | Stale file paths, renamed test files, stale example commands, path-only movement where the intended artifact is clear | Correct in working notes & implementation; no stop required |
| **Blocking discrepancy** | Wrong owned boundary, wrong bug premise, impossible acceptance criteria, stale wording that changes what must be implemented | Stop and resolve before coding |

Additional triage rules:
- Stale paths that uniquely identify their intended artifact are nonblocking.
- Path-only drift is not a scope discrepancy (e.g., `src/kernel/foo.ts` moved to `src/contracts/foo.ts` with the same purpose).
- Stale test paths: prefer the live test surface that owns the behavior.
- Stale wording but valid boundary: keep the boundary, correct stale claims, resolve implementation direction via 1-3-1.
- Stale deliverable inside a valid boundary: implement the live owned subset, call out the stale sub-claim in working notes/final summary; no 1-3-1 unless it blocks correctness.
- Stale incidence but relevant mechanism/invariant: treat as a proof-boundary decision, not automatic invalidation.
- Active ticket mostly collapsed by earlier sibling work but a concrete owned invariant remains: rewrite around the residual live boundary.
- Boundary itself is wrong: stop and resolve whether to rewrite, narrow, or supersede.

## Artifact Verification Checklist

When verifying every referenced artifact against the live codebase with targeted reads and `rg`:

- File existence and path accuracy
- Named exports, functions, types, and signatures
- Module structure and required dependencies/scripts
- Concrete callsites: check whether behavior is still owned there or has been centralized behind a shared helper; treat already-migrated sites as stale sub-claims.
- Claimed dead fallbacks: when a ticket says an immutable fallback, compatibility branch, or alternate path is now dead, enumerate remaining callers and classify the path as `dead`, `shared immutable authority`, or `must be migrated now` before accepting removal.
- Widened compilation/optimization for an existing AST/expression family: compare live interpreter/evaluator semantics directly before accepting the ticket's claimed subset.
- When a ticket depends on auto-synthesized or compiler-generated outputs, compare the pre-synthesis authored source, the post-synthesis compiled section, and every downstream consumer that relies on the generated ids or artifacts. Confirm they share the same live source of truth before accepting a YAML-only or caller-local fix.

## Evidence Classification

When a ticket claims a live bug, measured runtime symptom, or concrete production evidence, classify before coding:
- **Incidence verified**: reproduced the claimed symptom
- **Mechanism verified**: proved the code still permits the failure
- **Both verified**
- **Neither verified**

Record explicitly in working notes. See the Production-Proof & Regression section in `specialized-ticket-types.md` for implementation guidance.

## Legality/Admissibility Contradiction Playbook

When legality/admissibility and sampled completion disagree, run this contradiction playbook before widening retries, adding fallbacks, or rewriting the ticket boundary:

- compare the raw legality/viability surface, the admission/satisfiability surface, and the sampled completion result for the same `(def, state, move)` tuple
- if those surfaces still disagree, exhaustively classify the smallest bounded decision surface that can prove whether successful branches actually exist
- only after that proof should you decide whether the owning seam is legality/admissibility, completion policy, or retry progression

## Archived Sibling Contradiction

If stronger live evidence contradicts an archived sibling ticket's benchmark or investigation verdict, classify that contradiction explicitly before coding:

- `historical evidence only`: the archived sibling remains an accurate record of what was measured then, and the current ticket documents the stronger rerun plus the updated live boundary
- `active-series contract drift`: the contradiction changes how active dependent tickets should be interpreted, so rewrite the active current ticket before completion
- `blocking verdict conflict`: the contradiction changes the series decision boundary so materially that proceeding would violate ticket fidelity; stop via 1-3-1 before coding or closeout

Prefer `historical evidence only` when the archived ticket remains a truthful record of its own run and the current ticket can carry the stronger same-environment comparison without misleading future work.

Apply the same classification to checked-in investigation, audit, benchmark, or campaign artifacts produced by completed dependency tickets. If the current ticket's live proof contradicts a durable dependency artifact's verdict or decision, update that artifact in the same turn when it remains part of the active series contract; otherwise record explicitly why the artifact is historical-only and why leaving it unchanged will not mislead future implementers.

## Confirmation Semantics

- If the user explicitly authorizes reassessment and instructs you to proceed with the best `FOUNDATIONS.md`-compliant option after you have presented the discrepancy and choices, treat that as confirmation. Restate the boundary, then continue.
- If the user's response is only informational, remain stopped and ask for confirmation.

## Post-Confirmation Architecture Reset

When a user-confirmed 1-3-1 decision broadens or reframes the solution:
1. Restate the new authoritative boundary in working notes.
2. If the confirmed resolution changes the active ticket's owned boundary, amend the ticket first.
3. Open every directly affected sibling ticket. Compare named files, deliverables, and deps against the rewritten boundary. Update in the same turn or record why no edit is needed.
4. Re-extract owned deliverables, affected files, proof obligations, acceptance criteria, test paths, and verification commands from the confirmed boundary.
5. Record which sibling scope was absorbed and what remains deferred.

## 1-3-1 Edge Cases

| Situation | Preferred resolution |
|-----------|---------------------|
| Ticket uses raw strings for a branded domain type | Prefer the existing branded type |
| Ticket proposes a field already covered by an existing contract field | Reuse the existing field |
| Narrow factual mismatch inside a valid boundary | Bounded discrepancy, not automatic rewrite |
| Bug claim no longer reproducible but invariant is worth proving | Convert to proof/regression-only after confirmation |
| Audit shows the suspected surface already satisfies the invariant | Complete as audit-plus-proof with tests only |
| Acceptance claim lacks a verified reproducer | Correct to strongest evidenced boundary |
| Conversion boundary between plain domain object and trusted/validated form | Resolve ownership explicitly |
| Ticket narrows semantics for one member of an existing shared surface family | Prefer the already-landed shared family contract unless the ticket owns a family-wide redesign |

## Stop Conditions and Boundary Resets

Every stop condition below requires resolution before implementation proceeds.

- **Factually wrong ticket**: Stop and present discrepancies. Do not stop for nonblocking drift (see Stale-vs-Blocking Triage).
- **Unverifiable bug claim**: If a ticket's bug claim is not reproducible, or only mechanism is verified while incidence remains unproven, stop and resolve via **1-3-1** (proof-only, proof-plus-fix, or scope correction).
  - If the user confirms a proof-only or proof-plus-fix path, record explicitly whether evidence is `incidence verified`, `mechanism verified`, or `both verified`, and do not overstate reproduced incidence in working notes or closeout.
- **Scope gaps or ambiguity**: Apply the **1-3-1 rule** (1 problem, 3 options, 1 recommendation).
- **Semantic acceptance drift**: If a draft ticket's acceptance criteria, expected values, or test descriptions are semantically wrong about the live contract, classify whether that is:
  - nonblocking drift: the implementation boundary is still correct and the literal wording can be safely corrected in working notes / closeout without misleading the user
  - blocking drift: implementing the literal text would change or misstate the live contract, conflict with `FOUNDATIONS.md`, or violate `AGENTS.md` ticket fidelity
  For blocking drift, stop and resolve via **1-3-1** before coding.
- Continue reassessment after each confirmation until no boundary-affecting discrepancies remain. Multiple 1-3-1 rounds are normal.
- If a **1-3-1** stop leads to a user-confirmed boundary change for an active draft ticket, immediately refresh the working-notes checkpoint and rewrite the active ticket before coding so the recorded contract matches the confirmed direction.
- If the confirmed resolution changes the active draft ticket's contract, rewrite the active ticket first so the implementation boundary matches the confirmed direction before coding.
- After rewriting the active ticket from a user-confirmed boundary reset, sanity-check each newly rewritten acceptance clause against the narrowest live witness before coding when the rewrite introduced deterministic seeds, exact counts, exact file/artifact outputs, or other concrete proof-shape claims.
  - If the rewritten clause is already directly witnessed, record that confirmation in working notes and proceed.
  - If the rewritten clause is directionally right but still overclaims a specific witness detail, correct the active ticket again before coding rather than treating the first rewrite as settled.
  - If the rewritten clause cannot be validated without wider probing than the ticket can tolerate, stop and resolve via another 1-3-1 round instead of silently weakening or assuming the proof shape.
- Restate the authoritative boundary in working notes and confirm no blocking discrepancies remain before coding.
  - If the ticket's acceptance depends on traces, harness output, campaign metrics, or another observability surface, classify the expected proof shape before coding:
    - `direct proof`: the current repo surface exposes the exact invariant or contribution path the ticket names
    - `indirect proof`: the current repo surface proves the change through a compiled artifact, golden, catalog, or adjacent observable effect, but not the literal named field
    - `missing proof surface`: the repo cannot currently prove the acceptance claim without new instrumentation or trace/schema changes
  - `missing proof surface` is not automatically blocking when the implementation boundary is still correct, but you must explicitly decide whether the ticket can be closed with indirect proof, needs a ticket rewrite, or requires a stop-and-confirm via 1-3-1.
- If the ticket is accurate and no blocking decision remains, proceed.
- If valid owned work lands and only then reveals a new blocker that prevents full acceptance, treat that as a distinct `partial completion, new blocker` state rather than either forcing completion or discarding the completed work.
  - Record the completed owned work explicitly in working notes and in the active ticket.
  - Mark the active ticket `BLOCKED` rather than `COMPLETE` when acceptance is still unmet.
  - Restate the remaining unmet acceptance or invariant as the new live boundary.
  - Stop before further implementation widens the ticket again unless the user confirms the broader boundary.
- When acceptance-lane failures persist after the original contract or boundary seam is repaired, explicitly classify whether the remaining red lane is:
  - `same seam still incomplete`: the failures still share the original ticket-owned contract/boundary cause
  - `adjacent fallout still required`: the failures are downstream but still part of the same narrowly coherent ticket-owned seam
  - `new semantic/runtime blocker`: the failures now show broader gameplay, preview, or runtime behavior divergence beyond the original seam
  If the classification is `new semantic/runtime blocker`, stop widening the active ticket by default. Record the completed owned work, mark the ticket `BLOCKED`, and create or update a follow-up ticket unless the user explicitly confirms a broader boundary.
