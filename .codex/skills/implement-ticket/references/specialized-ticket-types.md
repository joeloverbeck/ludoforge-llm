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

When an audit compares profile, policy, feature-flag, or config variants, prefer a repeatable harness-level or in-memory override over temporary production-data edits until the measured verdict is known. The override must be explicit in the command and output/report, and any production config edit should happen only after the evidence shows a direct benefit. This preserves F#14 by avoiding compatibility aliases or speculative YAML churn while still making the A/B comparison reproducible.

For profiling or benchmark tickets that create or update a checked-in baseline, make the comparison itself durable. The active ticket outcome, report, or final closeout should include the baseline measurement, current measurement, absolute delta, ratio or percent change, threshold comparison, whether the warning/failure gate fired, and the exact command that produced the numbers. Do not leave the decisive "how much slower/faster" answer implicit in a passing harness.

When an audit matrix spans surfaces that do not share a meaningful metric, do not force a fake scalar comparison. Classify each row as `comparable metric`, `covered by existing smoke`, or `no meaningful comparable metric`, and record the rationale in the ticket outcome/report. Use this especially when a broad acceptance criterion names multiple games, profiles, packages, or corpora but only one subset participates in the measured harness.

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

## Investigation Ticket Reassessment Patterns

For investigation tickets whose primary output is a checked-in measurement artifact, do one **minimal witness probe** before durable artifact generation whenever the ticket predicts a specific distribution, subset size, or diagnostic outcome. If that first probe contradicts the framing, stop for 1-3-1 before writing the durable fixture/report artifact; use a temp path or ephemeral output until the measurement seam is confirmed.

For long-running measurement tickets, that minimal probe should also validate the **output shape**, not just command viability. Before the expensive run, execute a one-seed, one-item, or otherwise tiny smoke probe and inspect that emitted rows use the promised unit of analysis, counters are per-row rather than accidental cumulative totals, required columns are present, and disabled/toggled modes report comparable fields.

For exploratory benchmark sweeps, keep probes bounded and interruptible until the first representative case returns. Start with the smallest case that can validate the metric, avoid multi-case loops before that result is understood, and add per-case timeouts or progress output when a sweep may run silently for minutes. If an exploratory command becomes stale or superseded, stop or classify it before final proof so delayed output does not contaminate the acceptance story.

When a long-running measurement witness has a **stable earlier prefix** already backed by durable evidence and the later tail is flaky or environment-sensitive, prefer narrowing to that smallest truthful prefix over preserving the longer tail by inertia. Record the narrowed bound explicitly in the active ticket before final proof so the witness does not look silently weakened.

If that narrowing changes an **explicit ticket deliverable** (for example a named full-corpus measurement, exact turn horizon, required artifact scope, or threshold decision), `AGENTS.md` Ticket Fidelity wins over the narrowing preference: stop for 1-3-1 unless the ticket already authorizes bounded-prefix substitution. After confirmation, update the ticket outcome before final proof and classify the durable state honestly as `COMPLETED`, `PARTIAL`, or `BLOCKED` rather than treating a narrower artifact as equivalent by default.

When an investigation/profiling ticket needs one command to **reproduce the live failure** and a different command to **produce a durable artifact** (for example a stable snapshot/report run versus a higher-turn crash repro), do not collapse them into one fuzzy story. Treat them as two explicit evidence lanes:

1. identify which command is the best failure repro
2. identify which command is the best durable artifact-capture path
3. if the ticket draft claimed one command served both roles and live evidence disproves that, stop for `1-3-1` unless the user has already authorized that deliverable correction
4. once authorized, record both commands explicitly in the active ticket outcome/report before the final proof pass

For heavy diagnostics that may run silently for a long time or where post-processing can distort the measured surface, add a lightweight observer-effect check before finalizing the artifact:

1. add only the minimum progress instrumentation needed to distinguish `still running` from `stuck`
2. keep that instrumentation outside the owned metric whenever practical, or report clearly when it can perturb the measurement
3. separate the target-system metric from analysis/post-processing overhead when both occur in one script (for example simulation heap versus heap-snapshot parsing cost)
4. report both numbers distinctly if the post-processing step materially changes the observed totals

When the owned deliverable is a large checked-in fixture or inventory artifact, prefer generating it from the most authoritative live seam available (compiled spec surface, runtime snapshot, parser output, or equivalent) instead of hand-authoring repeated rows. Before check-in:

1. record the derivation source in working notes
2. capture a compact summary (`entry counts`, `surface classes`, `deepest cases`, or similar) so the artifact can be sanity-checked without rereading the whole file
3. add or extend a validator that proves schema conformance plus coverage parity against the same live seam when proportionate

When an investigation or measurement ticket needs a new checked-in helper script or harness to make the evidence repeatable:

1. run a syntax check and a minimal smoke command before the expensive proof run
2. confirm the new file appears in `git status --short`, because untracked files do not appear in `git diff --stat`
3. add the helper to the active ticket's touched-file or outcome ledger before final proof
4. cite the helper's exact invocation in the durable report or ticket closeout
5. include the helper in the final touched-file scope sweep

When the helper is a fixture/golden `regenerate` script:

1. run the regenerate script at least once after the authoritative producer is built or otherwise current
2. confirm the expected generated files changed or stayed stable for an understood reason
3. ensure at least one proof lane consumes the generated fixture/golden, or record explicitly why the checked-in artifact is evidence-only rather than test-consumed
4. if the regenerate script and consumer disagree, treat the generated artifact set as dirty, fix the producer/consumer boundary, regenerate again, and only then start final proof
