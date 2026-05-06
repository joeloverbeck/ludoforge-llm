# Working Notes

- In Codex sessions, use concise `commentary` updates as the default surface unless the ticket requires a durable repo artifact.
- In normal Codex runs, capture the working-notes checklist in `commentary` updates and/or the final closeout; do not create a repo artifact just to hold these notes unless the ticket explicitly requires one.
- Capture reassessment outcomes affecting correctness: discrepancy lists, evidence classification, authoritative boundary restatements, verification-owned scope corrections.
- In Codex sessions, record at minimum: draft/untracked status when relevant, the discrepancy class (`blocking` vs `nonblocking`), the final authoritative boundary, and any verification command substitutions or semantic expectation corrections.

## Minimal Codex Working-Notes Checklist

- `draft/untracked status`: active ticket, referenced specs, and sibling drafts when relevant
- `discrepancy class`: `blocking` or `nonblocking` for each boundary-affecting mismatch
- `authoritative boundary`: the final owned implementation slice after reassessment
- `expected generated fallout`: schema artifacts, goldens, compiled JSON, or `none`; if editing `schemas-core.ts`, serialized trace/result unions, generated-schema-bearing types, or other compiled public schema surfaces, default to `schema artifacts likely` until `schema:artifacts:check` proves otherwise
- `verification substitutions`: any repo-valid replacement command or required flag/output-path correction
- `reference guidance loaded`: triggered references actually loaded for the current ticket, such as `working-notes`, `schema-and-migration`, `verification`, or `verification-acceptance-proof`; if a normally triggered reference is skipped, record `not loaded + why`
- `acceptance-proof lanes`: the final verification gates required before the ticket can close, distinct from intermediate green lanes
- `terminal status plan`: when the ticket status may become terminal; keep the repo-local terminal status, such as `IMPLEMENTED` or `COMPLETED`, pending until final lanes are green, classified, or explicitly substituted
- `red-gate materiality ledger`: for benchmark/measured-gate tickets, record `baseline`, `decisive final`, `target`, `delta`, `percent change`, `verdict`, and `terminal status allowed?`; use `not applicable` for non-measured tickets
- `semantic corrections`: any stale draft expectation, example, or output-shape claim proven wrong by live evidence
- `deferred sibling/spec scope`: broader spec or series work explicitly confirmed out of scope, when relevant
- `source file size risk`: optional; include when a named source file is already near/over repo guidance and active work will add logic there, with `extract now`, `defer with rationale`, or `1-3-1 needed`. For profiling/investigation tickets, update this field when profiling selects an unlisted implementation file that may be near/over guidance.
- `runtime surface breadth`: for performance, profiling, diagnostic, cleanup, shared-contract, schema, or serialized-trace tickets, classify the changed behavior as `ticket-specific`, `policy/agent-only`, `script/profile-only`, or `shared engine/kernel`; name non-agent downstream consumers when they matter to closeout.

Before coding, emit one compact working-notes checkpoint in `commentary` (or the equivalent running notes surface) using the checklist order above. If multiple discrepancies exist, group them under the same checkpoint rather than scattering the minimum fields across multiple updates.

If you realize after editing that this checkpoint was missed, emit a recovery checkpoint immediately. Mark it as late, list which boundary decisions and proof lanes were already chosen or run, and do not present it as satisfying the pre-edit stop requirement in later audit or closeout language.

Do not create scratch files solely to satisfy this requirement.

## 1-3-1 Boundary Reset Ledger

When a ticket goes through repeated 1-3-1 boundary resets in the same session, prefer a compact authoritative-boundary ledger in working notes:

- `previous boundary`
- `new evidence`
- `new authoritative boundary`
- `invalidated proof lanes`
- `new acceptance-proof lanes`
