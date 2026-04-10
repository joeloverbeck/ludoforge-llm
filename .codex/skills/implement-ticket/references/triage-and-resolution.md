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

## Evidence Classification

When a ticket claims a live bug, measured runtime symptom, or concrete production evidence, classify before coding:
- **Incidence verified**: reproduced the claimed symptom
- **Mechanism verified**: proved the code still permits the failure
- **Both verified**
- **Neither verified**

Record explicitly in working notes. See the Production-Proof & Regression section in `specialized-ticket-types.md` for implementation guidance.

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
