# Boundary Reset Recovery

Use these decision paths when a bounded implementation slice lands but the acceptance story or owned boundary has to shift mid-ticket.

## Broad Acceptance Lane Still Failing

When a bounded implementation slice lands but the ticket's named broader acceptance lane still fails on reproducible live evidence, do not treat the earlier local green run as completion by default. Classify the failing lane explicitly before deciding whether to continue:

1. `same-ticket owned under FOUNDATIONS`: the red lane still proves root-cause-incomplete work owned by the active ticket; stop for 1-3-1 unless the user has already authorized the broader completion boundary
2. `sibling-owned or separately owned`: the failing lane is real but belongs to another active ticket, advisory corpus, or explicitly non-blocking proof family; correct the active ticket/spec boundary and record the ownership handoff before closeout
3. `draft lane shape is stale`: the named lane no longer matches the truthful owned invariant even though the owned implementation is complete; rewrite the ticket's proof description before final proof rather than repairing the wrong lane shape

Treat this as an acceptance-lane reclassification step, not as ordinary test noise. The ticket cannot close truthfully until the active artifact, proof lane, and ownership story all agree.

## Moved Live Blocker

When the originally cited blocker disappears but the same broader lane later fails on a different file or witness class, treat that as a **moved live blocker**, not as "still the same ticket by inertia":

1. record that the original blocker no longer reproduces
2. identify the new failing file or witness class precisely
3. classify whether the new blocker is still owned by the active ticket, belongs to a new prerequisite/follow-up, or proves the broad lane shape itself is stale
4. rewrite the active ticket and any affected sibling/spec artifacts before closeout so the old blocker is not left as the durable story

## Diagnostic Narrowing Loop

When a first round of diagnostic instrumentation only proves that the blocker moved deeper into the same owned path, use this narrowing loop before adding more speculative fixes:

1. instrument the broad owner boundary once and identify the first child seam that does not return cleanly
2. remove or supersede the broader instrumentation before the next pass so later evidence stays readable
3. re-instrument only that first non-returning child seam and repeat until one concrete helper or enumeration path owns the blow-up
4. once the live owner is isolated, stop instrumenting wider siblings and patch the production seam directly

## Non-Implementation Boundary Rewrite Cleanup

When the user approves a non-implementation boundary rewrite after 1-3-1, use this cleanup order before durable series edits:

1. Classify any in-progress code/test/schema/artifact diff for the abandoned path as exploratory or abandoned implementation work.
2. Restore, delete, or otherwise isolate that abandoned diff before rewriting active ticket/spec artifacts, unless the user explicitly wants it preserved as an investigation artifact.
3. Rewrite the active ticket to its truthful durable state (`BLOCKED`, narrowed historical draft, corrected boundary, etc.).
4. Create or update successor tickets and dependent sibling tickets/specs in the same turn so the active series tells one consistent ownership story.
5. Run the narrowest consistency proof for the rewrite itself (for example dependency or archival checks) after the artifact rewrite lands.

## Same-Ticket Widened Re-Entry

When the user approves continuing under the **same ticket** after a `FOUNDATIONS`-driven widening, do not remain in the earlier bounded-local completion posture. Use this re-entry order before more implementation work:

1. restate the widened active-ticket boundary explicitly and mark the earlier bounded proof as `partial`, `superseded`, or another truthful non-final state
2. update the active ticket/spec/dependency artifacts first if their current wording still reflects the narrower slice or stale proof lane
3. emit a fresh working-notes checkpoint for the widened same-ticket scope rather than continuing on the old local-slice checkpoint
4. re-read the widened proof surface and any newly in-scope files, commands, or neighboring failing suites before coding
5. only then resume implementation and verification under the widened acceptance surface

Use this path when the user explicitly authorizes the widened same-ticket boundary. Do not force an unnecessary successor-ticket split once the user has chosen completion under the active ticket.

## Successor Ticket Re-Entry

When the user approves continuing under a successor ticket in the same session, use this re-entry order before more implementation work:

1. restate the successor ticket as the active owner and classify the prior ticket's remaining gap truthfully (`completed local slice`, `blocked`, `follow-up required`, or similar)
2. verify that the successor ticket, affected siblings, and active spec already reflect the reassessed ownership boundary; update them first if not
3. emit a fresh working-notes checkpoint for the successor slice rather than continuing on stale notes from the prior ticket
4. re-read any successor-specific files, commands, or proof lanes that were not authoritative under the prior ticket
5. only then resume coding and verification under the successor ticket's acceptance surface

## Post-Closeout Reopen

If the user explicitly widens the work after an apparent closeout or after one acceptance-proof set already passed, treat that as a **reopen of the active ticket slice**, not as a free-floating follow-up:

1. Restate the new authoritative boundary and why it widened (`user-directed scope widening`, `new blocker inside acceptance lane`, or similar).
2. Mark the earlier acceptance proof as invalidated if any code, tests, fixtures, generated artifacts, or active-ticket text will change.
3. Re-enter reassessment only for the newly widened slice; do not redo the whole ticket blindly if the earlier verified work still stands.
4. If the widened work changes ticket status truthfully (for example from `COMPLETED` back to `BLOCKED` or `PENDING`, then back to `COMPLETED`), update the active ticket artifact so it matches the live state at each durable checkpoint.
5. Rerun the full acceptance-proof set after the reopened edits land.
