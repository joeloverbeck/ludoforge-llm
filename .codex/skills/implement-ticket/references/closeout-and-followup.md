# Closeout and Follow-Up

1. If implementation completed and no blocking discrepancy remains, update the active ticket:
   - Set ticket status to its completed state when appropriate.
   - Add or amend the ticket outcome with what landed, boundary corrections, and verification that ran.
   - If the final diff intentionally omitted or expanded beyond original `Files to Touch`, record that explicitly in the ticket outcome.
2. Summarize what changed, what was verified, and any residual risk. Include:
   - Audited schema/artifact ripple effects (even if none needed)
   - Deferred verification owned by another ticket
   - Deferred sibling/spec scope confirmed during reassessment, when relevant
   - Resolved 1-3-1 decisions (especially Foundation type discipline)
   - Rules-evidence notes for game-specific legality corrections
   - Any unverified ticket premise (claimed repro seeds, counts, traces, production observations)
3. **Closeout checklist**:
   - What landed in this ticket
   - Which verification commands ran
   - Whether schema/artifact surfaces were checked and whether they changed
   - Scope deferred to sibling tickets, if any
   - Unverified ticket premises or residual risk
4. If the ticket appears complete, offer to archive per `docs/archival-workflow.md`.
5. If the user wants archival or follow-up review, hand off to `post-ticket-review`. When the main remaining work is archival hygiene, dependency integrity, or adjacent-ticket review, suggest it as the default next step. If this implementation superseded semantics in a recently archived sibling, call that out in the handoff.

## Final Acceptance Sweep

Before declaring completion or updating the ticket status, run one final acceptance sweep against the ticket text and your final diff:

- re-check non-command acceptance constraints such as file-size caps, named line-count limits, exact file/artifact deliverables, and explicit "do not modify X" boundaries
- use cheap structural probes when helpful (`wc -l`, targeted file existence checks, touched-file scope checks including untracked files)
- re-check repo-level structural conventions from `AGENTS.md` that remain relevant even if the ticket did not name them explicitly, such as file-size guidance, worktree discipline, and explicit artifact-touch expectations
- compare the ticket's named file/artifact list against the actual touched-file scope; if a named file was not actually required or an unlisted file became required, correct the active ticket before marking it complete
- for mixed tickets, build a compact deliverable ledger from `What to Change`, `Files to Touch`, and any explicitly named artifacts/tests. Classify each item as `done`, `verified-no-edit`, `blocked`, `rewritten in active ticket`, or `deferred by confirmed boundary change` before using `COMPLETED`
- when a ticket-named file or artifact already satisfies the deliverable without a code diff, record it explicitly as `verified-no-edit` in the ticket outcome rather than implying it was missed
- confirm the final state reflects any nonblocking draft-ticket corrections you planned to carry
- for shared contract migrations, confirm the final diff covers the intended helper/fixture normalization strategy and that any preserved serialized surface still matches the ticket outcome text
- if a command-level verification already passed but the acceptance sweep finds a remaining ticket invariant miss, fix that miss and rerun the affected proof lane before closeout
- for completed active tickets, use the explicit status spelling `**Status**: COMPLETED` unless the repo artifact already documents a different final status class such as `BLOCKED`, `DEFERRED`, or `REJECTED`

## Acceptance-Proof Invalidation

Acceptance-proof runs are invalidated by later edits. If any code, tests, fixtures, schemas, goldens, generated artifacts, or active-ticket text changes after the last green acceptance-proof lane, rerun the full acceptance-proof set before marking the ticket complete. Do not rely on an earlier green run once the final diff has changed.

When the deliverable ledger shows any ticket-named item still classified as `blocked` or unresolved, do not mark the ticket `COMPLETED` unless the active ticket has first been rewritten to reflect the confirmed narrower boundary.

## Durable Outcome Block

For tracked tickets, prefer making the closeout durable inside the ticket itself. A minimal tracked-ticket outcome block should capture:

- completion date or resulting status
- what landed in the owned boundary
- any boundary correction or semantic correction confirmed during reassessment
- verification commands that actually ran
- whether schema/artifact fallout was checked and whether it changed

## Durable State Classification

When the active tracked ticket was truthfully narrowed or rewritten and the owned slice lands while a newly created or newly recognized prerequisite remains open, classify the ticket's durable state explicitly before you stop:

- `COMPLETED`: the rewritten active ticket's owned boundary is fully satisfied and no remaining blocker sits outside the ticket.
- `BLOCKED by prerequisite`: the active ticket's owned work is done or partially done, but truthful closure still depends on another active ticket or unresolved external blocker. Record the landed slice and the blocker in the ticket outcome rather than leaving the state implicit.
- `PENDING untouched`: reassessment showed the ticket should stay forward-looking because implementation did not yet land any owned deliverable.

Prefer an explicit durable outcome block for the first two states so the ticket artifact reflects both the landed work and the remaining blocker.

## Optional State-Transition Ledger

For active-ticket rewrites that change the ticket graph itself, an optional final state-transition ledger can help keep the repo artifact honest:

- `active ticket after rewrite`
- `new/updated deps`
- `owned slice landed`
- `remaining blocker`
- `recommended durable status`

## Draft Ticket Durable Closeout

For active untracked draft tickets, prefer the same durable closeout pattern before finishing the turn: update the draft ticket status and outcome so later sessions inherit the corrected contract, touched-file scope, and repo-valid verification commands rather than the stale draft wording.
