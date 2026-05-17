# 176POLWASMPERF-007: Phase 6 — Synthesis, decision, and named follow-up artifact

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — synthesis and decision report. Follow-up artifact creation (a new spec file or a new ticket file under a different namespace, per the decision branch) is allowed but is the only "code-adjacent" output.
**Deps**: `archive/tickets/176POLWASMPERF-002.md`, `archive/tickets/176POLWASMPERF-003.md`, `archive/tickets/176POLWASMPERF-004.md`, `archive/tickets/176POLWASMPERF-005.md`, `archive/tickets/176POLWASMPERF-006.md`

## Problem

Spec 176 §5 Phase 6 requires synthesizing the per-hypothesis verdicts from Phases 1–5 into exactly one of three decision outcomes: **Keep WASM as-is**, **Accelerate WASM**, or **Retire WASM**. The decision MUST name a follow-up artifact (a new spec for Accelerate / Retire, or "none — close the investigation" for Keep). Per spec 176 §6, the synthesis applies a documented decision tree mapping per-hypothesis dominant causes to recommended outcomes.

This ticket is the spec-176 strategic deliverable. Its report is the authoritative answer to spec 176 §1's question: *does the policy WASM architecture earn its complexity cost, or has the original perf premise been falsified?*

## Assumption Reassessment (2026-05-17)

1. All five Phase 1–5 verdict reports (tickets 002–006) exist before this ticket starts. Verified by Deps.
2. Spec 176 §6 contains a decision tree mapping dominant-cause patterns to outcomes — verified by re-reading spec 176 lines 93–107. Phase 6 MUST commit to one branch and MUST cite the per-hypothesis verdicts that drove the choice.
3. Spec 176 §11 Open Questions item 3 sets the default outcome when no hypothesis dominates: "Keep-as-correctness-only with a named acceptance ticket recording the perf-neutrality finding."
4. The follow-up artifact format depends on the branch:
   - **Keep**: optional — either a named "perf-neutrality acceptance" ticket or "none — close investigation". No new spec needed.
   - **Accelerate**: a new spec under `specs/NNN-*.md` naming the specific optimization (e.g., batched WASM call, WASM coverage extension to TS-only hot paths). Spec number follows the next-available convention.
   - **Retire**: a new spec under `specs/NNN-*.md` naming the WASM deprecation. Spec 174's §3 A/B-routing-scaffolding-deletion ticket is superseded by the broader deprecation per spec 176 §10.

## Architecture Check

1. **Foundation #15 (Architectural Completeness)**: This ticket forces an explicit decision on whether WASM is a load-bearing architectural component or vestigial. Ambiguity is resolved in one direction.
2. **Foundation #16 (Testing as Proof)**: Every claim in the decision report cites a measurement report from Phases 1–5. No narrative inference; no appeal to spec 174's archived assumptions.
3. **Foundation #20 (Preview Signal Integrity)**: The decision MUST preserve the existing fail-closed-with-TS-fallback contract regardless of branch (Keep, Accelerate, or Retire). The report's Foundation-alignment section MUST explicitly state how the chosen branch maintains preview-signal carriers.
4. **No engine source change**: Per spec 176 §7 #5, this ticket lands no engine code. Any code change implied by the decision is owned by the named follow-up artifact.

## What to Change

### 1. Synthesize Phases 1–5 verdicts

Read the five verdict reports:

- `reports/176-phase-1-ffi-marshaling-decomposition.md`
- `reports/176-phase-2-ts-only-hot-paths.md`
- `reports/176-phase-3-cheap-vs-expensive-coverage.md`
- `reports/176-phase-4-bytecode-cache-amortization.md`
- `reports/176-phase-5-state-serialization.md`

For each, extract the verdict label and the implication note. Tabulate the five verdicts.

### 2. Apply the decision tree from spec 176 §6

| Verdict pattern | Recommended decision (per spec 176 §6) |
|---|---|
| H1 marshaling-dominant | Accelerate — batched-WASM-call follow-up spec |
| H2 ts-only-bound-high AND H3 cheap-paths-dominate | Retire OR Keep-as-correctness-only |
| H2 ts-only-bound-high alone (H3 expensive-paths-routed) | Accelerate — extend WASM to TS-only hot paths |
| H3 cheap-paths-dominate alone (H2 ts-only-bound-low) | Spec-174-style coverage extension with measured perf hypothesis |
| H4 cache-thrashes | Accelerate — small cache-fix follow-up ticket |
| H5 serialization-fixed-overhead-dominant | Accelerate — ABI/encoding follow-up spec |
| H5 serialization-mixed-overhead-dominant | Mixed H1/H5 branch — weigh batching/call-overhead reduction against ABI/encoding work before choosing Keep / Accelerate / Retire |
| No single dominant cause | Keep-as-correctness-only OR Retire (complexity-cost vs correctness-rationalization tradeoff) |

When multiple hypotheses are dominant, the report MUST explicitly reason about which branch best fits and cite the per-hypothesis evidence weights. The report MUST commit to exactly one branch.

### 3. Name the follow-up artifact

- If **Keep**: name the optional perf-neutrality acceptance ticket (or "none — close investigation").
- If **Accelerate**: draft a one-paragraph stub for the follow-up spec naming the optimization, the dominant-cause attribution that justifies it, and a notional perf hypothesis with success threshold. Save the stub at `specs/NNN-policy-wasm-<short-slug>.md` using the next-available spec number. Body length: just enough to be discoverable; the full spec is not authored by this ticket.
- If **Retire**: draft a one-paragraph stub for the deprecation spec at `specs/NNN-policy-wasm-retirement.md`. The stub MUST note the spec-174 §3 A/B-scaffolding-deletion subsumption per spec 176 §10.

### 4. Write the Phase 6 decision report

Write `reports/176-phase-6-decision-and-rationale.md` containing:

- Per-hypothesis verdict summary table (one row per phase).
- Dominant-cause attribution paragraph: which hypothesis (or hypothesis combination) is load-bearing.
- Decision: exactly one of Keep / Accelerate / Retire.
- Named follow-up artifact: path to the stub spec (or "none" for Keep).
- Decision rationale traceable against Phases 1–5 reports: every claim cites a phase report.
- Foundation alignment: explicit statement for Foundations #14, #15, #16, #20 (matching spec 176 §8).
- Cross-game generalization caveat: per spec 176 §10, the conclusion applies to FITL ARVN only; future games may differ.

### 5. (Optional) Back-link spec 176

If the chosen branch is Accelerate or Retire and a new spec stub is created, update spec 176 (which is still in `specs/` at this point — archival is the user's separate step) with a brief Outcome note linking the follow-up spec. Use the spec-update conventions already used elsewhere in the repo; do not duplicate the Phase 6 report in the spec body.

## Files to Touch

- `reports/176-phase-6-decision-and-rationale.md` (new) — the authoritative decision report.
- Conditionally: `specs/NNN-policy-wasm-<branch-specific-slug>.md` (new) — follow-up spec stub if Accelerate or Retire.
- Conditionally: `tickets/NNN-*-001.md` (new) — perf-neutrality acceptance ticket stub if Keep with a follow-up.
- Conditionally: `specs/176-policy-wasm-perf-yield-investigation.md` (modify) — append a brief Outcome note linking the follow-up.

## Out of Scope

- Authoring the full follow-up spec body — only the stub. The full spec is owned by a separate `/spec-to-tickets` or `/brainstorm` invocation against the new stub.
- Implementing any optimization proposed by the Accelerate branch — entirely owned by the follow-up spec's tickets.
- Implementing any deletion proposed by the Retire branch — entirely owned by the follow-up spec's tickets.
- Archiving spec 176 — the user's separate step per `docs/archival-workflow.md`.
- Cross-game (Texas Hold'em) re-investigation — explicitly excluded by spec 176 §10. The Phase 6 report acknowledges this as a caveat but does not pursue it.

## Acceptance Criteria

### Tests That Must Pass

1. No new tests required.
2. Existing suite: `pnpm turbo test` (sanity baseline; no engine source changes).

### Invariants

1. The decision report commits to exactly one of Keep / Accelerate / Retire — not "deferred" or "needs more investigation". If the per-hypothesis evidence is inconclusive, the default outcome per spec 176 §11 (Keep-as-correctness-only with a perf-neutrality acceptance ticket) is the committed answer.
2. Every claim in the decision rationale cites at least one Phase 1–5 report.
3. If the decision is Accelerate or Retire, the follow-up spec stub exists at the named path before this ticket is marked complete.

## Test Plan

### New/Modified Tests

None — synthesis ticket.

### Commands

1. `pnpm turbo test` (sanity baseline).
2. (Manual) Verify all five Phase 1–5 reports exist; verify the Phase 6 report writes successfully; verify the follow-up artifact (if any) exists at the named path.

## Outcome (2026-05-17)

Outcome amended: 2026-05-17

### What Landed

- Synthesized the five Phase 1-5 verdict reports into the Phase 6 decision report at `reports/176-phase-6-decision-and-rationale.md`.
- Selected exactly one decision branch: **Accelerate WASM**.
- Created the follow-up spec stub at `specs/177-policy-wasm-batched-call-overhead-reduction.md`.
- Added a brief Outcome note to `specs/176-policy-wasm-perf-yield-investigation.md` linking the Phase 6 report and follow-up spec.

### Verdict Summary

| Phase | Report | Verdict | Phase 6 implication |
|---|---|---|---|
| 1 | `reports/176-phase-1-ffi-marshaling-decomposition.md` | `marshaling-dominant` | Supports batched-call / call-overhead acceleration. |
| 2 | `reports/176-phase-2-ts-only-hot-paths.md` | `ts-only-bound-low` | Does not support H2-alone acceleration or the H2+H3 retire/keep branch. |
| 3 | `reports/176-phase-3-cheap-vs-expensive-coverage.md` | `mixed` | Material but not dominant unsupported/fallback coverage evidence. |
| 4 | `reports/176-phase-4-bytecode-cache-amortization.md` | `cache-cost-negligible` | Does not justify a cache-specific follow-up. |
| 5 | `reports/176-phase-5-state-serialization.md` | `serialization-mixed-overhead-dominant` | Supports weighing serialization/marshaling with H1. |

### Decision

**Accelerate WASM** through `specs/177-policy-wasm-batched-call-overhead-reduction.md`.

The dominant evidence is H1 plus H5: the existing WASM route is transfer/setup-heavy relative to WASM execution. Phase 2 and Phase 3 do not prove that WASM is structurally unable to reach enough workload to matter, and Phase 4 does not make bytecode cache repair the right first follow-up.

### Ticket Corrections Applied

- Follow-up artifact path resolved to the next available live spec number: `specs/177-policy-wasm-batched-call-overhead-reduction.md`.
- No perf-neutrality acceptance ticket was created because the selected branch is Accelerate, not Keep.
- No retirement/deprecation spec was created because the selected branch is Accelerate, not Retire.

### Schema / Generated Fallout

None. This ticket changes Markdown report/spec/ticket artifacts only; it does not change engine source, tests, schemas, generated JSON, GameSpecDoc, GameDef, or visual config.

### Verification Ledger

Final proof:

- Manual report existence check for all five Phase 1-5 inputs — pass:
  - `reports/176-phase-1-ffi-marshaling-decomposition.md`
  - `reports/176-phase-2-ts-only-hot-paths.md`
  - `reports/176-phase-3-cheap-vs-expensive-coverage.md`
  - `reports/176-phase-4-bytecode-cache-amortization.md`
  - `reports/176-phase-5-state-serialization.md`
- Manual existence/content check for `reports/176-phase-6-decision-and-rationale.md` — pass; report commits to exactly one branch, **Accelerate WASM**, and names `specs/177-policy-wasm-batched-call-overhead-reduction.md`.
- Manual existence/content check for `specs/177-policy-wasm-batched-call-overhead-reduction.md` — pass.
- Pre-terminal-status `pnpm run check:ticket-deps` — pass for `1` active ticket and `2381` archived tickets.
- `pnpm turbo test` — pass; `5` tasks successful, `5` cached. Cache classification: cache-covered supplemental sanity because this ticket changed only Markdown report/spec/ticket artifacts and no package source, tests, schemas, generated runtime artifacts, or package manifests.
- Post-terminal-status `pnpm run check:ticket-deps` — pass for `1` active ticket and `2381` archived tickets.
- `git diff --check` — pass.
- Retained-untracked trailing-whitespace scan (`rg -n '[ \t]+$' reports/176-phase-6-decision-and-rationale.md specs/177-policy-wasm-batched-call-overhead-reduction.md`) — pass; no matches.

### Runtime Surface Breadth

No runtime surface change. The decision affects repository planning artifacts only; implementation of batching or other host/guest transfer reduction is deferred to Spec 177.

### Deferred Scope

- Full Spec 177 authoring and ticket decomposition are deferred to a future spec/ticket workflow.
- Any policy-WASM batching, ABI/encoding change, production default change, or retirement/deletion remains out of scope for this ticket.
- Spec 176 archival remains a separate workflow. This ticket was archived by post-ticket review to `archive/tickets/176POLWASMPERF-007.md`.

### Late-Edit Proof Validity

Terminal status and proof-result transcription happened after the final `pnpm turbo test` lane. No-invalidation: these terminal/proof-ledger patches record the already-proven report/spec/ticket state and post-status hygiene results; they do not change the selected decision, acceptance criteria, command semantics, touched-file ownership, follow-up ownership, dependency graph, or runtime behavior.
