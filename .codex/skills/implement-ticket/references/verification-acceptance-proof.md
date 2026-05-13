# Verification: Acceptance Proof Discipline

## Acceptance Command Reconciliation

Before the final closeout, and before applying terminal status, reconcile the ticket's explicit `Acceptance Criteria`, `Test Plan`, `Commands`, outcome draft, and any command-like checklist lines against the commands you actually ran:

1. enumerate each literal command and shorthand command bundle in the active ticket
2. mark each one as `ran directly`, `subsumed by <broader lane>`, `split into <lanes>`, `removed from active ticket`, or `not yet proven`
3. if any command remains `not yet proven`, run it, rewrite the active ticket with a truthful proof substitution when authorized, or stop and explain why the ticket cannot truthfully close
4. record any non-direct subsumption, split, or removal in the ticket outcome so the proof trail stays inspectable

If the ticket itself explicitly authorizes an alternate witness shape, such as "read source text or compile boundary cases" or "run this exact lane or the nearest public-seam equivalent", choose the truthful witness during reassessment and record the selected alternative in the active ticket outcome or final closeout. Treat unauthorized witness substitutions under the normal deliverable-correction and 1-3-1 rules.

When a named verification command exits cleanly but proves nothing substantive in the current environment (for example `0 tests`, `0 files`, or another empty execution summary), do not count it as acceptance proof by default:

1. classify it as `repo-valid but non-proving` rather than green
2. identify the narrowest command that does exercise the owned boundary
3. record the anomaly and the substitute proof lane in the active ticket before final closeout
4. if the ticket explicitly required that exact command to prove the boundary, leave the command as `not yet proven` until the ticket or tooling story is corrected truthfully

## Cache-Hit Acceptance Lanes

When a broad workspace or package lane exits from cache after you added, deleted, or modified files, do not automatically count that lane as proof for the changed surface. This matters especially for newly added files, untracked files, generated artifacts, and tests that may not have been part of the cache key you expected.

1. classify the cached lane as `cache-hit proof pending` for the changed surface unless you have already proven that the changed files were included in the cached task inputs
2. run the narrowest direct command that exercises the changed files, or rerun the package/workspace lane with the repo's documented no-cache mechanism when that is proportionate
3. for new tests or source files, prefer a direct lint/typecheck/test command against the new file or the smallest package lane that definitely includes it
4. record any cache-hit substitution in the ticket outcome or final closeout when it affects a ticket-named acceptance command
5. if you cannot prove the cached broad lane covered the changed surface, leave that lane as `not yet proven` rather than treating the cache hit as acceptance proof

## Shared Contract Assertion Sweep

Before broad proof for a shared contract migration whose new representation remains type-compatible with stale tests, do one cheap assertion sweep:

1. grep source and tests for the old helper, field, serialized value, assertion literal, and any direct map/object reads that used to return the scalar shape
2. classify hits as `producer updated`, `consumer updated`, `ready-only adapter preserved`, `assertion-only drift`, or `intentionally unchanged`
3. rerun a focused test file for any `assertion-only drift` or newly updated consumer before the package/workspace lane
4. if the broad lane later finds another changed-shape assertion, treat it as owned verification fallout: fix the focused repro first, update the touched-file/proof ledger when needed, then rerun broad proof

For additive required trace/result fields, include an exact-shape literal sweep before broad proof:

1. search for the changed interface/type name, the new required field names, nearby sibling field names, and representative serialized fixture paths
2. include engine tests, runner/UI tests, report fixtures, golden trace files, checked-in JSON fixtures, and schema/trace-shape tests
3. classify each hit as `producer updated`, `consumer updated`, `fixture/golden fallout`, `assertion-only drift`, or `intentionally unchanged`
4. rerun the focused file for every updated assertion, fixture, or downstream consumer before citing a broad package/workspace lane

## Wrapper and Child Command Isolation

When the raw child command for a witness passes but the **wrapper script or package test entrypoint** still fails, stop treating the test file as the only owner. Isolate the wrapper seam directly:

1. reproduce the direct child command outside the wrapper
2. reproduce the wrapper's exact invocation shape when proportionate
3. classify whether the remaining failure lives in the child witness, the runner wrapper, or the package script contract
4. if the wrapper alone is the failing seam and the ticket-owned metric depends on that wrapper's process boundary, treat the wrapper/package script as part of the active ticket's owned proof surface before more threshold tuning

When a wrapper times out a focused witness that passes directly, calibrate the wrapper before reworking the witness:

1. direct-run the first timed-out file or child command and record whether it passes plus its observed duration
2. compare that duration to the wrapper's per-file or per-child timeout
3. update the wrapper timeout only when the direct witness is healthy, the runtime is reasonable for the owned lane, and the wrapper is the authoritative ticket-named proof surface
4. rerun the wrapper after the timeout change; do not claim the wrapper lane green from the direct child proof alone
5. record the calibration rationale in the active ticket outcome/report when it changes a named acceptance command

When a focused explicit-path invocation changes the wrapper semantics, treat that as command substitution rather than direct lane proof:

1. inspect the wrapper plan or source to determine whether explicit paths preserve the lane timeout, execution mode, environment, reporter, and process boundary
2. if the explicit-path mode drops a timeout or batches files differently, run the focused witness with an explicit bounded wrapper when budget matters
3. record both facts in the active ticket: the original lane semantics and the focused substitute semantics
4. do not claim the manifest-driven lane is green from an explicit-path run unless the semantics match or the active ticket has been corrected to accept the substitute proof

## Silent-But-Healthy Lanes

When a focused proof lane is expected to be valid but runs silently for a long time in the current environment, do not immediately classify it as hung or non-final:

1. rerun it once with a proportionate bounded wrapper such as `timeout` rather than waiting open-ended
2. pair that run with the cheapest direct owned witness probe you have, so you can distinguish `slow but healthy` from `still broken`
3. if the bounded run later completes cleanly, treat the silence as an environment/reporting artifact rather than a proof-shape problem
4. if it still does not return and the direct witness is green, record the broad lane as `slow/unconfirmed in this environment` and keep the owned witness proof explicit in the ticket outcome

## Broad-Lane Failure Classification

When a ticket-named **broad verification lane** (for example `pnpm turbo test`, workspace lint, or another multi-package suite) fails outside the owned diff, do not silently collapse that result into a vague "repo is red" note. Classify the failure explicitly before closeout:

1. identify the first failing owned path/test and decide whether it is inside the ticket's touched boundary
2. record the lane as `owned failure`, `same-series residual / dependency blocker`, or `repo-preexisting unrelated blocker`
3. if it is `owned failure`, the ticket is not acceptance-proven; continue fixing or stop for `1-3-1` if the next path is unclear
4. if it is `same-series residual / dependency blocker`, keep the lane in the ticket outcome, cite the concrete failing path/test, name the dependency/sibling/spec seam that appears to own it, and do not widen the active ticket unless the user confirms that broader boundary
5. if it is `repo-preexisting unrelated blocker`, keep the lane in the ticket outcome, cite the concrete failing path/test, state that the owned slice did not touch that surface, and preserve the proof gap explicitly instead of claiming the broad lane passed
6. only treat the ticket as closeable with that documented proof gap when the remaining acceptance evidence still truthfully proves the owned boundary and `AGENTS.md` does not require fixing the unrelated blocker or same-series residual as part of the ticket

Narrow unrelated-blocker repair rule: when a required broad lane is blocked by a mechanical lint/type error outside the active diff, a minimal fix may be absorbed only when all are true: the edit is behavior-neutral, the file is in the same package or verification contract being proven, no concurrent ownership is visible in `git status --short` or the recent context, and the active ticket/final closeout records the path as `unrelated verification hygiene` with the reason it was touched. If any of those are false, do not edit it under the active ticket; classify the broad lane as `repo-preexisting unrelated blocker` or stop for `1-3-1`.

Status stop: if the broad lane was named by the active ticket and any direct-rerun failure exercises the changed execution path, changed serialized/shared contract, or an architectural invariant touched by the ticket, default the classification to `owned failure`. Do not set `**Status**: COMPLETED` until that failure is fixed, proven pre-existing outside the active boundary, or the user confirms a 1-3-1 boundary reset / sibling handoff that rewrites the active ticket's durable state.

Same-environment baseline mini-protocol: when broad-lane timeout, benchmark, or wrapper behavior may be pre-existing and the classification matters to closeout, use a clean temporary worktree when proportionate:

1. create a temp worktree at the comparison revision, usually current `HEAD` before your edits
2. install/bootstrap/build only what that isolated worktree needs for the exact comparison command
3. run the same bounded command with the same cwd and wrapper shape
4. record both results and classify the current lane as introduced, pre-existing, or still unclassified
5. remove the temp worktree and clean up the repo worktree registry; if cleanup is blocked by sandbox permissions, request approval rather than leaving stale worktree metadata
   - Exception: when the temp worktree itself contains the only practical historical witness context or evidence logs, first copy or transcribe the relevant evidence into the durable ticket/report. If you intentionally retain the worktree, record its path and rationale in closeout, confirm it is outside the repo diff, and do not leave stale worktree metadata accidentally.

Verification-fallout repair rule: when a ticket-named broad lane exposes a real repo bug that appears pre-existing but blocks the ticket's required acceptance lane, first decide whether it is small, low-risk, and in the same package or architectural contract family as the ticket-owned proof. If yes, fix it as verification fallout, keep the proof on a TDD-style red-green path when practical, and record the added touched file plus fallout rationale in the active ticket. If the fix would materially widen ownership, change an explicit deliverable, or has multiple plausible designs, stop for `1-3-1` or classify the blocker truthfully instead of absorbing it silently.

When a ticket-named broad lane fails after otherwise successful focused proof, use this red-lane closeout choreography before any final status edit:

1. rerun the first failing file/command directly when feasible
2. classify each failure with its concrete path, assertion, and owner candidate
3. update active and sibling tickets with that evidence before claiming final proof
4. choose a truthful durable state (`COMPLETED`, `BLOCKED by prerequisite`, `PENDING untouched`, or repo-equivalent) from the rewritten active boundary
5. if those edits change the acceptance story, rerun the narrowest affected proof lane or record a clerical-only invalidation decision

For `packages/engine/test/unit/infrastructure/test-class-markers.test.ts`, treat the reported source file as the owner candidate before blaming the marker scan itself. Fix it when the named file is part of the active ticket or an immediately owned touched-file fallout surface. Otherwise, classify the failure as same-series metadata residue or unrelated marker drift, cite the named file in closeout, and keep the scan rule intact.

## Post-Proof-Edit Invalidation

After any acceptance or proof lane goes green, preserve that result only while the proved surface stays unchanged:

1. if you edit code, tests, fixtures, generated artifacts, or the active ticket text in a way that changes the acceptance story, immediately mark the affected earlier proof results as stale
2. rerun the narrowest affected focused lane first, then any broader package/workspace lanes that depended on the stale state
3. only treat the rerun set as the final proof record; earlier green runs become historical diagnostics, not closeout evidence

If a lane consumes built artifacts such as `dist/` and then any source, build config, generated artifact, or ticket/spec edit changes what that built output should contain, label the earlier lane explicitly as `non-final stale-build evidence`. Rebuild or regenerate the producer output, then rerun the dist-consuming proof before citing it. Do not cite a green run that finished after a source change but before the rebuild that incorporated that change; at most, use it as historical evidence that the previous artifact state was healthy.

Active ticket/spec/report metadata can be proof-affecting even when no runtime code changes. Edits to `Status`, `Outcome`, `Files to Touch`, `Acceptance Criteria`, command substitutions, or final proof ledgers after a proof lane passes require an explicit invalidation decision: either rerun the affected lane, or record why the edit is purely clerical and does not alter the acceptance story. Do not silently append metadata edits after broad proof and still cite the earlier lane as final.

After green/classified final lanes, a terminal status update plus exact transcription of those just-run proof results can be a clerical closeout edit when it changes no scope, acceptance boundary, command semantics, touched-file ownership, proof claim, or follow-up/dependency classification. Record that no-invalidation decision in the ticket outcome or final closeout; otherwise rerun the narrowest affected proof lane.

If an accidental post-proof cleanup edit is made and then reverted, do not assume the prior proof survived by intent alone. Prove exact restore first: compare the affected paths against the proved source shape with `git diff` / `git status --short` or an equivalent saved baseline, confirm no residual source/test/ticket artifact from the attempted edit remains, and record either `exact restore; no proof invalidation` or rerun the narrowest affected proof lane. If exact restore cannot be shown cheaply, treat the post-proof edit as proof-affecting.

For expensive evidence or measurement tickets, distinguish **transcription edits** from **acceptance-story edits** before rerunning long lanes:

1. if the post-proof edit only records already-run metrics, command outputs, durations, or a verdict already proven by the final lane, reread the edited artifact for consistency and run cheap hygiene checks such as `git diff --check`; a full empirical rerun is not required solely because the evidence was transcribed after the lane
2. if the edit changes status, metric values, thresholds, acceptance boundaries, command semantics, touched-file ownership, or follow-up/dependency classification, rerun the narrowest affected proof lane before citing final acceptance
3. if the distinction is unclear, treat the edit as acceptance-story affecting and rerun or stop for 1-3-1 when the rerun cost or boundary change is no longer clearly authorized

After any late code/test/spec/ticket edit that follows an intended final proof lane, write a compact lane-validity table in working notes or the ticket outcome before final closeout when more than one lane is involved:

`lane | consumes changed artifact? | rerun needed? | final citation status`

Use `final citation status` values such as `rerun green`, `not affected`, `stale diagnostic only`, or `blocked/unclassified`. If an expensive inventory/profile lane is not rerun, the table must explain why the late edit did not affect the produced evidence or else mark that lane non-final.

## Post-Closeout Verification Correction

If a follow-up investigation after a ticket was marked `COMPLETED` shows that a cited proof lane was misleading, stale, or misattributed, treat the ticket proof ledger as the owned artifact under repair:

1. reopen the active ticket outcome/proof block and identify the exact prior claim that is now superseded
2. classify whether the old result was `stale reporter label`, `harness-noisy / not final-confirmed`, `owned failure`, `same-series residual / dependency blocker`, or `repo-preexisting unrelated blocker`
3. if the corrected evidence changes the ticket's acceptance story, status, command semantics, touched-file ownership, or proof boundary, update the ticket before rerunning final proof
4. if the correction requires package-script, runner, lane-manifest, shard, or reporter changes, apply the Package Script / Runner Widening checklist below before final proof
5. rerun the narrowest affected proof lane first, then any ticket-named broad lane whose final status was previously ambiguous
6. preserve the historical observation as superseded evidence rather than deleting it when that context prevents future misdiagnosis

## Focused Recovery Loop

If the first broader proof lane fails on a newly added or modified test, do one focused recovery loop before rerunning the full lane:

1. isolate the failing owned test file or the narrowest direct harness that reproduces the failure
2. fix the issue against that focused lane first
3. if the broader lane is still running when you decide to probe the focused repro, wait for it to finish or terminate it cleanly before starting the heavy focused command; do not overlap two heavy proof lanes against the same package or artifact set
4. rerun the broader package/workspace lane only after the focused proof is green

## Unrelated Failure vs Owned Regression

When a broader proof lane fails on a surface that may be unrelated to the owned ticket slice, classify it before widening implementation:

1. `owned regression`: the failure directly exercises the changed contract, touched files, or an immediately dependent proof surface; fix it before treating broader proof as usable
2. `same-series residual / dependency blocker`: the failure targets a sibling/dependency seam in the same spec or ticket family, but not the active ticket's owned boundary; record it explicitly, name the apparent owner, and do not silently absorb it into the current ticket
3. `likely preexisting unrelated failure`: the failure targets a different contract or appears unchanged by the owned diff; record it explicitly, keep your diff isolated, and do not silently absorb it into the ticket scope
4. `harness/tooling defect`: the lane behavior itself appears broken or non-final; use the noisy-harness triage in `references/verification-noisy-harness.md` before rewriting code around runner behavior

If the failure is `same-series residual / dependency blocker` or `likely preexisting unrelated failure`, preserve the evidence in the ticket outcome or final closeout instead of quietly treating the lane as green.

## Package Script / Runner Widening

When a ticket begins as "test-only" or "single-file-only" but truthful proof requires changing a **package script or dedicated test runner entrypoint**, classify that explicitly as proof-ownership drift rather than accidental sprawl:

1. verify that the package script really is the authoritative acceptance surface for the owned witness
2. widen `Files to Touch` / `What to Change` to include the package script and any new helper runner before final proof
3. add or update the smallest guard test that pins the new script contract
4. keep the widening surgical: prefer a dedicated package runner or narrow script change over broader lane-taxonomy edits unless the wider taxonomy is genuinely the owned boundary

When noisy-harness triage shows the broad lane cannot identify the active child, or that a stale lane assignment is pulling an unrelated slow witness into a ticket-named acceptance command, evaluate package-script / runner widening before closing with a noisy-lane substitution. If you change the runner to improve attribution or move a witness between lanes, update the active ticket proof ledger and rerun the new final lane rather than treating the old lane result as final.

## Final-Proof Choreography

For long tickets whose final proof requires multiple expensive lanes after ticket-artifact rewrites, choose the final-proof choreography explicitly instead of rerunning ad hoc:

1. land all durable ticket/spec/sibling-artifact edits that change the acceptance story
2. run the producing build or artifact-generation step first when later proof lanes depend on that output
3. run the longest blocking acceptance lane next so you do not waste shorter final-proof runs on a state that may still fail
4. run the remaining shorter focused/package/workspace lanes afterward in dependency order
5. reconcile the final command ledger against the active ticket only after that exact rerun set completes

If a late artifact rewrite or benchmark rebaseline lands between those steps, treat every affected downstream proof lane as stale and restart the choreography from the earliest impacted step rather than appending one more run to the end.

## Acceptance Harness Rewrite Checkpoint

When implementation work changes the acceptance harness shape itself — for example splitting a test file, changing shard membership, moving a witness between CI matrix entries, or replacing a trace-heavy assertion with a hook-based witness — insert a checkpoint before final proof:

1. record the old acceptance lane and why it was redundant, stale, over-broad, or otherwise not the truthful final shape
2. record the new lane(s), including CI/workflow ownership when applicable
3. update the active ticket's acceptance wording before rerunning final proof
4. rerun each new lane after the final build/artifact producer has completed
5. keep the old lane out of the final proof ledger unless it still exists and was intentionally run
