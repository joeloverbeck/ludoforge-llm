# Specialized Ticket Types

## Mechanical Refactors

For tickets whose primary deliverable is a mechanical extraction, rename, deduplication, or import cleanup with no intended behavior change:
- Prove the duplication or stale surface exists before editing.
- Record stale sub-claims (imports, helpers, touch points proved unnecessary during reassessment) in working notes before coding.
- Scan private helper functions as well as exported entry points for the same class of write/mutation/alias the ticket eliminates. Same-file helper fallout is usually in-scope.
- Extract or consolidate with the narrowest architecture-consistent module or helper.
- If the ticket's named shared helper covers only part of the live pattern, compose it with the smallest additional helper needed to eliminate the remaining caller-local transform.
- Scan touched files for dangling references to removed locals before running broader verification.
- Acceptance proof: old local surfaces are gone, consumers reference the shared surface, authoritative non-regression commands pass.
- Nearby dangling symbols, imports, or signature ripple necessary for refactor completion: in-scope fallout.

## Gate, Audit & Profiling Tickets

For tickets whose primary deliverable is a measured decision:
1. Identify the explicit threshold, decision gate, or downstream trigger.
2. Verify which siblings, specs, or reports depend on that gate.
3. A complete implementation may legitimately end in "no runtime code changes" when the result closes proposed follow-up as not actionable. Still complete every owned repository deliverable: update ticket outcome, archive/amend deciding spec/report, reconcile dependent ticket statuses.
4. When a completed gate proves downstream siblings are not actionable, update those siblings in the same turn.
5. Distinguish runtime/code changes from repository-owned deliverables (ticket outcomes, archived specs, dependency rewrites, status updates).
6. If a diagnostic report has no named output file, prefer `reports/` over ephemeral scratch files.

## Investigation Tickets

For tickets whose primary deliverable is a verdict rather than a production code change:
1. Capture the decisive evidence in the owned ticket or other explicitly owned artifact.
2. If the verdict warrants downstream implementation, create or extend the follow-up ticket in the same turn; keep deps/status consistent.
3. After verdict and any required follow-up artifact are in place, decide whether the investigation ticket is archive-ready.
4. If archival is the obvious next state, complete it when the user asked for full closeout, or hand off to `post-ticket-review`.
5. Distinguish ticket-owned deliverables (verdict text, follow-up ticket, dependency updates, archival readiness) from runtime/code changes.

## Groundwork Tickets

For preparatory tickets landing shared helpers, contracts, or APIs ahead of caller migration:
- Implement the owned groundwork fully even when no live caller adopts it yet.
- Keep broader behavioral adoption anchored to the sibling tickets that own it.
- In the final summary, separate what landed now from what remains deferred.
- Treat deferred adoption as residual risk only when callers still rely on older paths after groundwork lands.

## Production-Proof & Regression Tickets

- Prefer extending the live test module that already owns the contract under audit before creating new files solely to match stale ticket test paths.
- If cited production examples, cards, or seeds are stale, prefer a current deterministic reproducer or synthetic proof fixture.
- Run a bounded seed/turn/trace scan to discover a current reproducer, then encode it into owned integration tests.
- Distinguish clearly between **incidence proof** (the cited repro still happens) and **mechanism proof** (the code still permits the failure). If incidence remains unverified, resolve via 1-3-1 first.
- For lifecycle/state-source migrations where a field becomes the single source of truth, audit both read and write paths: grant construction, issue-time probes, post-consumption advancement, post-skip/expire behavior, derived-state authorization, probe-time synthesized pending state.
- Record exact pre-fix evidence in a durable surface before the implementation overwrites that state.
- When a proof needs live authored behavior plus a small test-only policy or hook, compile the production spec with a narrow in-memory overlay rather than editing production data.
- If the ticket names files to inspect rather than modify, read and assess them; leave unchanged when evidence shows no edit is needed; state the no-change decision explicitly.
- If a ticket names an authored data file as an optional surface tweak, verify whether compiled defaults already satisfy the contract before editing.
