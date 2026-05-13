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
3. sweep the active ticket metadata that can silently preserve the old boundary: `Status`, `Engine Changes` or equivalent scope headers, `What to Change`, `Files to Touch`, `Out of Scope`, `Acceptance Criteria`, `Test Plan`, command wording, generated-fallout notes, and source-size/runtime-surface ledgers. Patch stale fields before proof, or record why a field intentionally remains unchanged.
4. emit a fresh working-notes checkpoint for the widened same-ticket scope rather than continuing on the old local-slice checkpoint
5. re-read the widened proof surface and any newly in-scope files, commands, or neighboring failing suites before coding
6. only then resume implementation and verification under the widened acceptance surface

Use this path when the user explicitly authorizes the widened same-ticket boundary. Do not force an unnecessary successor-ticket split once the user has chosen completion under the active ticket.

Before terminal closeout after this path, run a reset compliance check: the authorization ledger names the approved option and scope effect; active ticket/spec/sibling artifacts were patched before widened coding resumed, or the ticket outcome records the late repair plus rerun proof; a fresh checkpoint exists for the widened boundary; acceptance/proof lanes were re-extracted from the corrected artifact; and no later mismatch class exceeded the approved option without a new `1-3-1`.

## Confirmed Narrowed or Deferred Boundary Re-Entry

When the user approves a `FOUNDATIONS`-driven narrowing, deferral, or sibling handoff while the active ticket still remains the implementation owner for a smaller slice, do not continue on the pre-reset draft contract. Use this re-entry order before coding:

1. Restate the approved active-ticket boundary and the specific deferred or sibling-owned surface.
2. Record the authorization in working notes or the active ticket with the selected option, scope effect, and durable owner of deferred work.
3. Update the active ticket, spec, and affected sibling tickets first when their current wording still claims the deferred surface.
4. Create or update the successor/follow-up owner when the reset splits real work out of the active ticket. The successor must name the residual surface precisely enough that the active ticket can close without hiding it.
5. Scan direct dependents before coding. Use an id/path search such as `rg -n '<active-ticket-id>|Deps:.*<active-ticket-id>' tickets specs` or the nearest repo-safe equivalent, then classify each hit as `no edit`, `updated stale assumption`, or `successor owner`. Update same-series dependent acceptance text when it still assumes the old boundary.
6. Classify every deferred public/authored syntax or artifact in the reset class as `absent`, `rejected fail-closed`, or `implemented now`. If the current compiler, schema, CLI, or public API still accepts a deferred syntax, add or preserve a focused fail-closed diagnostic before terminal status unless the user-approved option explicitly kept that syntax in scope.
7. Emit a fresh working-notes checkpoint for the narrowed slice, including `proof noun alignment`, `authorization ledger`, `deferred sibling/spec scope`, `verification substitutions`, changed final proof lanes, dependent-sibling classification, and deferred-syntax disposition.
8. Re-extract `What to Change`, `Files to Touch`, acceptance criteria, and proof commands from the corrected active ticket before implementation.
9. Only then resume coding and verification under the corrected boundary.

Use this path when the active ticket remains closeable after the correction. If the correction makes the active ticket evidence-only, blocked, or successor-owned, use the non-implementation rewrite or successor re-entry path instead.

Before terminal closeout after this path, run the same reset compliance check: authorization recorded, active artifacts corrected before resumed coding or explicitly repaired with rerun proof, fresh checkpoint emitted, proof lanes re-extracted, and no unapproved later mismatch class folded into the terminal status.

## Foundation Numeric Normalization

When a `FOUNDATIONS.md` reset requires replacing non-integer rule-authoritative values with an exact integer representation, do not treat the edit as a mechanical value rewrite. Use this proof shape:

1. identify every authored and generated value in the same mismatch class, not just the first literal that blocked the ticket
2. state the integer scale factor or transformation rule and why it preserves the intended score ordering, ratios, thresholds, or other semantics the ticket relies on
3. update the active ticket/spec before final proof with the corrected numeric-domain assumption and any widened touched-file/artifact surface
4. regenerate or validate every committed mirror produced from the authored source, then classify unexpected generator output as owned fallout, stale canonical drift, or unrelated churn
5. add a focused probe or test that proves the normalized compiled/runtime surface is integer-only for the owned family when that surface is part of the acceptance claim

Reject rounding, truncation, or silent compiler/runtime coercion unless the user explicitly changes the spec to make that lossy behavior rule-authoritative.

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
