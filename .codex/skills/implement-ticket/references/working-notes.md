# Working Notes

- In Codex sessions, use concise `commentary` updates as the default surface unless the ticket requires a durable repo artifact.
- In normal Codex runs, capture the working-notes checklist in `commentary` updates and/or the final closeout; do not create a repo artifact just to hold these notes unless the ticket explicitly requires one.
- Capture reassessment outcomes affecting correctness: discrepancy lists, evidence classification, authoritative boundary restatements, verification-owned scope corrections.
- In Codex sessions, record at minimum: draft/untracked status when relevant, the discrepancy class (`blocking` vs `nonblocking`), the final authoritative boundary, and any verification command substitutions or semantic expectation corrections.

## Minimal Codex Working-Notes Checklist

This reference is the canonical compact checklist for normal Codex runs. If the main `SKILL.md` adds fields for a specific ticket type, use the union of this list and the main skill's triggered fields rather than treating this section as a reason to omit them.

- `draft/untracked status`: active ticket, referenced specs, and sibling drafts when relevant
- `discrepancy class`: `blocking` or `nonblocking` for each boundary-affecting mismatch
- `authoritative boundary`: the final owned implementation slice after reassessment
- `proof noun alignment`: the ticket's claimed invariant noun, the required observable fields/values, and whether the proposed witness proves behavior rather than only invocation, plumbing, or reachability
- `implementation-introduced status branches`: when the implementation adds a status/result union, stable reason strings, or new ready/unavailable branches not already enumerated by the ticket, list every branch as `tested`, `unreachable by construction`, or `deferred to confirmed sibling` before final proof
- `expected generated fallout`: schema artifacts, goldens, compiled JSON, or `none`; if editing `schemas-core.ts`, serialized trace/result unions, generated-schema-bearing types, or other compiled public schema surfaces, default to `schema artifacts likely` until `schema:artifacts:check` proves otherwise
- `verification substitutions`: any repo-valid replacement command or required flag/output-path correction
- `reference guidance loaded`: triggered references actually loaded for the current ticket, such as `working-notes`, `schema-and-migration`, `verification`, or `verification-acceptance-proof`; if a normally triggered reference is skipped, record `not loaded + why`
  - If this field is absent from the checkpoint, recover it before file edits: load the triggered references or explicitly record `not loaded + why`.
- `acceptance-proof lanes`: the final verification gates required before the ticket can close, distinct from intermediate green lanes
- `ticket graph/status integrity lane`: if terminal status, dependency edges, active/archive classification, sibling ownership, successor/follow-up files, or other ticket-graph facts may change, plan the repo's narrow ticket-dependency or markdown-integrity check now; use `not applicable` only when no graph/status edge changes or no such checker exists
- `output contention / sequencing`: classify each planned proof lane that consumes or rewrites `dist`, schemas, goldens, compiled JSON, or another generated tree as `parallel-safe` or `serial-only`; record the producer step and any rerun required if a later lane cleans/rebuilds that output
- `terminal status plan`: when the ticket status may become terminal; keep the repo-local terminal status, such as `IMPLEMENTED` or `COMPLETED`, pending until final lanes are green, classified, or explicitly substituted
- `ticket-named deliverables ledger`: for tracked or active draft tickets with explicit `What to Change`, `Files to Touch`, artifacts, or named witness files, classify each concrete item as `planned`, `already satisfied / verified-no-edit`, `needs rewrite`, `blocked`, or `needs 1-3-1` before coding
- `intra-ticket contradiction ledger`: when `Acceptance Criteria`, `Out of Scope`, `What to Change`, `Files to Touch`, dependency text, or sibling-owner prose disagree, list each conflict, choose the current precedence, and classify it as `ticket correction planned`, `resolved by explicit sibling owner`, or `needs 1-3-1` before coding
- `single-use migration-script ledger`: when a ticket names a one-shot migration/helper script, classify it as `retained`, `run then deleted`, `unnecessary after live inventory`, or `needs 1-3-1`; record where durable evidence lives when the script is not retained
- `commit-body / durable evidence deliverables`: commit-body evidence, seed rationale, failure output, re-bless lines, or other ledgers the ticket requires; for no-commit sessions, plan the checked-in ticket/report/final-closeout location that will carry the evidence, or stop for `1-3-1` if the commit body itself is semantically required
- `red-gate materiality ledger`: for benchmark/measured-gate tickets, record `baseline`, `decisive final`, `target`, `delta`, `percent change`, `verdict`, and `terminal status allowed?`; use `not applicable` for non-measured tickets
- `diagnostic metric gates`: for architecture, migration, proof, or non-benchmark tickets that embed a numeric/percentage canary, classify each metric as `terminal acceptance`, `diagnostic evidence`, or `successor input`; if that changes an explicit deliverable or terminal gate, stop for `1-3-1` unless already authorized
- `authorization ledger`: when a user approves a 1-3-1 option or other boundary reset, record the option label, confirmation, and durable repo location where that approval is reflected. If approval changes a deliverable, witness path, proof lane, or boundary, immediately apply this order before resuming implementation: `record authorization -> patch active artifact(s) -> re-emit checkpoint -> re-extract acceptance/proof lanes -> resume`.
  - The approval covers only the named mismatch class and scope. If later evidence changes a different named file, artifact, seed/corpus, witness noun, acceptance lane, terminal gate, or durable proof path, stop for a new `1-3-1` unless the earlier approval explicitly covered that class.
- `semantic corrections`: any stale draft expectation, example, or output-shape claim proven wrong by live evidence
- `deferred sibling/spec scope`: broader spec or series work explicitly confirmed out of scope, when relevant; when naming a sibling as owner, record whether that sibling was opened and confirmed, or why the active spec is sufficient
- `source file size risk`: optional; include when a named source file is already near/over repo guidance and active work will add logic there, or when the ticket creates a substantial new source file likely to carry most of the implementation. Use `extract now`, `defer with rationale`, or `1-3-1 needed`. For profiling/investigation tickets, update this field when profiling selects an unlisted implementation file that may be near/over guidance. When retaining active growth in a near-cap or over-guidance source file, plan the closeout ledger in this exact shape: `path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any`.
  - After shared-contract, schema, generated-artifact, or fixture fallout is discovered, rerun the size check for every source file that grew in the final diff, not just source files named by the draft ticket. Add any new preexisting-oversize-plus-active-growth entries to the closeout ledger before terminal status.
- `runtime surface breadth`: for performance, profiling, diagnostic, cleanup, shared-contract, schema, or serialized-trace tickets, classify the changed behavior as `ticket-specific`, `policy/agent-only`, `script/profile-only`, or `shared engine/kernel`; name non-agent downstream consumers when they matter to closeout.
- `pre-existing dirty provenance`: before final closeout, classify referenced active tickets, specs, or siblings that were already dirty or untracked as `touched by this implementation`, `pre-existing and still unrelated`, `read-only context`, or `concurrent/sibling draft`
- `new same-series draft delta`: when same-series drafts appear after the initial checkpoint and matter to the active ticket/spec, record `paths | opened because | dependency role | active-boundary impact | final classification`

Before coding, emit one compact working-notes checkpoint in `commentary` (or the equivalent running notes surface) using the checklist order above. If multiple discrepancies exist, group them under the same checkpoint rather than scattering the minimum fields across multiple updates.

For tiny bounded local changes, keep the checkpoint complete but do not over-expand fields that are genuinely irrelevant. It is acceptable to group adjacent non-applicable ledgers into one explicit line, for example `not applicable: migration scripts, commit-body evidence, red gates, diagnostic metrics`, as long as the grouped line still covers every required field and any non-`not applicable` field is stated separately.

If you resume from context compaction, interruption, or a long handoff summary, do not rely on a summary sentence that says the checkpoint happened unless the full ticket-named deliverables ledger is visible. Reconstruct the ledger from the active ticket's explicit `What to Change`, `Files to Touch`, named artifacts/tests, `git diff --name-only`, and `git status --short` before any further file edit or terminal closeout. Re-emit the reconstructed ledger when it changes the owned boundary, proof plan, or closeout status.

If you realize after editing that this checkpoint was missed, emit a recovery checkpoint immediately. Mark it as late, list which boundary decisions and proof lanes were already chosen or run, and do not present it as satisfying the pre-edit stop requirement in later audit or closeout language.

Do not create scratch files solely to satisfy this requirement.

## 1-3-1 Boundary Reset Ledger

When a ticket goes through repeated 1-3-1 boundary resets in the same session, prefer a compact authoritative-boundary ledger in working notes:

- `previous boundary`
- `new evidence`
- `new authoritative boundary`
- `user authorization`: approved option label and confirmation, plus where the active ticket/spec records it
- `invalidated proof lanes`
- `new acceptance-proof lanes`
