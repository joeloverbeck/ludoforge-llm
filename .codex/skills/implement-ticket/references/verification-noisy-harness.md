# Verification: Noisy Harness Handling

## Standalone Silent Acceptance Command

When a standalone acceptance command starts cleanly but does not return a final harness summary in-terminal during the session, do not over-claim that lane as directly green. Record the exact observed output, classify whether the behavior appears to be the repo's existing silent-harness pattern or a new blocker, and state whether broader passing package/workspace suites covered the same lane.

If a broad package or workspace lane exits zero but emits known retained-test stderr, runner warnings, crash-recovery diagnostics, or jsdom/browser-environment noise outside the ticket-owned failure surface, treat the lane as green rather than `harness-noisy / not final-confirmed`. Mention the stderr only when it affects confidence in the ticket-owned proof, when the ticket owns the noisy surface, or when the output is new enough that it needs classification.

In this repo, when the ticket names `pnpm -F @ludoforge/engine test`, inspect `packages/engine/scripts/run-tests.mjs` or the active lane manifest early enough to see whether the default lane tails into `policy-profile-quality` witnesses. If the owned ticket is not itself about policy-profile quality and the run later narrows to a long single-file convergence witness with only heartbeat progress, preserve that evidence explicitly in the ticket outcome instead of assuming the broad lane will soon return.

If that same inspection or direct witness repro shows the surfaced corpus is architecturally non-blocking or separately owned, do not keep treating it as mandatory blocking acceptance proof just because the current broad lane still includes it. Correct the lane ownership or ticket proof story first, then rerun proof against the truthful boundary.

## Long-Running Package Lane Progress Triage

For long-running package lanes that already printed `ok` lines for the ticket-owned retained regressions and later files, do one explicit progress triage before waiting indefinitely:

1. identify the last printed passing file and whether the runner is now only emitting repeated quiet-progress notices
2. probe the most likely expensive tail file directly with a bounded single-file run when proportionate
3. before launching that heavy tail-file probe, ensure the original broad lane is no longer running; if it is still live, either keep waiting on it or terminate it cleanly first instead of overlapping both commands
4. if that direct file run returns cleanly but the package lane still does not hand back a final shell prompt after repeated quiet-progress cycles, record the package lane as `harness-noisy / not final-confirmed` rather than blocking closeout indefinitely
5. cite the directly observed retained-regression passes plus any successful single-file tail probe separately from the noisy package-lane result

This preserves truthful proof language without requiring unbounded waiting on runner noise.

Do not assume the last printed TAP line or custom reporter "current file" label is the file still executing. In batched runners, a reporter may retain the last event from an earlier child process while a later integration file, wrapper tail, or quiet heartbeat is actually stuck. Before recording the timeout location durably, inspect the wrapper/reporter semantics or rerun with a per-child diagnostic plan when feasible.

Before starting or continuing a broad lane that is known or suspected to have heavyweight tail files, set a proportionate triage plan up front when ticket-owned focused witnesses are available: identify the owned witness files, identify likely non-owned tail files from the manifest or recent lane history, decide a bounded wait limit for repeated quiet-progress output, and decide which direct focused command will preserve the owned proof if the broad tail times out. If the broad tail later times out outside the touched seam, record the focused owned witnesses and the timeout location separately instead of rewriting the implementation around the broad tail by default.

Compact reporter-semantics diagnostic recipe:

1. inspect the package script or wrapper execution mode (`batched`, `sequential`, shard manifest, child timeout, environment)
2. inspect the reporter state model: whether "current file" means active child, last received test event, last completed file, or heartbeat context
3. compare direct child execution with the wrapper's exact invocation shape before blaming the test file alone
4. if the wrapper cannot attribute the tail accurately, prefer a temporary or permanent per-child attribution path before changing production test logic
5. record in the active ticket whether the observed label was an actual failing file, a stale reporter label, or an unknown non-final location

## Interrupted Host or Resumed Verification

When the terminal, VM, WSL instance, or host environment hangs or is restarted during a long verification lane, do not count the interrupted lane as green or red. Resume from the last trustworthy observation:

1. check for leftover package-manager, runner, node, build, or test processes before starting another proof lane
2. record the last printed file/test, last passing file, and whether the lane had plausible slow tail files remaining
3. avoid rebuilding or cleaning produced artifacts until any leftover consumer process is gone
4. probe the likely heavy or last-observed files one at a time with bounded commands before rerunning the full corpus
5. classify the interruption as `host/interrupted`, `likely resource pressure`, `harness-noisy`, or `owned test hang` only after that direct evidence
6. record the resumed proof strategy and any remaining unproven broad lane explicitly in the active ticket outcome

If context compaction, tool-session loss, or handoff means the original proof session id cannot be polled for a final exit code, classify that lane as `no final exit code observed` rather than inferred green. Use any visible output only as diagnostic evidence, then rerun the lane or a truthful focused substitute before citing it as final acceptance proof.

## Resource-Hotspot Evidence

When a corpus lane may be causing OOM, swap pressure, or host-level stalls, collect resource evidence from the smallest representative command before tuning thresholds or rewriting tests:

1. run the suspected file or smallest corpus slice with a bounded timeout
2. use `/usr/bin/time -v` or an equivalent local resource wrapper when available to capture wall time and maximum resident set size
3. keep resource probes one-at-a-time unless the ticket specifically owns concurrency behavior
4. if an isolated file passes but shows high RSS or long runtime, record it as a resource hotspot rather than an intrinsic test failure
5. if the package runner batches multiple heavyweight files into one process and that process boundary affects the failure, treat the runner/package script as part of the proof surface before more witness tuning

## Owned Witness Preservation Under Harness-Noisy Lanes

When a broad package/workspace lane becomes `harness-noisy / not final-confirmed`, preserve one deterministic **owned witness proof** whenever proportionate:

1. prefer a ticket-owned focused command, scripted replay, or exact witness file that exercises the corrected boundary directly
2. rerun that owned witness after the final code and ticket-artifact edits land
3. record it distinctly in the ticket outcome as the primary proof artifact for the owned behavior, separate from the non-final broad lane
4. do not describe the noisy broad lane as fully green unless it actually returns a final harness summary
5. before any later rebuild or rerun that touches the same produced artifacts, confirm the abandoned/noisy broad lane is no longer running; stop it first if needed so the next proof step starts from one live heavy verification lane

## Single Focused Proof File Silence

When a **single focused proof file** emits only an initial harness header (for example `TAP version 13`) and then stays silent, do not immediately classify it as the same package-lane noise pattern. First inspect the file or its obvious helper corpus to determine whether the lane legitimately fronts a heavy deterministic workload (large replay corpus, repeated production-spec compile, benchmark-scale fixture setup, or similar). If the workload is plausibly heavy:

1. rerun the file once with a proportionate longer bounded timeout rather than an open-ended wait
2. when several focused files or test-name families are candidates, run one file or one family at a time before combining them, so the first slow or noisy witness is isolated cleanly
3. if it later returns cleanly, record the observed runtime in the ticket outcome so the slow-but-valid lane is distinguishable from harness drift
4. only fall back to `harness-noisy / not final-confirmed` language when source inspection and the bounded rerun still do not explain or complete the silence

If the focused file is synthetic, simulator-facing, or otherwise owns its own tiny witness fixture, do one more stale-witness check before calling it harness noise:

1. confirm the witness still progresses the live runtime seam it claims to prove (for example turn retirement, stop-budget advancement, or the current legality/publication contract)
2. if the fixture can now loop forever inside one turn or microturn budget, classify that as stale witness setup rather than reporter drift
3. repair the witness on the live seam first, then rerun the focused file before widening into runner-level diagnosis

## Artifact Hygiene During Rerun

When rerunning proof commands that write append-only local artifacts (for example temp NDJSON, captured logs, or ad hoc report files), prefer a fresh temp path per rerun or clear the artifact first so the resulting evidence reflects a single proof pass rather than accumulated historical rows.

When verification intentionally mutates a real repo file as a temporary negative/manual check, confirm that the file is restored exactly to its original contents and placement before running broader proof lanes. Treat any post-check restoration drift as proof-invalidating and rerun the affected acceptance set after the exact restore lands.

## Harness Defect Escalation Triage

Before escalating that behavior into a harness defect or widening the ticket around runner tooling, do one concrete progress-triage pass:

1. inspect the relevant lane manifest / file list to see whether the command still had plausible slow tail files remaining after the last printed output
2. identify the most likely expensive tail file and, if proportionate, probe it directly with a bounded single-file run or source inspection
3. only treat the behavior as a likely runner defect once that triage no longer explains the silence

## Durable Closeout With Mixed Results

For durable closeout, use this rule when final proof mixes green owned witnesses with noisy broader lanes:

1. `COMPLETED` is still truthful when the owned implementation slice is proven by direct focused witnesses or equivalent deterministic owned proofs, and each non-final named broad lane is explicitly recorded as noisy/non-final rather than claimed green
2. do not mark `COMPLETED` when the only proof of the owned change depends on a lane that never returned a final result
3. if the ticket explicitly names a broad package/workspace lane as an acceptance command and that lane did not reach a final confirmed result in the current proof set, treat that command as `not yet proven` unless the active ticket is first corrected to record a truthful narrower proof substitution
4. if the ticket explicitly requires a final green result from a named broad lane and no narrower owned witness can satisfy that requirement truthfully, leave the ticket open or blocked instead of inferring success

If a ticket originally owned a specific noisy tail inside that broad lane and live proof shows the owned tail is now fixed while the remaining non-final behavior has moved to a different witness class or later file family:

1. record that shift explicitly in the active ticket outcome rather than continuing to describe the original owned tail as unresolved
2. keep the owned ticket `COMPLETED` only when the corrected slice is covered by direct focused witnesses or another deterministic owned proof
3. describe the remaining broad-lane non-final state by its new live location or witness class so the next follow-up, if any, starts from the truthful boundary

Compact closeout pattern for this case:

- `ticket corrections applied`: `<old blocking surface> -> <truthful owned boundary>`
- `subsumed proof`: `<named broad lane> -> owned witness proof plus explicit note that later quiet-progress moved to <new file or witness class>`
- `proof gaps`: `<new non-final tail outside owned scope>` or `none` if a different ticket already owns it
