# Measured Gate Closeout

Use this reference when a profiling, benchmark, or measured-gate ticket lands correctness work but the metric, threshold, or acceptance story is still under decision.

## Red Gate Status

When a code migration lands but an explicit benchmark/performance gate remains red, do not mark the ticket terminal just because ordinary tests are green. Record exact samples, threshold comparison, variance or drift when available, and the active route proof. If satisfying or relaxing the gate changes an explicit deliverable, status, scope, dependency story, or phase plan, stop for `1-3-1` before creating successors or rewriting acceptance.

Exception: a ticket may close with terminal wording on a red result only when it explicitly defines `red measured result + active route proof + successor/follow-up owner` as acceptance-complete and no stricter materiality note blocks that closeout. In that case, record exact red metrics, active-route proof, retained/rejected candidate classification, successor ownership, dependency/status rewrites, and `pnpm run check:ticket-deps` result before terminal status.

Use this terminal-status decision table:

- `green retained gate`: terminal status after exact metric transcription and normal final proof.
- `explicit red-plus-successor completion contract`: terminal status only with exact red metrics, materiality verdict, active route/implementation proof, non-overlapping successor, dependency integrity, and proof invalidation/rerun ledger.
- `red/blocked phase decision without explicit terminal wording`: keep `BLOCKED`, `PARTIAL`, or the repo equivalent, or stop for `1-3-1`.
- `user-approved close-enough red gate`: record an acceptance exception, not a passing gate; terminal status depends on the ticket family's explicit exception wording.

If qualitative language such as `significant`, `meaningful`, or `not tiny` appears in the ticket, spec, or reviewer note, classify the final same-command delta as `material`, `minor`, or `not demonstrated` before applying a red-plus-successor closeout.

## Ordering

For red measured gates, prefer this order:

1. Capture the decisive same-command metric and materiality verdict.
2. Record exact command, metric, threshold, verdict, and any variance/drift in the active ticket or report.
3. Create/update the successor or dependency/spec/sibling artifacts only after the decisive measurement if the successor scope depends on that evidence.
4. Run `pnpm run check:ticket-deps` when graph or status text changes, unless the ticket records why it does not apply.
5. Rerun affected proof lanes, or record why post-measurement edits were transcription/ownership only and did not invalidate the metric.
6. Apply terminal status as the final narrow edit when practical.

When the final result is materially worse than historical evidence or an earlier same-seam probe, run the cheapest same-checkout A/B comparison that preserves the owned seam before writing causal language. If that comparison is disproportionate, classify the residual as `current active-route red evidence` or `owned/unclassified residual`, not as proven causality.

## Candidate Discipline

For tickets with multiple plausible optimizations, use a measured experiment loop:

- apply one candidate at a time
- run focused correctness proof
- run the smallest representative smoke measurement
- profile only when the smoke is promising or diagnostically necessary
- revert or isolate candidates that regress, do not move the owned root-cause metric, remain red without an authorized exception, or shift the hotspot outside the owned seam

Before closeout, classify each retained performance candidate as exactly one of:

- `owned metric improved`
- `root-cause counter improved`
- `same-checkout A/B proves neutral`
- `user-approved keep`
- `revert before closeout`

For rejected candidates, keep a compact attempt ledger when it prevents repeated work: `candidate`, `correctness proof`, `measurement`, `verdict`, `cleanup proof`, and `reason not retained`.

## Worksheets

Optional red-gate outcome worksheet:

- `diagnostic baseline`: command, label, metric, threshold, active-route counters
- `candidate probes`: retained and rejected candidates, diagnostic correctness proof while each candidate existed, measured result, post-revert cleanup proof for rejected paths
- `decisive final metric`: command, label, metric, threshold, verdict, drift from probes
- `CPU/profile evidence`: artifact path or ephemeral note, parser command/method, top owners, ticket-owned samples, residual samples
- `successor handoff`: successor id, non-overlap rationale, dependent ticket/spec rewrites, `pnpm run check:ticket-deps` result
- `proof invalidation`: post-metric edits, rerun lanes, no-invalidation rationale, terminal status timing

For measured decision tickets whose truthful result is respec-only completion rather than retained optimization or successor work, use this worksheet before terminal status: `retired proof surface`, `replacement evidence`, `why no code/topology change is retained`, `why no successor is needed`, `retained code/report diff`, `materiality verdict`, `dependency/spec edits`, and `terminal-status basis`.
