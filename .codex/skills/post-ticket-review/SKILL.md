---
name: post-ticket-review
description: Review a completed ticket implementation against the original ticket, current code, and docs/FOUNDATIONS.md. Use after implementing a ticket to make tiny must-fix-now cleanups, extend or create follow-up tickets when concrete evidence warrants it, and archive the finished ticket when appropriate.
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
2. Read `AGENTS.md`.
3. Read `tickets/README.md`.
4. Read `tickets/_TEMPLATE.md`.
5. Read `docs/archival-workflow.md`.
6. Read the implemented ticket.
7. Read the remaining active tickets in `tickets/` before proposing or editing follow-up work.

If the implemented ticket is already archived, still proceed with the review.

Inspect `git status --short` early. Separate unrelated dirty files from the implemented-ticket review scope, and leave them alone unless the completed ticket or concrete same-seam evidence makes them part of the review.

## Evidence Model

Use concrete evidence only. Review against:

- the original implemented ticket
- the current code in touched areas
- nearby architecture that the implementation depends on, even if not modified
- available diff, commit, and history context around the implementation when useful
- active tickets that may already cover adjacent work
- relevant archived sibling tickets or archived follow-up tickets when a staged series may already have moved adjacent ownership into the archive

Do not create refactor tickets from vague taste or hypothetical cleanup ideas. If evidence is weak, do nothing.

When the completed ticket claims to retire or narrow a public surface, explicitly inspect adjacent exported types, schemas, diagnostics, and replay/test contracts for stale fields or vocabulary even if the main runtime/source grep is already green.

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
4. If overlap or remainder ownership is still unclear in a staged series, inspect the relevant archived sibling tickets or archived follow-up tickets before creating new work.
5. Keep a clear boundary between current-review changes and unrelated dirty worktree state. If unrelated dirty paths exist, mention them in the final handoff only as separate pre-existing or same-session work, not as ticket-review output.

### Phase 2: Review With a Do-Nothing Bias

4. Compare the finished work against the review dimensions using direct evidence from code, tests, and ticket intent.
   - For microturn publication, recovery, rollback, fallback, or pass-fallback tickets, explicitly sweep the one-rules-protocol surfaces before calling the review complete: `publishMicroturn`, `applyPublishedDecision`, `applyMove`, `applyTrustedMove`, `legalMoves`, `enumerateLegalMoves`, `probeMoveLegality`, and `probeMoveViability`. Publication, raw/classified enumeration, direct apply, trusted apply, and probe/admissibility paths must preserve the same invariant.
5. Classify each finding into one of these action buckets:
   - `must-fix-now`: small enough to fix immediately and verify now
   - `follow-up-ticket`: important, concrete work that should not be folded into the finished ticket now
   - `no-action`: not strong enough to justify change
6. Only treat something as `must-fix-now` when it is truly small by engineering judgment and can be fixed confidently without reopening the architectural scope of the finished ticket.

### Phase 3: Act

7. If there is a `must-fix-now` item:
   - implement the small cleanup immediately
   - run targeted verification for that cleanup
   - if the cleanup changes production runtime, compiler, schema, or shared test behavior, also rerun the affected original acceptance lanes before archival; a focused regression alone is not enough for closeout when shared behavior changed
   - continue reviewing for larger follow-up work after the fix
8. For follow-up work:
   - prefer extending an existing active ticket when that produces a cleaner boundary and avoids overlap
   - otherwise create a new ticket in `tickets/` from `tickets/_TEMPLATE.md`
   - choose the original ticket's prefix series when the work is logically derived from that series
   - otherwise invent a new mnemonic prefix
   - if the implementation is acceptable but the original ticket still has a concrete named deliverable that did not land, split that remainder explicitly instead of silently treating the original ticket as fully satisfied
9. When extending an existing active ticket:
   - edit the ticket directly
   - preserve or improve architectural clarity
   - substantial reshaping is allowed if the better boundary is clear and evidence-backed
10. When creating a new ticket:
   - include concrete evidence from the review
   - align the problem and architecture check with `docs/FOUNDATIONS.md`
   - add dependencies instead of overlapping scope with other active tickets
   - keep the scope specific and actionable
   - if the new follow-up changes the truth of any sibling active ticket's dependency, audit boundary, or ownership wording, update those sibling tickets in the same review turn
   - after later archive/rewrite commands run, reread every active ticket you created or edited in this review turn and confirm `Deps`, `Files to Touch`, and any archive-path references are still literal-path correct
    - classify later old-path grep hits as `actionable path`, `historical/prose id`, or `already-correct archive path`; rewrite only actionable handoff references such as `Deps`, target snippets, live-path instructions, and markdown links that would send the next implementer to the wrong file
11. If review evidence shows the implementation can stand but the original ticket was not fully satisfied as written:
   - amend the original ticket's closeout text so it truthfully records the deviation
   - state what landed, what did not, and which active follow-up ticket now owns the remainder
   - only archive after that rewrite and after confirming no unresolved `must-fix-now` cleanup remains
12. Before archival, do a final contract check:
   - if this review created or extended a follow-up because an original deliverable was missed, confirm the original ticket now says so explicitly
   - do not archive a ticket whose written outcome still implies that an undelivered named item was completed
   - if archival tooling rewrote active-ticket references, reread those touched active tickets and verify the rewritten literals are still path-correct and ownership-correct before considering the review complete
13. If no unresolved `must-fix-now` cleanup remains, archive the implemented ticket per `docs/archival-workflow.md`.
14. After archival:
   - confirm the original source path is gone
   - run a literal old-path sweep across active tickets, the implemented spec or roadmap/doc that owns the ticket family, and the newly archived ticket
   - remember that `scripts/archive-ticket.mjs` rewrites active tickets only; specs, roadmaps, reports, and archived-ticket prose may still contain stale markdown links or live-path instructions
   - classify each old-path hit as `actionable path`, `historical/prose id`, or `already-correct archive path`; rewrite only actionable references, not harmless historical prose
   - reread every file changed by the archive script or by the old-path sweep and confirm the remaining literals are ownership-correct
15. Run verification for review-created edits:
   - always run `pnpm run check:ticket-deps` after archiving or changing ticket dependencies
   - if the review edited ticket/spec/archive markdown, run `git diff --check -- <review-edited-files>`
   - if review-created edits changed production runtime, compiler, schema, or shared tests, rerun the affected original acceptance lanes before archival closeout

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
  - unrelated dirty paths only when needed to keep the ticket-review output distinct from other same-session or pre-existing work

## Guardrails

- Strong bias toward doing nothing unless evidence is concrete.
- Never create speculative refactor tickets.
- Never use a new ticket to hide a Foundation violation that should have been a tiny immediate fix.
- Do not reopen the finished ticket's scope except for truly small must-fix-now cleanup.
- Do not create overlapping tickets.
- Read active tickets before editing or creating follow-up work.
- Do not archive a finished ticket until its written outcome matches what actually landed, especially when a missed original deliverable was split into follow-up work during review.
- If uncertain whether a change is small enough to fix now or important enough to ticket, do nothing.

## Codex Adaptation Notes

- Do not assume fresh session context. This skill must work later from the ticket path plus repository state.
- Use normal Codex conversation context instead of slash-command arguments.
- This skill is action-taking, unlike `skill-audit`.

## Example Prompts

- `Use $post-ticket-review on tickets/104UNIDECCON-008.md`
- `Review tickets/104UNIDECCON-007.md after implementation and create follow-up tickets only if concrete evidence warrants it`
- `Run $post-ticket-review for archive/tickets/FOO-003.md and check whether nearby architecture needs an active follow-up ticket`
