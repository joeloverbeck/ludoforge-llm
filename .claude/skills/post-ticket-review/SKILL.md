---
name: post-ticket-review
description: "Review a completed ticket implementation against the original ticket, current code, and docs/FOUNDATIONS.md. Use after implementing a ticket to make tiny must-fix-now cleanups, extend or create follow-up tickets when concrete evidence warrants it, and archive the finished ticket when appropriate."
user-invocable: true
arguments:
  - name: ticket_path
    description: "Path to the implemented ticket file (e.g., tickets/104UNIDECCON-008.md)"
    required: true
  - name: context
    description: "Additional review scope or constraints from the user"
    required: false
---

# Post Ticket Review

Use this skill after implementing a ticket. The goal is not to re-implement the ticket. The goal is to decide, with a strong bias toward doing nothing, whether the completed work:

- violates or strains `docs/FOUNDATIONS.md`
- leaves nearby architecture less clean, robust, or extensible than it should be
- warrants a tiny immediate cleanup
- warrants extending an existing active ticket
- warrants creating a new follow-up ticket
- is ready for archival

Take actions first, then summarize only the decisions made.

## Required Inputs

- The path to the implemented ticket file
- Any extra review scope from the user

## Required Reads

1. Read `docs/FOUNDATIONS.md`.
2. Read `CLAUDE.md`.
3. Read `tickets/README.md`.
4. Read `tickets/_TEMPLATE.md`.
5. Read `docs/archival-workflow.md`.
6. Read the implemented ticket.
7. Read the remaining active tickets in `tickets/` before proposing or editing follow-up work.

If the implemented ticket is already archived, still proceed with the review.

## Evidence Model

Use concrete evidence only. Review against:

- the original implemented ticket
- the current code in touched areas
- nearby architecture that the implementation depends on, even if not modified
- available diff, commit, and history context around the implementation when useful
- active tickets that may already cover adjacent work

Do not create refactor tickets from vague taste or hypothetical cleanup ideas. If evidence is weak, do nothing.

## Review Dimensions

Evaluate the implementation and nearby architecture along these fixed dimensions:

1. Foundations compliance
2. Boundary clarity
3. Robustness
4. Extensibility
5. DRY / duplication
6. Testability
7. Migration / atomicity risk
8. Complexity / maintainability

## Workflow

### Phase 1: Establish Context

1. Re-read the implemented ticket and extract:
   - the problem statement
   - architecture claims
   - files to touch
   - acceptance criteria
   - invariants
2. Identify the code that was actually touched and the nearby modules that matter architecturally.
3. Read the remaining active tickets and check for overlap, adjacent scope, and likely dependency relationships.

### Phase 2: Review With a Do-Nothing Bias

4. Compare the finished work against the review dimensions using direct evidence from code, tests, and ticket intent.
5. Classify each finding into one of these action buckets:
   - `must-fix-now`: small enough to fix immediately and verify now
   - `follow-up-ticket`: important, concrete work that should not be folded into the finished ticket now
   - `no-action`: not strong enough to justify change
6. Only treat something as `must-fix-now` when it is truly small by engineering judgment and can be fixed confidently without reopening the architectural scope of the finished ticket.

### Phase 3: Act

7. If there is a `must-fix-now` item:
   - implement the small cleanup immediately
   - run targeted verification for that cleanup
   - continue reviewing for larger follow-up work after the fix
8. For follow-up work:
   - prefer extending an existing active ticket when that produces a cleaner boundary and avoids overlap
   - otherwise create a new ticket in `tickets/` from `tickets/_TEMPLATE.md`
   - choose the original ticket's prefix series when the work is logically derived from that series
   - otherwise invent a new mnemonic prefix
9. When extending an existing active ticket:
   - edit the ticket directly
   - preserve or improve architectural clarity
   - substantial reshaping is allowed if the better boundary is clear and evidence-backed
10. When creating a new ticket:
    - include concrete evidence from the review
    - align the problem and architecture check with `docs/FOUNDATIONS.md`
    - add dependencies instead of overlapping scope with other active tickets
    - keep the scope specific and actionable
11. If no unresolved `must-fix-now` cleanup remains, archive the implemented ticket per `docs/archival-workflow.md`.

## Ticket Authoring Rules

For any ticket you create or extend:

- Follow `tickets/README.md`.
- Use `tickets/_TEMPLATE.md`.
- Include `Assumption Reassessment` grounded in the current codebase.
- Include an `Architecture Check` that explains why the proposed boundary is cleaner.
- List explicit tests and commands.
- Reference dependent active tickets when needed.
- Avoid overlap with active tickets. Prefer dependencies and scope clarification.
- Keep the proposed implementation Foundation-compliant.

## Output Rules

- Take actions first, then summarize the decisions made.
- Be terse when no action is warranted.
- If actions were taken, summarize only:
  - small cleanup fixed
  - targeted verification run
  - active ticket extended
  - new ticket created
  - original ticket archived

## Guardrails

- Strong bias toward doing nothing unless evidence is concrete.
- Never create speculative refactor tickets.
- Never use a new ticket to hide a Foundation violation that should have been a tiny immediate fix.
- Do not reopen the finished ticket's scope except for truly small must-fix-now cleanup.
- Do not create overlapping tickets.
- Read active tickets before editing or creating follow-up work.
- If uncertain whether a change is small enough to fix now or important enough to ticket, do nothing.

## Example Usage

```
/post-ticket-review tickets/104UNIDECCON-008.md
/post-ticket-review archive/tickets/FOO-003.md context:"Check whether nearby architecture needs a follow-up ticket"
```
