# Verification: Acceptance Proof Discipline

## Acceptance Command Reconciliation

Before the final closeout, reconcile the ticket's explicit `Acceptance Criteria` and `Test Plan` commands against the commands you actually ran:

1. enumerate the exact named commands in the active ticket
2. mark each one as `ran directly`, `subsumed by <broader lane>`, or `not yet proven`
3. if any command remains `not yet proven`, run it or stop and explain why the ticket cannot truthfully close
4. record any non-direct subsumption in the ticket outcome so the proof trail stays inspectable

When a named verification command exits cleanly but proves nothing substantive in the current environment (for example `0 tests`, `0 files`, or another empty execution summary), do not count it as acceptance proof by default:

1. classify it as `repo-valid but non-proving` rather than green
2. identify the narrowest command that does exercise the owned boundary
3. record the anomaly and the substitute proof lane in the active ticket before final closeout
4. if the ticket explicitly required that exact command to prove the boundary, leave the command as `not yet proven` until the ticket or tooling story is corrected truthfully

## Wrapper and Child Command Isolation

When the raw child command for a witness passes but the **wrapper script or package test entrypoint** still fails, stop treating the test file as the only owner. Isolate the wrapper seam directly:

1. reproduce the direct child command outside the wrapper
2. reproduce the wrapper's exact invocation shape when proportionate
3. classify whether the remaining failure lives in the child witness, the runner wrapper, or the package script contract
4. if the wrapper alone is the failing seam and the ticket-owned metric depends on that wrapper's process boundary, treat the wrapper/package script as part of the active ticket's owned proof surface before more threshold tuning

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

For `packages/engine/test/unit/infrastructure/test-class-markers.test.ts`, treat the reported source file as the owner candidate before blaming the marker scan itself. Fix it when the named file is part of the active ticket or an immediately owned touched-file fallout surface. Otherwise, classify the failure as same-series metadata residue or unrelated marker drift, cite the named file in closeout, and keep the scan rule intact.

## Post-Proof-Edit Invalidation

After any acceptance or proof lane goes green, preserve that result only while the proved surface stays unchanged:

1. if you edit code, tests, fixtures, generated artifacts, or the active ticket text in a way that changes the acceptance story, immediately mark the affected earlier proof results as stale
2. rerun the narrowest affected focused lane first, then any broader package/workspace lanes that depended on the stale state
3. only treat the rerun set as the final proof record; earlier green runs become historical diagnostics, not closeout evidence

Active ticket/spec/report metadata can be proof-affecting even when no runtime code changes. Edits to `Status`, `Outcome`, `Files to Touch`, `Acceptance Criteria`, command substitutions, or final proof ledgers after a proof lane passes require an explicit invalidation decision: either rerun the affected lane, or record why the edit is purely clerical and does not alter the acceptance story. Do not silently append metadata edits after broad proof and still cite the earlier lane as final.

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

## Final-Proof Choreography

For long tickets whose final proof requires multiple expensive lanes after ticket-artifact rewrites, choose the final-proof choreography explicitly instead of rerunning ad hoc:

1. land all durable ticket/spec/sibling-artifact edits that change the acceptance story
2. run the producing build or artifact-generation step first when later proof lanes depend on that output
3. run the longest blocking acceptance lane next so you do not waste shorter final-proof runs on a state that may still fail
4. run the remaining shorter focused/package/workspace lanes afterward in dependency order
5. reconcile the final command ledger against the active ticket only after that exact rerun set completes

If a late artifact rewrite or benchmark rebaseline lands between those steps, treat every affected downstream proof lane as stale and restart the choreography from the earliest impacted step rather than appending one more run to the end.
