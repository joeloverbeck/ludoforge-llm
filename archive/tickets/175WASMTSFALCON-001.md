# 175WASMTSFALCON-001: Phase 0 — Inventory & classify WASM throw sites

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — analysis-only output
**Deps**: `specs/175-wasm-ts-fallback-contract-enforcement.md`

## Problem

The fix in commit `278003969` revealed a bug class: WASM-side glue functions inconsistently handled unsupported preview-drive shapes — some returned `null` (correctly absorbed by the caller's TS fallback), others threw `PolicyRuntimeError` (caught by `policy-eval.ts:909` and degraded to a `kind: 'failure'` PolicyAgent decision with arbitrary candidate selection). Without an authoritative inventory of every throw site under `packages/engine/src/agents/policy-wasm-*.ts`, Phase 1 cannot safely convert the bug-shaped throws to null-returns: it risks (a) missing one and leaving the asymmetric-throw class alive, or (b) converting a true validation throw (e.g., unknown consideration id) that has no TS fallback and would silently corrupt scoring.

This ticket produces the authoritative classification report that Phase 1 acts on and that Phase 2's architecture test cross-references.

## Assumption Reassessment (2026-05-17)

1. `grep "throw new PolicyRuntimeError" packages/engine/src/agents/policy-wasm-*.ts` returns 6 sites, all in `policy-wasm-score-routing.ts` (lines 53, 373, 399, 465, 528, 550). Confirmed against current `main`.
2. Other WASM files (e.g., `policy-wasm-preview-drive-state-patch-codec.ts`, `policy-wasm-preview-drive-completion.ts`, `policy-wasm-preview-drive-state-patch.ts`) contain `throw new Error` sites, but these are codec / contract-violation throws, not unsupported-detection branches. Spec §9 Open Question 2 explicitly excludes them: "retroactively audit non-WASM throws ... Default: no — Phase 0 classifies them as 'remain a throw' and they're out of scope." This ticket still records them in the report under a "remain-throw — contract violation" classification so future readers see they were considered and excluded.
3. The catch-all that absorbs current throws lives at `packages/engine/src/agents/policy-eval.ts:909` (try/catch around the score routing call) and the TS fallback evaluator runs in the `!scoredWithWasm` branch at `policy-eval.ts:752`. Both confirmed.
4. Spec §4 Phase 0 acceptance: report under `reports/175-phase-0-wasm-throw-site-inventory.md`; counts must match a grep at that commit. No spec drift.

## Architecture Check

1. **Evidence before action**: Phase 1 (the conversion) is a behavior-changing edit. Authoring an inventory report first makes the classification decisions inspectable and reviewable independently of the code change. Without this, Phase 1's PR would mix the "which throws to convert" decision with the "how to convert them" change, making review harder.
2. **No engine code change**: This ticket produces a report only. No `packages/engine/src/` files are modified. The WASM/TS boundary architecture is untouched.
3. **Foundation 14 alignment**: The report names the asymmetric-throw pattern as a backwards-compatibility hack class to be eliminated wholesale, consistent with "No Backwards Compatibility" — there is no transitional period where some unsupported-detection branches throw and others return null after Phase 1 lands.
4. **No new abstractions**: The classification taxonomy is the one already used implicitly by the post-fix code in `materializePreviewDynamicRowsWithWasm` (return null on unsupported detection) — this ticket just makes the taxonomy explicit and exhaustive.

## Implementation Outcome (2026-05-16)

Completed: Phase 0 inventory/report deliverable is implemented.

What landed:

- Added `reports/175-phase-0-wasm-throw-site-inventory.md`.
- Recorded inventory identity: commit `ed23802274c5941c4578cae84770fe7555d1de48`, spec 175 Phase 0, and exact grep commands.
- Classified all 85 `throw ` sites under `packages/engine/src/agents/policy-wasm-*.ts` exactly once.
- Identified 2 class-A conversion targets for Phase 1: `packages/engine/src/agents/policy-wasm-score-routing.ts:465` and `packages/engine/src/agents/policy-wasm-score-routing.ts:528`.
- Classified `packages/engine/src/agents/policy-wasm-score-routing.ts:550` as a remain-throw contract violation: a supported WASM result omitting a candidate row is corrupt supported-output evidence, not an unsupported shape with a safe TS fallback.
- Listed already-converted null-return reference branches in `materializePreviewDynamicRowsWithWasm` and the runtime `-14` unsupported sentinels.
- Seeded Phase 2 marker expectations: preserved B/C throws should use `// @policy-wasm-throw: contract-violation`; converted class-A sites should use `// @policy-wasm-unsupported: null-return`.

Touch scope:

- Report added: `reports/175-phase-0-wasm-throw-site-inventory.md`.
- Engine source: verified no edit; this ticket remains analysis-only.
- Generated/schema artifacts: not applicable; no runtime source, schema source, generated JSON, or package manifest changed.

Command ledger and final proof:

| Ticket section | Literal command/shorthand | Final citation |
| --- | --- | --- |
| Cross-reference verification | `grep -rn "throw " packages/engine/src/agents/policy-wasm-*.ts \| wc -l` | Passed; output `85`. |
| Cross-reference verification | `grep -rn "throw new PolicyRuntimeError" packages/engine/src/agents/policy-wasm-*.ts` | Passed; output 6 rows, all in `policy-wasm-score-routing.ts` at lines 53, 373, 399, 465, 528, and 550. |
| Test Plan | manual report verification | Passed; `awk` row-count check over the report's per-site table output `85`. |
| Commands | `pnpm run check:ticket-deps` | Passed; `Ticket dependency integrity check passed for 5 active tickets and 2370 archived tickets.` |
| Acceptance Criteria | `pnpm turbo test` sanity check | Passed; 5/5 tasks successful in 2m4.523s. Test tasks were cache misses; cached build tasks were supplemental because this ticket changed only ticket/report Markdown and no source, schema, generated runtime artifact, or package manifest. |

Advisory emissions:

- `pnpm turbo test` replayed cached build logs that included existing runner chunk-size warnings; non-ticket-owned.
- Runner tests emitted expected jsdom/canvas and ticker-error-fence stderr from passing tests; non-ticket-owned.

Late-edit proof validity:

- Final edit class: terminal status plus exact proof transcription only.
- No-invalidation: no source, schema, generated artifact, acceptance boundary, command semantics, touched-file scope, dependency ownership, or follow-up classification changed after final proof.

## What to Change

### 1. Enumerate every throw site under `packages/engine/src/agents/policy-wasm-*.ts`

Use `grep -rn "throw " packages/engine/src/agents/policy-wasm-*.ts` to capture every `throw` site, then classify each into exactly one of:

- **A. unsupported-detection — convert to null-return**: The branch detects a shape the WASM glue cannot handle, and the call site has a TS fallback (either via the local null-handling branch in the same function, or via the `policy-eval.ts:909` catch-all whose only correct behavior is to re-route through the local TS evaluator). Conversion target for Phase 1.
- **B. remain-throw — contract violation**: The branch detects a bug-like invariant violation that no TS fallback can correctly recover (e.g., unknown consideration id, unknown candidate feature id, encoding contract violation between WASM and TS — these are evidence of a compiler / catalog bug, not an unsupported shape). Must stay a throw, with rationale.
- **C. remain-throw — codec/internal contract**: The branch detects a malformed payload returned by the WASM module itself (e.g., op-count mismatches in `policy-wasm-preview-drive-state-patch-codec.ts`, slot-id mismatches in `policy-wasm-preview-drive-slots.ts`). These are TypeScript-side guards against ABI drift; converting to null would corrupt the WASM/TS bytecode contract. Must stay a throw.

For each throw site record: `file:line`, throw class (A/B/C), one-sentence rationale citing the surrounding branch and what TS fallback (if any) exists.

### 2. Write `reports/175-phase-0-wasm-throw-site-inventory.md`

Required report sections:

- **Date & spec link** (spec 175, Phase 0).
- **Methodology**: exact grep command(s) used; commit SHA the inventory was taken at.
- **Summary counts table**: total throw sites, count per class (A / B / C), files-touched count. The class A count is the conversion target for Phase 1.
- **Per-site table**: columns `File:Line`, `Class`, `Surrounding branch`, `TS fallback path`, `Rationale`. One row per throw site. The post-fix `materializePreviewDynamicRowsWithWasm` null-return branches (lines 225, 267 — currently already returning null) are listed in a separate "already-converted reference" subsection so the inventory documents the canonical pattern Phase 1 should mirror, not as new conversion targets.
- **Phase 1 conversion plan**: ordered list of class-A sites with the proposed null-return shape (`null` vs typed analog), preserving existing `recordProductionPolicyWasm*` telemetry calls.
- **Phase 2 enforcement seed**: list of class-B and class-C throw sites that the architecture test must allowlist (with the comment-marker pattern Phase 2 will require — e.g., `// @policy-wasm-throw: contract-violation` adjacent to the throw).

### 3. Cross-reference verification

The total throw count in the report MUST equal `grep -rn "throw " packages/engine/src/agents/policy-wasm-*.ts | wc -l` at the commit the report cites. The Phase 0 acceptance language ("counts MUST match a grep over the codebase at that commit") is enforced by including the grep command and its raw output count in the Methodology section.

## Files to Touch

- `reports/175-phase-0-wasm-throw-site-inventory.md` (new)

## Out of Scope

- Any modification to `packages/engine/src/agents/policy-wasm-*.ts` (Phase 1).
- Architecture test authoring (Phase 2).
- Parity-oracle fixture authoring (Phase 3).
- Documentation header comments (Phase 4).
- Retroactive audit of non-WASM throws elsewhere in `packages/engine/src/agents/` (spec §9 OQ2 default: no).
- WASM coverage extension to currently-unsupported preview-drive classes (spec §8; tracked separately in spec 176).

## Acceptance Criteria

### Tests That Must Pass

1. No code change → no test impact. The report itself is the deliverable.
2. Existing suite: `pnpm turbo test` continues to pass (sanity check that the worktree branch state is not broken; runs anyway).

### Invariants

1. Every `throw` site under `packages/engine/src/agents/policy-wasm-*.ts` at the cited commit is recorded in the per-site table exactly once.
2. Every site is classified into exactly one of {A, B, C}; no site is left unclassified or carries a hedge ("possibly A").
3. The summary count of class-A sites equals the count Phase 1 (ticket 002) will convert. If Phase 1 discovers a site the report missed or misclassified, the report is amended in the same PR as Phase 1's correction — no silent drift.

## Test Plan

### New/Modified Tests

1. None — this is a documentation/inventory ticket. Manual verification: the grep command in the report's Methodology section reproduces the cited counts.

### Commands

1. `grep -rn "throw " packages/engine/src/agents/policy-wasm-*.ts | wc -l` — sanity-check the report's total throw count.
2. `grep -rn "throw new PolicyRuntimeError" packages/engine/src/agents/policy-wasm-*.ts` — verify the 6 sites in `policy-wasm-score-routing.ts` are all enumerated.
3. `pnpm run check:ticket-deps` — confirm this ticket's Deps reference validates.

## Outcome

Completed: 2026-05-16.

What changed:

- Added `reports/175-phase-0-wasm-throw-site-inventory.md`.
- Inventoried all 85 `throw ` sites under `packages/engine/src/agents/policy-wasm-*.ts` at commit `ed23802274c5941c4578cae84770fe7555d1de48`.
- Classified 2 sites as class A conversion targets for Phase 1: `packages/engine/src/agents/policy-wasm-score-routing.ts:465` and `packages/engine/src/agents/policy-wasm-score-routing.ts:528`.
- Classified the remaining 83 sites as class B/C remain-throw contract or codec/ABI guards, including `packages/engine/src/agents/policy-wasm-score-routing.ts:550` as a fatal supported-output omission rather than an unsupported-shape fallback.

Deviations:

- No engine source edits were made; this ticket remained analysis-only as scoped.
- The report records 85 total `throw ` sites, not only the 6 `PolicyRuntimeError` sites, because the ticket required every `throw ` under `policy-wasm-*.ts` to be considered.

Verification:

- `grep -rn "throw " packages/engine/src/agents/policy-wasm-*.ts | wc -l` -> `85`.
- `grep -rn "throw new PolicyRuntimeError" packages/engine/src/agents/policy-wasm-*.ts` -> 6 rows, all in `policy-wasm-score-routing.ts`.
- Report per-site table row count -> `85`.
- `pnpm run check:ticket-deps` -> passed.
- `pnpm turbo test` -> passed, 5/5 tasks successful in 2m4.523s. Build-task cache replay was supplemental; engine and runner test tasks executed as cache misses.
