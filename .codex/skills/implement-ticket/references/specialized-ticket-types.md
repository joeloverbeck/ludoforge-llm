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

For mechanical file-layout or rename tickets, use this compact checklist before broad proof:
- Validate the source file, importers, re-export barrels, and direct test consumers with `rg` before the first edit.
- Use `git mv` for repository-owned renames so the diff preserves move history.
- Update source imports, test imports, package barrels, generated import paths, and any source-text guard expectations that name the old path.
- Grep for old path stems and old emitted import specifiers after the rename; classify remaining hits as intended historical/prose references or update them before closeout.
- Keep Foundation 14 explicit: do not add compatibility aliases, duplicate re-exports, or transitional wrapper files unless the user confirms a boundary reset.
- Prove the layout invariant with the ticket-named grep or equivalent structural check, then run the smallest compile/build lane that must catch path drift.

## Gate, Audit & Profiling Tickets

For tickets whose primary deliverable is a measured decision:
1. Identify the explicit threshold, decision gate, or downstream trigger.
2. Verify which siblings, specs, or reports depend on that gate.
3. A complete implementation may legitimately end in "no runtime code changes" when the result closes proposed follow-up as not actionable. Still complete every owned repository deliverable: update ticket outcome, archive/amend deciding spec/report, reconcile dependent ticket statuses.
4. When a completed gate proves downstream siblings are not actionable, update those siblings in the same turn.
5. Distinguish runtime/code changes from repository-owned deliverables (ticket outcomes, archived specs, dependency rewrites, status updates).
6. If a diagnostic report has no named output file, prefer `reports/` over ephemeral scratch files.

When an audit compares profile, policy, feature-flag, or config variants, prefer a repeatable harness-level or in-memory override over temporary production-data edits until the measured verdict is known. The override must be explicit in the command and output/report, and any production config edit should happen only after the evidence shows a direct benefit. This preserves F#14 by avoiding compatibility aliases or speculative YAML churn while still making the A/B comparison reproducible.

When a profiling or benchmark failure appears after a candidate lands, separate **acceptance ownership** from **candidate causality**:

1. classify the red lane as active-ticket-owned when it exercises a touched execution path or ticket-named invariant
2. do not state that the candidate caused the failure until a same-environment baseline, A/B temp worktree, disabled/enabled comparison, or other direct causal probe proves it
3. if the distinction matters to the next action, run the cheapest causal probe before optimizing around the apparent failure
4. record the result as `owned/unclassified`, `candidate-caused`, `preexisting`, or `harness/substitution-caused` in the ticket outcome or working notes

For profiling or benchmark tickets that create or update a checked-in baseline, make the comparison itself durable. The active ticket outcome, report, or final closeout should include the baseline measurement, current measurement, absolute delta, ratio or percent change, threshold comparison, whether the warning/failure gate fired, and the exact command that produced the numbers. Do not leave the decisive "how much slower/faster" answer implicit in a passing harness.

For persistent-cache, accelerator, or hot-path reuse tickets, make activation diagnostics part of the first proof plan instead of a late add-on. Before the first decisive perf sample, ensure the owned seam exposes hit/miss/write, routed/not-routed, active-route, or equivalent counters that can distinguish `inactive`, `active but neutral`, `active and improved`, and `active and regressed`. Record where those counters will be transcribed. If an older baseline predates the counters, call that proxy out explicitly and keep the terminal verdict on a same-output-shape final comparison whenever practical.

For aggregate perf suites such as `test:perf`, preflight suite membership before treating the broad command as decisive. Inspect the package script or manifest and run a cheap `rg` for included test filenames, failing labels, and same-series residual owners in active tickets/specs/reports. If the broad suite contains known unrelated or same-series residual gates, run the ticket-owned perf fixture directly first and classify the aggregate suite up front as `decisive`, `supplemental`, or `expected classified red/non-final`. Record that classification before spending the broad lane or citing its result.

For staged cache, reuse, or static-artifact tickets where one phase can make an owned counter green while the aggregate perf witness remains red for sibling-owned counters, use a compact phase-slice ledger before terminal status: `owned counter`, `baseline count`, `final count`, `aggregate verdict`, `residual counters`, `sibling owners`, `terminal status allowed?`, `direct witness command`, and `broad-suite classification`. This is a diagnostic/ownership ledger, not permission to mark a measured gate complete when the ticket still promises the whole aggregate threshold.

When the decisive measurement output is short and the command is cheap enough to rerun, it is acceptable to transcribe the key JSON/log fields into the checked-in report or ticket outcome. When the output is expensive, large, flaky, or hard to reproduce, capture the raw output as a checked-in `reports/` artifact or explicitly record why the report transcription is the durable artifact. In both cases, include the exact command and enough identity fields to reproduce the run.

When a ticket, reviewer note, or spec adds qualitative materiality language such as "significant reduction", "meaningful improvement", or "not just a tiny follow-up", make that judgment explicit before closeout. Classify the final same-command delta as `material`, `minor`, or `not demonstrated`; record the baseline/current numbers and rationale. This materiality rule has precedence over the red-plus-successor exception: if the measured gate remains red with only a `minor` or `not demonstrated` reduction, use `BLOCKED`, `PARTIAL`, or `1-3-1` unless the user explicitly confirms a revised red-plus-successor closeout after seeing that classification.

For CPU-profile-backed benchmark tickets, keep the timed acceptance metric separate from the profiler's process-lifetime sample set. Before using top samples to choose implementation targets, residual owners, or successor scope, classify them as `inside timed acceptance surface`, `setup/process lifetime`, or `post-processing/observer overhead` when the profiler spans setup, imports, parsing, artifact loading, or analysis after the measured work. Record that classification in working notes, the ticket outcome, or the successor ticket when it explains why a hotspot is or is not the next owner.

For benchmark tickets that combine a production/code migration with an explicit measured acceptance gate, closeout depends on both halves. If the migration lands and focused correctness checks pass but the measured gate still misses, record the exact samples, mean, variance metric, threshold, and verdict; keep the active ticket `BLOCKED`, `PARTIAL`, or equivalent rather than `COMPLETED`; create or update the follow-up investigation/optimization owner named by the ticket or spec; update sibling/spec status so the series tells the same story; and run the repo's ticket-dependency integrity check after changing deps or adding the follow-up.

Exception: when the active ticket explicitly defines `red measured result + active route proof + successor owner` as acceptance-complete and no stricter materiality note blocks it, follow the main skill's red measured-gate exception. In that case, use the repo-local explicit completion wording, record exact red metrics and successor ownership, update dependent tickets/specs, and run dependency integrity before closeout.

When a benchmark/perf test exits green but only emits advisory warnings or omits the ticket-owned metric, treat it as a harness smoke, not final acceptance proof. Inspect the test or harness output shape, then either use the existing repo-owned command that prints/asserts the required metric or add a durable measurement path before final closeout. Record the green-but-non-asserting lane separately from the decisive measured verdict.

For exploratory optimization loops, make abandoned-candidate cleanup explicit before final proof:

1. keep negative evidence in a compact attempt ledger when it prevents repeated work
2. remove abandoned runtime helpers, exports, imports, tests, counters, and ticket wording that belong only to the rejected design
3. distinguish `diagnostic correctness proof while candidate existed` from `post-revert cleanup proof`; rerun the smallest focused correctness proof after cleanup when the cleanup touches code or tests
4. only keep an abandoned diff in the worktree when it is intentionally preserved as a follow-up artifact and called out in closeout

When an audit matrix spans surfaces that do not share a meaningful metric, do not force a fake scalar comparison. Classify each row as `comparable metric`, `covered by existing smoke`, or `no meaningful comparable metric`, and record the rationale in the ticket outcome/report. Use this especially when a broad acceptance criterion names multiple games, profiles, packages, or corpora but only one subset participates in the measured harness.

When a representative benchmark family lacks the authored signal surface needed to exercise the measured feature, do not invent a production migration or mark the family as meaningfully measured. Preserve production defaults, record the row as `diagnostic no-signal evidence`, name the missing signal surface, and identify the future owner that must introduce that surface before the benchmark can support default-change or quality claims for that family.

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
- For staged helper-only tickets, prove the callable helper seam directly: bounded cost or activation evidence when performance-related, deterministic same-input output when identity-sensitive, and no overclaim that production routing is active until the sibling integration ticket lands.
- For staged adapter/API tickets where production dispatch is deliberately sibling-owned, prove the adapter directly at its narrowest stable seam: guard behavior, structural return shape, key/map population, and any deterministic ordering or bounded-count fields the sibling will consume. Record in the active ticket that the adapter is callable but not yet production-routed, and update the sibling/spec text if a type-only or identity-only consumer rename was absorbed for Foundation 14 atomicity.
- In the final summary, separate what landed now from what remains deferred.
- Treat deferred adoption as residual risk only when callers still rely on older paths after groundwork lands.
- When the groundwork is a shadow chain, no-finalizer variant, no-side-effect mirror, or other mechanically mirrored fast path, audit the full transitive helper graph before coding. Do not stop at the ticket-named endpoint calls: check helper calls inside the mirrored path for the retired operation or side effect, and add local shadow helpers when needed so the intended invariant survives through tail calls and private helper boundaries.

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

## Compiler Diagnostic Tickets

For CNL/compiler diagnostic tickets whose owned behavior is a new warning, error, or validation message:

1. Locate the canonical diagnostic-code registry before adding the code. In this repo, generic diagnostic shape types may live separately from the string-code registry; use the live code owner rather than the ticket's guessed path when they differ, and record the correction in working notes or the active ticket outcome.
2. Decide which pass owns the diagnostic: structural validator, compiler/lowerer, cross-validator, schema boundary, or runtime GameDef validator. Prefer the earliest pass that legitimately has all required static information and matches `docs/FOUNDATIONS.md` validation boundaries.
3. Prove the diagnostic through the public compile or validate entrypoint that actually runs the owning pass. Avoid testing private helpers or exporting internals solely for the diagnostic unless the ticket explicitly owns that surface.
4. For warning-tier diagnostics, assert both the diagnostic code/severity/message trigger and that no error diagnostic blocks compilation when the authored state is otherwise valid.
5. Add suppression cases for each intended non-trigger boundary, especially corrected authoring, default/unset config, and sibling enum modes.
6. If the diagnostic code is added without changing schemas, serialized trace/result shape, or generated artifacts, record `generated fallout: none`; if the diagnostic changes an exported union, schema source, or serialized result field, switch to shared-contract guidance before final proof.

## Investigation Ticket Reassessment Patterns

For investigation tickets whose primary output is a checked-in measurement artifact, do one **minimal witness probe** before durable artifact generation whenever the ticket predicts a specific distribution, subset size, or diagnostic outcome. If that first probe contradicts the framing, stop for 1-3-1 before writing the durable fixture/report artifact; use a temp path or ephemeral output until the measurement seam is confirmed.

For long-running measurement tickets, that minimal probe should also validate the **output shape**, not just command viability. Before the expensive run, execute a one-seed, one-item, or otherwise tiny smoke probe and inspect that emitted rows use the promised unit of analysis, counters are per-row rather than accidental cumulative totals, required columns are present, and disabled/toggled modes report comparable fields.

For Ludoforge `profile-fitl-preview-drive.mjs --perCard` witnesses, use `perCardRows` as the per-card decision-count and milliseconds-per-decision oracle. The top-level `result.decisions` is tied to retained trace decisions and can be `0` when trace retention is `finalStateOnly`; do not use that top-level field as the positive per-card decision-count assertion unless the command configuration explicitly retains those decisions.

When the ticket's deliverable is a new long-running measurement script, design the script itself for bounded proof before the full corpus run. Prefer adding a representative subset option, file/item limit, or equivalent smoke mode that exercises the same code path and output schema as the full run. If stdout is the machine-readable artifact, send progress or heartbeat lines to stderr so a silent multi-minute run can be distinguished from a stuck child process without corrupting JSON output. The smoke mode is a preflight, not a replacement for a ticket-required full measurement unless a later 1-3-1 reset narrows the deliverable.

For measurement scripts over persistent caches, generated output, warmed artifacts, or other shared mutable state, treat probes that clear, warm, read, or rewrite the same state as output-contending. Do not run those probes in parallel when their timings, hit/miss counts, or activation evidence will be cited. If an accidental parallel probe completes, label it diagnostic/contaminated and rerun the smallest needed probe serially before using the numbers in a ticket, spec, or successor.

For exploratory benchmark sweeps, keep probes bounded and interruptible until the first representative case returns. Start with the smallest case that can validate the metric, avoid multi-case loops before that result is understood, and add per-case timeouts or progress output when a sweep may run silently for minutes. Before launching a silent or sparse-output command, write a compact stop plan in working notes: expected first-output or completion window, timeout/manual-stop threshold, whether the instrumentation is part of the measured surface, and the smaller fallback probe if the command exceeds the bound. If an exploratory command becomes stale or superseded, stop or classify it before final proof so delayed output does not contaminate the acceptance story.

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

When the ticket owns a checked-in fixture, profile, sidecar input, or report input that a test or harness is supposed to exercise, prove the artifact is the actual runtime/test input rather than only proving a nearby helper shape. The focused proof should parse or load the checked-in artifact and thread it into the asserted compile, runtime, trace, or report path. If the artifact is provenance-only or documentation-only, record that classification explicitly in the active ticket outcome before final proof.

When an investigation or measurement ticket needs a new checked-in helper script or harness to make the evidence repeatable:

1. run a syntax check and a minimal smoke command before the expensive proof run
2. verify that the smoke command exercises the same measured seam as the full command: representative input selection, cache/warmup state, skipped-body behavior, process boundary, counters, and output fields should match unless the ticket records a deliberate substitution
3. run the narrowest cheap static checker that covers the new script before the expensive corpus run when it is materially cheaper than the measurement, such as package lint for a checked-in Node script; if that checker is skipped, record why it is unavailable, stale, or disproportionate before spending the full measurement
4. for scripts expected to run silently for minutes, verify progress behavior on stderr or record why the script intentionally stays silent and how liveness will be checked without perturbing the metric
5. confirm the new file appears in `git status --short`, because untracked files do not appear in `git diff --stat`
6. add the helper to the active ticket's touched-file or outcome ledger before final proof
7. cite the helper's exact invocation in the durable report or ticket closeout
8. include the helper in the final touched-file scope sweep

When the repeatable evidence includes checked-in Markdown/CSV/JSON measurement artifacts, validate the artifact contract before closeout:

1. the report records the exact command and enough identity to reproduce the run
2. every requested seed, item, file, scenario, or corpus member is represented with an explicit complete/failed/skipped status
3. tabular summaries agree with the flat artifact row counts, such as CSV data rows matching the report's per-decision or per-item count
4. required columns or fields named by the ticket are present in the flat artifact, not only in prose
5. the decisive acceptance row, threshold, hot axis, delta, verdict, or classification appears in the report with the exact value used for terminal status
6. artifact paths appear in `git status --short` and are classified as checked-in deliverables, ignored ephemeral raw outputs plus transcription, or read-only context

When the repeatable evidence is a new Node perf fixture that spawns an existing package script and writes a durable JSON artifact, also check the package cwd, build prerequisite, stdout/stderr contract, artifact path, and ignore-rule state explicitly. Prefer parsing machine-readable stdout, keeping progress on stderr, writing ignored raw artifacts under a test-owned `.artifacts/` directory, transcribing the durable fields into the checked-in report or ticket, and rerunning the focused compiled fixture after any broad lane that rebuilds `dist`.

When the helper is a fixture/golden `regenerate` script:

1. run the regenerate script at least once after the authoritative producer is built or otherwise current
2. confirm the expected generated files changed or stayed stable for an understood reason
3. ensure at least one proof lane consumes the generated fixture/golden, or record explicitly why the checked-in artifact is evidence-only rather than test-consumed
4. if the regenerate script and consumer disagree, treat the generated artifact set as dirty, fix the producer/consumer boundary, regenerate again, and only then start final proof
