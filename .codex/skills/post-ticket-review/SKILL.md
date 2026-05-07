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

- The path to the implemented ticket file, or an unambiguous most-recent implemented ticket from current Codex context
- Any extra review scope from the user

Resolve the implemented ticket in this order:

1. Use an explicit user-provided ticket path when present.
2. If no path is provided, use the most recent implemented ticket from the current conversation only when it is unambiguous.
3. If the ticket cannot be resolved unambiguously, ask for the implemented ticket path before acting.

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

If resuming after context compaction or interruption, do a lightweight revalidation before acting: reopen the implemented ticket or archived ticket, reopen any active sibling tickets already touched by this review, and rerun `git status --short`. Reread `docs/FOUNDATIONS.md` and `AGENTS.md` only if the current context does not clearly show they were read for the same review slice. If an in-flight verification command from before compaction cannot be polled or its result is otherwise unobservable, rerun the idempotent check instead of treating the lost session as evidence.

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
   - When the completed ticket claims replay identity, byte identity, deterministic state, canonical output, or equivalent deterministic proof, inspect the retained witness for claim strength. It should compare the canonical serialized artifact or the full claim-bearing structure, not only proxy fields such as hashes, stable keys, scores, selection labels, or partial summaries, unless the ticket explicitly justifies that proxy as the canonical oracle.
   - For benchmark, profiling, or red measured-gate tickets, explicitly compare the final measured result against ticket/spec/reviewer materiality language such as "significant", "meaningful", or "not tiny". Classify the final same-command delta as `material`, `minor`, or `not demonstrated`; if the classification fails the stated bar, treat archival as blocked and classify whether the original ticket or a non-overlapping follow-up is the truthful owner.
5. Classify each finding into one of these action buckets:
   - `must-fix-now`: small enough to fix immediately and verify now
   - `reopen-original-ticket`: the original ticket remains the correct owner, but the missing deliverable is too large or too architectural for post-review cleanup
   - `follow-up-ticket`: important, concrete work that should not be folded into the finished ticket now
   - `no-action`: not strong enough to justify change
6. Only treat something as `must-fix-now` when it is truly small by engineering judgment and can be fixed confidently without reopening the architectural scope of the finished ticket.

### Phase 3: Act

7. If there is a `must-fix-now` item:
   - when the cleanup corrects a behavior bug, write or identify the smallest failing test/probe first, then patch; strengthening an existing focused witness is acceptable when it would have failed before the cleanup and stays on the same seam; if the seam is corpus- or domain-sensitive, run a cheap corpus/domain preflight before broadening rejection semantics
   - when adding or editing TypeScript engine tests that are executed from `dist/test/...`, rebuild the engine package before interpreting the focused Node test result; otherwise stale compiled output can produce a false red/green signal
   - implement the small cleanup immediately
   - if the cleanup edits source or test files, run `wc -l` or equivalent for touched files near repo size guidance; extract, shrink, or record a justified deferral before closeout when the cleanup pushes or leaves a file over the repo limit
   - run targeted verification for that cleanup
   - if the cleanup changes production runtime, compiler, schema, or shared test behavior, also rerun the affected original acceptance lanes before archival; a focused regression alone is not enough for closeout when shared behavior changed
   - continue reviewing for larger follow-up work after the fix
8. If there is a `reopen-original-ticket` item:
   - amend the original ticket so its status, outcome, acceptance state, and proof ledger no longer imply completion
   - state exactly what landed, what remains, and why the original ticket remains the cleanest owner
   - identify any follow-up or successor artifacts created by the reviewed implementation; if they overlap the reopened original ticket, delete untracked ones, or retarget/mark tracked ones truthfully before final handoff
   - update sibling tickets, dependencies, and specs when the reopened boundary changes their ownership story
   - do not archive the ticket in this review turn
   - final handoff must explicitly recommend the next workflow, normally continuing the same ticket with `implement-ticket`, and must include the active ticket path
   - final handoff should include: active ticket path, archive status, what landed, what remains, removed or retargeted follow-ups, verification run, and unrelated dirty paths when needed to keep ownership clear
9. For follow-up work:
   - prefer extending an existing active ticket when that produces a cleaner boundary and avoids overlap
   - otherwise create a new ticket in `tickets/` from `tickets/_TEMPLATE.md`
   - choose the original ticket's prefix series when the work is logically derived from that series
   - otherwise invent a new mnemonic prefix
   - if the implementation is acceptable but the original ticket still has a concrete named deliverable that did not land, split that remainder explicitly instead of silently treating the original ticket as fully satisfied
10. When extending an existing active ticket:
   - edit the ticket directly
   - preserve or improve architectural clarity
   - substantial reshaping is allowed if the better boundary is clear and evidence-backed
11. When creating a new ticket:
   - include concrete evidence from the review
   - align the problem and architecture check with `docs/FOUNDATIONS.md`
   - add dependencies instead of overlapping scope with other active tickets
   - keep the scope specific and actionable
   - if the new follow-up changes the truth of any sibling active ticket's dependency, audit boundary, or ownership wording, update those sibling tickets in the same review turn
   - after later archive/rewrite commands run, reread every active ticket you created or edited in this review turn and confirm `Deps`, `Files to Touch`, and any archive-path references are still literal-path correct
    - classify later old-path grep hits as `actionable path`, `historical/prose id`, or `already-correct archive path`; rewrite only actionable handoff references such as `Deps`, target snippets, live-path instructions, and markdown links that would send the next implementer to the wrong file
12. If review evidence shows the implementation can stand but the original ticket was not fully satisfied as written:
   - amend the original ticket's closeout text so it truthfully records the deviation
   - state what landed, what did not, and which active follow-up ticket now owns the remainder
   - only archive after that rewrite and after confirming no unresolved `must-fix-now` cleanup remains
13. Before archival, do a final contract check:
   - if this review reopened the original ticket, stop before archival and hand off to implementation continuation
   - if this review created or extended a follow-up because an original deliverable was missed, confirm the original ticket now says so explicitly
   - normalize the implemented ticket to archival-ready terminal status accepted by `docs/archival-workflow.md`, add or refresh `## Outcome`, and ensure it records what landed, deviations, verification, and any post-review cleanup
   - if review cleanup changed production runtime, compiler, schema, or shared tests, include a short post-review correction bullet and refreshed proof ledger inside that Outcome before archival
   - before running archival tooling, confirm every verification command listed in `## Outcome` is current after review-created code, schema, test, fixture, or shared artifact edits; if a command is intentionally retained as prior proof rather than rerun, label it that way in the outcome instead of implying it proves the post-review state
   - do not archive a ticket whose written outcome still implies that an undelivered named item was completed
   - if archival tooling rewrote active-ticket references, reread those touched active tickets and verify the rewritten literals are still path-correct and ownership-correct before considering the review complete
14. If no unresolved `must-fix-now` cleanup remains and the original ticket was not reopened, archive the implemented ticket per `docs/archival-workflow.md`.
15. After archival:
   - confirm the original source path is gone
   - inspect `git status --short` for the moved ticket and classify the archive state as `tracked rename`, `delete-plus-untracked archive`, or `plain untracked archive`; mention unusual archive state in the final handoff when it affects commit or staging readiness
   - run a literal old-path sweep across active tickets, the implemented spec or roadmap/doc that owns the ticket family, and the newly archived ticket
   - when sweeping markdown literals that may include backticks, use single-quoted shell patterns or split the search into plain-string anchors so the shell does not execute backtick contents before `rg` runs
   - For a moved ticket, prefer exact live-path patterns before classifying broad id hits: search for forms such as `` `tickets/<id>.md` ``, `../tickets/<id>.md`, `(../tickets/<id>.md)`, and bare `tickets/<id>.md`. Treat `archive/tickets/<id>.md` or `../archive/tickets/<id>.md` hits as already-correct archive references unless the surrounding prose still sends future work to the active path.
   - remember that `scripts/archive-ticket.mjs` rewrites active tickets only; specs, roadmaps, reports, and archived-ticket prose may still contain stale markdown links or live-path instructions
   - classify each old-path hit as `actionable path`, `historical/prose id`, or `already-correct archive path`; rewrite only actionable references, not harmless historical prose
   - when rewriting an already-archived ticket's `## Outcome` in a way that changes the recorded handoff or ownership meaning, add a dated amendment note; purely mechanical non-semantic path fixes do not need an amendment note
   - reread every file changed by the archive script or by the old-path sweep and confirm the remaining literals are ownership-correct
16. Run verification for review-created edits:
   - always run `pnpm run check:ticket-deps` after archiving or changing ticket dependencies
   - run `git diff --check -- <all-review-created-edited-files>` after must-fix cleanup or archive edits; for markdown-only archive fallout, the edited ticket/spec/archive markdown files are the minimum
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
  - original ticket reopened and not archived, including active ticket path and next workflow
  - active ticket extended
  - new ticket created
  - original ticket archived
  - removed or retargeted overlapping successor/follow-up artifacts
  - archive move status when it is unusual or affects commit/staging readiness
  - unrelated dirty paths only when needed to keep the ticket-review output distinct from other same-session or pre-existing work

## Guardrails

- Strong bias toward doing nothing unless evidence is concrete.
- Never create speculative refactor tickets.
- Never use a new ticket to hide a Foundation violation that should have been a tiny immediate fix.
- Do not reopen the finished ticket's scope merely to do review cleanup. Reopen only when concrete evidence proves a named deliverable is still undelivered and the original ticket remains the correct owner.
- Do not create overlapping tickets.
- Read active tickets before editing or creating follow-up work.
- Do not archive a finished ticket until its status and outcome satisfy `docs/archival-workflow.md` and its written outcome matches what actually landed, especially when a missed original deliverable was split into follow-up work during review.
- If uncertain whether a change is small enough to fix now or important enough to ticket, do nothing.

## Codex Adaptation Notes

- Do not assume fresh session context. This skill must work later from the ticket path plus repository state.
- Use normal Codex conversation context instead of slash-command arguments.
- This skill is action-taking, unlike `skill-audit`.

## Example Prompts

- `Use $post-ticket-review on tickets/104UNIDECCON-008.md`
- `Review tickets/104UNIDECCON-007.md after implementation and create follow-up tickets only if concrete evidence warrants it`
- `Run $post-ticket-review for archive/tickets/FOO-003.md and check whether nearby architecture needs an active follow-up ticket`
