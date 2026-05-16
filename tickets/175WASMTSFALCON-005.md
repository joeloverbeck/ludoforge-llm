# 175WASMTSFALCON-005: Phase 4 — Contract documentation in WASM glue files

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — header-comment additions in two source files. No behavior change.
**Deps**: `tickets/175WASMTSFALCON-002.md`

## Problem

Phases 1–3 establish the WASM↔TS null-return contract structurally (Phase 1), enforce it via an architecture test (Phase 2), and prove its consumer-side equivalence (Phase 3). The contract itself — "WASM-side unsupported-detection branches MUST return null; the caller's TS fallback is the correctness oracle; never throw from an unsupported branch when TS fallback is available" — is not yet stated anywhere in the source. A future contributor inspecting `policy-wasm-score-routing.ts` or `policy-preview-inner-deepening.ts` would see the converted null-return branches and the preserved class-B/C throws side-by-side, with the rule for which-is-which only inferable by reading spec 175 or the architecture test. Spec §4 Phase 4 requires header comments in these two files that make the contract self-discoverable from the source.

## Assumption Reassessment (2026-05-17)

1. The two files spec §4 Phase 4 cites by name are `packages/engine/src/agents/policy-wasm-score-routing.ts` and `packages/engine/src/agents/policy-preview-inner-deepening.ts`. Both files exist and are confirmed against current source. The first contains the class-A conversion sites from Phase 1; the second contains the upstream entry point that ultimately calls into the WASM routing.
2. The header comment must (a) state the null-return contract, (b) name the TS fallback as the correctness oracle, (c) prohibit throws from unsupported branches when a TS fallback is available, and (d) reference spec 175. Spec §4 Phase 4 acceptance: "a follow-up reader can identify the contract without reading this spec" — the header must be self-contained enough to teach the contract on first read.
3. The architecture-test marker comments from Phase 2 (`// @policy-wasm-throw: contract-violation` / `// @policy-wasm-unsupported: null-return`) are per-site comments — they document the classification of an individual throw or null-return. The header comment is the file-level explanation that gives those markers their meaning. The two are complementary.
4. No other `packages/engine/src/agents/policy-wasm-*.ts` file is named by spec §4 Phase 4. Spec §7 lists 10 WASM glue files for Phase 0 inventory targets; those are inventoried by ticket 001 but do NOT all need header comments per Phase 4's narrow acceptance. Adding headers to all 10 would be over-scope. (If ticket 001 discovers that a third file contains class-A conversion sites, the header set extends to that file — but no further.)

## Architecture Check

1. **Self-discoverable contract**: A future reader sees the contract on first scroll, without needing to know about spec 175 or the architecture test. This is the Foundation-15 architectural-completeness principle — the contract is documented at its locus, not deferred to external prose.
2. **No behavior change**: Comments only. Zero risk of regression. The build's typecheck and test suite are sanity gates.
3. **Foundation 14 alignment**: The header explicitly states "no throw from unsupported-detection branches when TS fallback is available" — making the no-backwards-compat hack stance explicit in the source where future contributors will see it.
4. **Avoids duplication**: The header references spec 175 as the source of truth; it does not restate the full spec. Spec drift is bounded to a one-line update if the contract evolves.
5. **Per-site markers + file header = layered documentation**: Header explains the contract; per-site markers (from Phase 2) classify each individual throw or null-return. Reader can navigate both directions.

## What to Change

### 1. Header comment in `packages/engine/src/agents/policy-wasm-score-routing.ts`

Add a leading file-level comment block (after the imports) that explains:

- This file routes policy scoring through the WASM module when supported.
- Every WASM-side branch that detects an unsupported preview-drive shape MUST return null (or the function's typed equivalent — see existing patterns in `materializePreviewDynamicRowsWithWasm` and the `result.kind === 'unsupported'` discriminated-union variant).
- The caller's TS fallback evaluator is the correctness oracle for unsupported shapes; never `throw new PolicyRuntimeError` from an unsupported-detection branch when the call site has a TS fallback available.
- Throws are reserved for genuine contract-violation cases (unknown consideration id, unknown candidate feature id, codec/ABI mismatches). Such throws are marked with `// @policy-wasm-throw: contract-violation` adjacent to the throw, and the architecture test under `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` enforces the marker requirement.
- Reference: `specs/175-wasm-ts-fallback-contract-enforcement.md` (or the archived path if spec 175 has been archived).

### 2. Header comment in `packages/engine/src/agents/policy-preview-inner-deepening.ts`

Add a parallel file-level comment block that explains:

- This file is the production-preview-drive entry point that calls into the WASM routing layer.
- All WASM-side unsupported-detection branches return null; this file's call sites MUST handle null by invoking the TS fallback evaluator (do not interpret null as a fatal condition).
- See `policy-wasm-score-routing.ts`'s file header for the full WASM↔TS contract.
- Reference: `specs/175-wasm-ts-fallback-contract-enforcement.md` (or archived path).

### 3. Verify the headers survive ticket-001 amendments

If ticket 001's inventory identifies a class-A conversion site in a third file (i.e., not just `policy-wasm-score-routing.ts`), add a parallel header to that file too. The decision rule: any file containing at least one converted class-A site (per Phase 1) gets the full contract header; files containing only class-B/C throws get a one-line pointer to `policy-wasm-score-routing.ts`'s header instead.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify — add file-level header comment)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify — add file-level header comment)
- Optionally a third `packages/engine/src/agents/policy-wasm-*.ts` file if ticket 001 identifies new class-A sites there (modify — same header pattern)

## Out of Scope

- Per-site comment markers (those are added in Phase 1 / ticket 002 and enforced by Phase 2 / ticket 003).
- README or external documentation updates — spec §4 Phase 4 acceptance is satisfied by source headers alone.
- Renaming or refactoring functions; this ticket adds comments only.
- Documentation for the architecture test or the parity oracle harness — those are self-documenting via their test names and assertion messages.

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm turbo test` passes (no behavior change).
2. Lint and typecheck: `pnpm turbo lint && pnpm turbo typecheck` pass (the header comments must not introduce lint violations — e.g., `eslint-comments` plugin rules).

### Invariants

1. Both `policy-wasm-score-routing.ts` and `policy-preview-inner-deepening.ts` contain a file-level header comment that states the WASM↔TS null-return contract and references spec 175.
2. A new contributor reading either file at the top can identify the contract without needing to open spec 175.

## Test Plan

### New/Modified Tests

1. None — the deliverable is documentation. Manual verification: open both files and confirm the header comment is present, references spec 175, and explains the contract per the spec §4 Phase 4 acceptance language.

### Commands

1. `pnpm turbo test` — full gate (sanity check that comment additions don't break anything).
2. `pnpm turbo lint && pnpm turbo typecheck` — formatting/lint compliance.
3. `pnpm run check:ticket-deps` — dep integrity.
