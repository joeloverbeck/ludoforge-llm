# Measured Gate Closeout

Use this reference when a profiling, benchmark, or measured-gate ticket lands correctness work but the metric, threshold, or acceptance story is still under decision.

## Green Gate Status

When the decisive measured gate is green, keep the metric evidence and durable
report/reporting artifact aligned without rerunning expensive empirical lanes
unnecessarily.

Preferred order when the ticket requires a checked-in report or outcome:

1. Prewrite the report or ticket outcome skeleton while terminal status remains pending when practical, including command names, threshold, baseline fields, and the final lanes you intend to cite.
2. Run the decisive same-command metric on the final code path and capture exact metric fields, counters, threshold, delta, percent change, and verdict.
3. Patch only the exact measured values, command results, and terminal verdict into the report/ticket. If this edit changes the threshold, owned metric, command semantics, acceptance boundary, touched-file ownership, dependency/sibling ownership, or follow-up status, treat it as acceptance-story affecting and rerun the narrowest affected proof lane.
4. If the edit only transcribes just-run metrics and the already-proven verdict, reread the edited report/ticket for consistency and run cheap hygiene/integrity checks such as `git diff --check` and the repo's ticket-dependency checker when graph/status facts changed. A full empirical rerun is not required solely because the measured values were transcribed after the lane.
5. Record the no-invalidation rationale or final lane-validity classification in the active ticket outcome when the decisive metric, broad acceptance lane, and report/ticket closeout were not all produced in a single command.

If a green perf or benchmark lane emits warnings, advisory summaries, or
nonblocking red children, classify them in the checked-in report or active
ticket when they are visible in final output and relevant to closeout trust.
Use concrete labels such as `advisory`, `preexisting`, `sibling-owned`,
`historical residual`, or `not ticket-owned`; do not let a passing exit code
hide warnings that a later reader could mistake for unresolved ticket-owned
work.

If the final broad acceptance lane returns from cache replay, combine this
green-gate flow with `references/verification-acceptance-proof.md`'s cache-hit
classification before citing that broad lane as acceptance proof.

If a supplemental broad perf lane can rewrite the same JSON, report, fixture
artifact, or generated output as the decisive isolated metric, classify that
broad lane as an artifact producer before running it. After the broad lane,
rerun the isolated ticket-owned fixture or otherwise restore/prove the decisive
artifact before final transcription. Do not let a later broad-suite sample
silently replace the metric artifact that the report/ticket cites as the
decisive gate.

### Measured Engine Refactor Terminal Checklist

For a measured engine/kernel refactor that produces a checked-in report,
consumes compiled `dist`, and may create untracked test/report files, use this
compact closeout order when no successor or schema/golden regeneration is
owned:

1. Prewrite the active ticket outcome and report skeleton while terminal status
   remains pending, including baseline, threshold, expected decisive command,
   touched-file scope, ignored raw-artifact path, source-size ledger when
   triggered, and planned final lanes.
2. Build before focused compiled consumers, then run the focused correctness
   witnesses that prove cache/hash/determinism parity for the owned seam.
3. Run the decisive same-command metric and transcribe exact fields, counters,
   delta, threshold, and verdict into the checked-in report and active ticket.
4. If any retained or rejected optimization candidate failed correctness,
   determinism, legality, immutability, stale-cache-key safety, or another
   Foundation-level invariant, record a compact attempt ledger in the active
   ticket or report before terminal status:
   `candidate | unsafe assumption | failing proof | cleanup/final proof | final verdict`.
5. Run required broad lanes serially. If a broad lane rebuilds or cleans
   `dist`, rerun the focused compiled-output witness you still intend to cite.
6. Classify any visible perf warnings or advisory red children in the
   report/ticket when they could be confused with ticket-owned residual work.
7. Apply terminal status only after final lanes are green, classified, or
   explicitly substituted; keep the final status/proof edit narrow and record
   the no-invalidation rationale when relying on prior proof.
8. Run `pnpm run check:ticket-deps` or the repo's narrow ticket-integrity lane
   when status, deps, active/archive classification, or sibling ownership
   changed.
9. Run `git diff --check`, cover untracked additions with targeted hygiene such
   as `git diff --no-index --check /dev/null <path>` or a recorded substitute,
   finish with untracked-aware `git status --short`, and use the exact
   `$post-ticket-review <ticket>` handoff when archival did not run.

## Red Gate Status

When a code migration lands but an explicit benchmark/performance gate remains red, do not mark the ticket terminal just because ordinary tests are green. Record exact samples, threshold comparison, variance or drift when available, and the active route proof. If satisfying or relaxing the gate changes an explicit deliverable, status, scope, dependency story, or phase plan, stop for `1-3-1` before creating successors or rewriting acceptance.

Before treating a red elapsed-time result as ticket-owned, decompose wrapper commands that include more than the measured implementation seam. Classify each meaningful phase as one of:

- `owned metric`: the runtime, benchmark, harness loop, or artifact generation the ticket explicitly owns
- `required acceptance wrapper`: the exact broader command the ticket still explicitly requires, even if it includes non-runtime phases
- `diagnostic overhead`: setup, cache warmup, compilation, report generation, or orchestration cost that explains the aggregate but is not itself the owned improvement target
- `out-of-scope workflow budget`: preserved regression gates, unrelated package checks, CI scheduling, or other workflow cost covered by another owner or by the spec's out-of-scope section

If the owned metric is green but the aggregate wrapper is red, do not default to `BLOCKED` or silently weaken the target. Use `1-3-1` with options that distinguish `proof-only correction`, `workflow-gate successor`, and `same-ticket optimization`, and state how each option aligns with `docs/FOUNDATIONS.md` before recommending one. If the ticket/spec already excludes workflow-gate tuning, a boundary correction may be the truthful terminal path after user approval; record the wrapper result as residual evidence rather than as the decisive measured gate.

Exception: when the aggregate wrapper's red children were already classified in
the active ticket/report as unrelated, sibling-owned, historical residual, or
expected supplemental red/non-final, and the isolated ticket-owned metric is
green, a new `1-3-1` is not required solely because that same broad wrapper is
still red. Preserve the exact failing paths, assertions, and owner
classification; rerun the ticket-owned decisive metric after any artifact
clobbering; then close terminal only if the ticket's explicit acceptance story
allows the broad lane to remain classified red.

Exception: a ticket may close with terminal wording on a red result only when it explicitly defines `red measured result + active route proof + successor/follow-up owner` as acceptance-complete and no stricter materiality note blocks that closeout. In that case, record exact red metrics, active-route proof, retained/rejected candidate classification, successor ownership, dependency/status rewrites, and `pnpm run check:ticket-deps` result before terminal status.

Use this terminal-status decision table:

- `green retained gate`: terminal status after exact metric transcription and normal final proof.
- `explicit red-plus-successor completion contract`: terminal status only with exact red metrics, materiality verdict, active route/implementation proof, non-overlapping successor, dependency integrity, and proof invalidation/rerun ledger.
- `red/blocked phase decision without explicit terminal wording`: keep `BLOCKED`, `PARTIAL`, or the repo equivalent, or stop for `1-3-1`.
- `user-approved close-enough red gate`: record an acceptance exception, not a passing gate; terminal status depends on the ticket family's explicit exception wording.

If qualitative language such as `significant`, `meaningful`, or `not tiny` appears in the ticket, spec, or reviewer note, classify the final same-command delta as `material`, `minor`, or `not demonstrated` before applying a red-plus-successor closeout.

## Blocked Retained-Substrate Closeout

Use this pattern when a measured-gate ticket lands correct reusable substrate, focused correctness proof is green, but the explicit measured gate remains red and the ticket does not have an explicit red-plus-successor completion contract.

1. Stop for `1-3-1` before deciding to keep the substrate, revert it, or keep optimizing in the same ticket.
2. If the user confirms keeping the substrate while blocking the ticket, record the intended durable state in prose while any proof rows, successor/spec edits, dependency checks, decisive metric transcription, or proof-validity classification remain pending. Mark the active ticket `BLOCKED`, `PARTIAL`, or the series-local equivalent only after those rows are settled or explicitly classified. Do not use terminal completion wording and do not archive it.
3. In the active ticket or report, record: retained candidate classification, exact baseline and decisive final metric, materiality verdict, activation/root-cause counters, why the retained code is correct reusable substrate, and why the measured gate is still unmet.
4. Create or update the non-overlapping successor that owns the remaining measured improvement, unless the user-approved boundary explicitly keeps the residual in the same active ticket. Name its dependency on the blocked substrate ticket and record the non-overlap rationale. For same-ticket continuation, record `residual owner: same active ticket`, the remaining measured seam, and why a separate successor would duplicate ownership rather than clarify it.
5. Open immediate active dependents and spec phase rows that name the blocked ticket or phase. Patch stale `green`, `landed`, `complete`, or archived assumptions, or record `checked-no-edit` with the exact paths inspected in the active ticket/report. Update sibling status text so the series does not imply the red gate is green or archived.
6. Run `pnpm run check:ticket-deps` or the repo's narrow ticket-graph integrity lane after status, dependency, successor, or spec ownership changes.
7. Rerun affected correctness and measured lanes, or record why post-metric edits were only ownership/transcription changes and did not invalidate the decisive metric.
8. In the final handoff, say `post-ticket-review` did not run and the ticket is blocked/not archive-ready. Name the successor id, or say `same active ticket remains the next owner` only when step 4 recorded that same-ticket continuation explicitly.

Before final handoff on this path, run this compact checklist:

- `materiality ledger`: exact baseline, decisive final, target, delta, percent change, and red/blocked verdict are in the active ticket or report
- `route/counter proof`: retained substrate has focused correctness proof plus activation/root-cause counter evidence
- `residual owner`: successor id/path or same-ticket continuation is durable and non-overlapping
- `source-size ledger`: present when any touched source file is near/over repo guidance or grew enough to trigger it
- `proof validity`: post-metric edits are followed by affected reruns or a recorded no-invalidation rationale
- `graph integrity`: ticket-dependency or markdown-integrity check ran after status/dependency/successor/spec changes when available
- `untracked hygiene`: newly created reports, tickets, fixtures, or artifacts are covered by targeted whitespace/hygiene checks or a recorded substitute
- `handoff`: final response says the ticket is blocked/not archive-ready and names `$implement-ticket <successor-or-active-ticket>` instead of `$post-ticket-review`

Use this final-response skeleton for blocked retained-substrate measured gates:

- `active ticket`: `<path>` — `<BLOCKED/PARTIAL or repo-equivalent>`
- `what landed`: `<retained reusable substrate or bounded slice>`
- `red measured gate`: `<metric, final value, threshold, verdict>`
- `successor/continuation`: `<successor id/path or same active ticket>`
- `green proof`: `<focused correctness and broad lanes that passed>`
- `classified non-final`: `<red measured gate -> residual owner>`
- `archive status`: `blocked and not archive-ready`
- `next workflow`: `Post-review: not run; the ticket is blocked and not archive-ready. Next workflow: continue with $implement-ticket <successor-or-active-ticket>.`

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

Instrumentation-scope candidates are allowed only when they make the measured
bucket more truthful without hiding runtime work. Keep activation counters,
classify what moved outside the timed interval, and pair the change with a
top-line or wall-time sanity check so the closeout does not pass by metric
gaming. If instrumentation removal changes the owned metric noun, command
semantics, threshold, or public report contract, stop for `1-3-1` before using
it as the decisive fix.

Before closeout, classify each retained performance candidate as exactly one of:

- `owned metric improved`
- `root-cause counter improved`
- `same-checkout A/B proves neutral`
- `user-approved keep`
- `revert before closeout`

For rejected candidates, keep a compact attempt ledger when it prevents repeated work: `candidate`, `correctness proof`, `measurement`, `verdict`, `cleanup proof`, and `reason not retained`.

For rejected candidates that fail correctness, determinism, legality,
immutability, stale-cache-key safety, or another Foundation-level invariant,
the attempt ledger is mandatory even if the runtime diff is fully reverted. The
ledger should name the unsafe key/assumption, the failing command or error, and
the cleanup proof, so future runs do not rediscover the same invalid
optimization.

### Cache-Key and Segment-Cache Discipline

For cache or memoization tickets, enumerate the key dimensions before relying on
green correctness proof. Include every dimension that can affect the cached
bytes/value, such as compiled artifact identity, state identity, layout or ABI
version identity, actor/observer identity, parameter or constant identity, and
invalidation/fork scope. If a candidate key omits a dimension and a focused
proof catches it, record that rejected key in the candidate attempt ledger.

When the ticket's drafted cache noun differs from the safe live cache noun,
for example a whole encoded object versus a reusable state segment, add a
compact cache acceptance matrix to the active ticket or report before terminal
status:

| Field | Value |
|---|---|
| Draft cache noun | `<ticket wording>` |
| Implemented cache noun | `<whole object / segment / other>` |
| Activation counter | `<hit/miss/write or trace field>` |
| Correctness witness | `<focused command/assertion>` |
| Metric owner | `<bucket or measured seam>` |
| Ticket correction needed? | `<yes/no + path>` |
| Terminal allowed? | `<yes/no + why>` |

## Metric Arithmetic

For measured gates with multiple bucket fields, compute the final materiality
ledger mechanically before terminal status:

- `baseline combined`: sum of every ticket-owned baseline field, with each input named
- `current combined`: sum of every ticket-owned final field from the decisive same-command metric
- `absolute delta`: `current combined - baseline combined`
- `required delta`: the ticket/spec threshold, preserving sign and units
- `verdict`: `green`, `red`, or `close-enough exception`, with the terminal-status implication

When practical, include this calculation table in the report/ticket instead of
only prose. If any source number changes after a rerun, update every dependent
sum and delta in the same edit, then reread the artifact for stale earlier
values before closeout.

## Worksheets

Optional red-gate outcome worksheet:

- `diagnostic baseline`: command, label, metric, threshold, active-route counters
- `candidate probes`: retained and rejected candidates, diagnostic correctness proof while each candidate existed, measured result, post-revert cleanup proof for rejected paths
- `decisive final metric`: command, label, metric, threshold, verdict, drift from probes
- `CPU/profile evidence`: artifact path or ephemeral note, parser command/method, top owners, ticket-owned samples, residual samples
- `residual owner`: successor id plus non-overlap rationale, or `same active ticket` plus why no separate successor was created
- `dependent/spec checks`: immediate active dependents and phase rows inspected, patched, or recorded as `checked-no-edit`, plus `pnpm run check:ticket-deps` result
- `proof invalidation`: post-metric edits, rerun lanes, no-invalidation rationale, terminal status timing

For measured decision tickets whose truthful result is respec-only completion rather than retained optimization or successor work, use this worksheet before terminal status: `retired proof surface`, `replacement evidence`, `why no code/topology change is retained`, `why no successor is needed`, `retained code/report diff`, `materiality verdict`, `dependency/spec edits`, and `terminal-status basis`.
