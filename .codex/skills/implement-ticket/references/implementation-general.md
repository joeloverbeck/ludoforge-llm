# Implementation: General Principles and Series Consistency

## General Principles

- Implement every explicit ticket deliverable. Do not silently skip items.
- Prefer minimal, architecture-consistent changes over local patches.
- If an existing authority/helper API is broader than the caller's verified contract, add the narrowest authority-level helper that preserves semantics rather than embedding a caller-local workaround.
- When consolidating logic into a shared authority module, inspect import direction first and prefer placement that preserves an acyclic dependency graph.
- When a ticket's named implementation file delegates through a deeper shared authority module, the minimum authority-module work required to make the named deliverable real is in-scope. Update any sibling that previously claimed that absorbed slice.
- Follow TDD for bug fixes: write the failing test first, then fix the code. Never adapt tests to preserve a bug.
- Treat `docs/FOUNDATIONS.md` as higher priority than ticket wording. Surface conflicts and propose Foundation-compliant resolutions.
- The ticket's `Files to Touch` is a strong hint, not a hard limit. Include adjacent files for contracts, consumers, schemas, fixtures, or tests when coherent completion requires them.
- When a ticket moves or re-exports an existing symbol, minimal consumer import fallout to keep the repository building is in-scope.
- "No code changes" means no production/runtime behavior changes. Ticket outcomes, archival moves, dependency rewrites, and sibling-ticket status updates are still required when owned.
- If reassessment reveals a generic architectural limitation broader than the ticket's boundary, prefer creating or extending a follow-up spec.

## Implementation-Discovered Defects and Proof Narrowing

- If implementation exposes a new bug or semantic defect inside the owned ticket slice, follow repo TDD rules when practical: add the narrowest failing proof first, then fix it, and record the proof lane in working notes.
- Before inventing a brand-new synthetic failing test, check whether an existing nearby unit/integration fixture, regression, or focused failing lane already proves the same seam closely enough. Prefer extracting, tightening, or adapting the smallest existing repo-owned witness when it remains the narrowest valid proof.
- If a focused failing proof is not practical for an implementation-discovered defect, state why and keep the verification lane as narrow and behavior-specific as possible.
- If an initially plausible integration reproducer fails for reasons outside the owned boundary, pivot to the narrowest live authority surface that still proves the ticket's invariant. Record the substitution and whether the resulting evidence is direct or indirect.
- When a ticket's authoritative witness is a long campaign, replay, or simulation harness, prefer a compact reduction before patching:
  1. rerun the authoritative harness
  2. locate the earliest deterministic failing move prefix or state slice
  3. inspect the authoritative post-prefix runtime state or current action/card identity
  4. replace the broad repro with the narrowest direct proof lane that still preserves the ticket invariant
- If bounded reads, targeted probes, and narrow helper-level checks still cannot isolate the live hot path during reassessment, temporary diagnostic instrumentation is allowed. Keep it narrowly scoped, gate it behind an explicit env flag or similarly local switch, use it only long enough to confirm the boundary, and remove it before final verification.
- If completed owned work remains valid but a newly exposed blocker is narrower and prerequisite to the original ticket acceptance, prefer creating a new prerequisite ticket and blocking the current active ticket rather than repeatedly widening the active ticket. Keep the current ticket focused on its delivered work plus the now-explicit dependency.
- When a ticket is split after exploratory or partial code changes already exist in the worktree, explicitly classify those diffs before closeout:
  - `belongs to completed current ticket`: keep and document them under the current ticket's partial/completed outcome
  - `keep as in-progress for follow-up`: leave them in place only if they match the new live boundary and call that out explicitly in working notes or closeout
  - `revert before handoff`: remove them if they no longer belong to either the current ticket or the new prerequisite
  Record the classification so the ticket rewrite and the live workspace state do not silently diverge.

## Series Consistency

When a ticket change affects other active tickets in the same series:
- Inspect siblings for overlap, stale staged ownership, or stale assumptions.
- Update statuses, deps, and scope text so the active series stays coherent.
- Run `pnpm run check:ticket-deps` when available.
- If a downstream sibling cleanly owns the remaining fallout, leave it unchanged and validate deps/status.
- If the active ticket's authoritative verification fails on generated artifacts, goldens, or other repo-owned fallout that a sibling draft planned to pick up later, absorb the minimum fallout required for the active ticket to be true in live runtime, then update the affected sibling(s).
- Note informative but non-blocking sibling drift in working notes without absorbing scope.
- If sibling/spec artifacts are already dirty or untracked drafts, prefer editing only the active ticket unless the user asked for broader cleanup or the stale sibling would directly invalidate the boundary.
- If a referenced spec mentions a deliverable split into a later sibling, keep implementation anchored to the current ticket boundary.
- When a new follow-up spec changes framing around an adjacent active spec, prefer a small cross-reference update over rewriting the adjacent spec's problem statement.

### Session and Series Context

- **Session continuity**: Reuse already-verified context from prior tickets in the same series. Prefer reusing or extracting helpers over duplicating logic. If a completed sibling already satisfied part of the current deliverable, anchor reassessment to the remaining gap.
- **Series slice discipline**: When a referenced spec is broader than the current ticket, treat the ticket as the implementation boundary unless verified evidence shows the slice is stale, internally inconsistent, or impossible without broader fallout. Confirm which broader spec work is deferred to siblings.
- **Named fallout classification**: When a ticket names multiple fallout surfaces, explicitly classify each as `still failing`, `already green`, or `already absorbed by sibling` before coding. Treat already-green named artifacts as verified non-owners unless new evidence reopens them.
- **Active draft series sanity check**: When the active draft ticket explicitly references sibling draft tickets by number, scope, or out-of-scope ownership, open those siblings long enough to confirm the current ticket has not already been absorbed, contradicted, or rendered stale. A lightweight sanity pass is enough unless reassessment reveals real ownership drift.
- **Ticket re-entry after follow-up creation**: If the same area was previously split into a follow-up ticket and the user now reopens or explicitly points back to the original ticket, classify the relationship before coding as one of:
  - `resume original`: the original ticket was never truly closed, and the follow-up is redundant or advisory
  - `continue follow-up`: the original ticket remains complete enough, and the new work still belongs to the follow-up
  - `user override of earlier split`: the user is intentionally putting the remaining work back under the original ticket
  Record that classification in working notes and restate the authoritative boundary so the active ticket/follow-up ownership is explicit before implementation resumes.

### Series Rewrite Checklist

When a confirmed boundary rewrite absorbs or defers work across the series:
1. Open each directly affected sibling ticket before coding.
2. Compare sibling named files, deliverables, and deps against the rewritten boundary.
3. Update sibling scope/deps/status in the same turn or record why no edit was necessary.
4. Run `pnpm run check:ticket-deps` when available.
5. In working notes and final closeout, name absorbed and deferred scope.

## Named-Witness Regression Loop

For named-witness regression tickets that cite a small seed/case matrix, add one cheap direct witness loop between candidate fixes and the heavier acceptance lanes:

1. rerun the exact named seeds/cases directly through the most authoritative live seam available
2. use that matrix to classify `still broken`, `partially repaired`, or `fully repaired on owned witnesses`
3. if the result is only `partially repaired`, stop for `1-3-1` before continuing when the remaining fix path is no longer obvious
4. only return to the heavier focused/package/workspace acceptance lanes once the named witness matrix matches the intended boundary

## Representative-Corpus Preflight

For representative-corpus proof tickets that do **not** bind to exact seeds/cases, use this compact preflight before writing or finalizing the durable witness set:

1. probe each candidate once through the authoritative fresh path
2. classify each candidate as `owned invariant exercised cleanly` or `candidate blocked by unrelated live failure`
3. keep the smallest representative passing subset that still covers the ticket's stated surface
4. record any dropped candidate and replacement in the ticket outcome before final proof so the closeout explains why the final corpus changed

## Same-Ticket Widened Continuation Checklist

When `docs/FOUNDATIONS.md` and live proof require the active ticket to widen in place, run this short checklist before treating any later proof as final:

1. confirm the earlier bounded seam is no longer sufficient for ticket completion
2. restate the widened owned outcome in commentary and working notes
3. update the active ticket's boundary/proof wording before the final proof pass if it still reflects the narrower slice
4. run the widened proof surface that now owns completion
5. close the ticket only once that authoritative acceptance lane is green

## Synthetic Fixture Checklist

When a ticket needs a new narrow kernel/compiler proof with a synthetic fixture, prefer this setup unless live code says otherwise:

1. Use the real runtime seam whenever practical (`resolveMoveDecisionSequence`, `legalChoices`, classifier/admission helpers, etc.) instead of mocked request objects or hand-simulated intermediate structures.
2. Reuse existing fixture helpers such as `asTaggedGameDef`, effect-tag helpers, and nearby state builders before inventing new one-off scaffolding.
3. Verify whether the test should import from the public package surface or an internal module before writing the fixture.
4. If the assertion depends on runtime-generated identifiers, derive the canonical identifiers from the live seam first, then build the expected witness/certificate/assertion payload from that observed sequence rather than hardcoding draft-shaped literals.
5. If the production seam is intentionally absent because the ticket is proving feasibility ahead of implementation, prefer the smallest deterministic sketch harness that models the proposed contract directly. Keep that scaffold local to the test/prototype surface and make the proof target explicit (`feasibility`, `suspend/resume ordering`, `serialization stability`, etc.), not production readiness.

When a synthetic fixture proves simulator boundedness, turn retirement, or `runGame` stop behavior, add this stale-witness check before treating silence or timeout as harness drift:

1. verify the live stop budget the runtime actually enforces (`turnCount`, decision count, terminal condition, or another owned bound) instead of assuming the draft witness still targets the same budget surface
2. check that the fixture's legal-action frontier still advances the owned stop surface under the current protocol; a same-turn repeatable action may keep emitting legal decisions forever without progressing the budget the simulator now uses
3. if the fixture no longer advances that surface, fix the witness first and rerun before escalating to runner or harness diagnosis
4. when the remaining negative-path contract is a structured runtime/kernel error, prefer asserting the stable error code or equivalent structured field over a brittle regex against the formatted message

## Regression Placement Triage

When a bug lives in a shared runtime seam but the smallest truthful witness may be game-backed, choose the first regression target with this order:

1. prefer a narrow shared-seam unit test when the failing contract is reproducible without runtime-owned game identities or shipped-sequence context
2. prefer a shipped-game integration witness when the bug depends on live action identities, grant sequencing, event/card routing, or another runtime-owned surface that a synthetic fixture would have to guess
3. when both are useful, land the game-backed witness first for correctness, then add the shared-seam unit only if it stays narrow and does not duplicate the same proof burden

Record the chosen witness surface in working notes when the choice is not obvious from the ticket text.

## Direct Fallout Test Triage

When a ticket retires a public surface and the first build exposes a large direct-fallout test set, classify each affected test before editing:

1. `delete` the test when its primary asserted contract is the retired surface itself (deleted export, legacy overload, certificate/template helper, or another compatibility-era artifact)
2. `migrate` the test when it still proves a retained runtime, legality, visibility, replay, or agent behavior on the live boundary
3. if many fallout tests are deleted in one sweep, record the rationale in the active ticket outcome so the reduction is inspectable rather than looking like silent coverage loss

Use this rule to avoid both over-migrating dead compatibility tests and over-deleting tests that still prove live behavior.
