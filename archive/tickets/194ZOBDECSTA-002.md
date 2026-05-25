# 194ZOBDECSTA-002: Apply encoded-surface reduction + digest-version bump + replay-corpus re-bless

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/kernel/zobrist.ts` (encoded-surface reduction, version salt bump), new architectural-invariant test, replay-corpus stateHash re-bless across all pinned fixtures and snapshots
**Deps**: `archive/tickets/194ZOBDECSTA-001.md`, `archive/tickets/194ZOBDECSTA-002A.md`

## Problem

Spec 194 Phase 2 lever 2B ("Encoded-surface reduction"; `specs/194-zobrist-decision-stack-digest-optimization.md` §4.2) requires three obligations to land atomically in one Foundation #14 cut: (1) shrink `encodeDecisionStackFrameDigestInput` to drop the fields the field-irrelevance audit (ticket `archive/tickets/194ZOBDECSTA-001.md`) verdicts as `DROP-*`; (2) bump the Zobrist decision-stack-frame digest version salt (Foundation #13 reproducibility-metadata migration) so historical replays can be tied to the pre-reduction encoding by version pin; (3) re-bless every pinned `stateHash` in the determinism corpus, integration fixtures, and golden snapshots so the suite remains 100% green at the new canonical encoding. Splitting any of these into a follow-on ticket would leave the repository in a parallel-encoding state that violates Foundation #14 ("no parallel kernel versions in production code", per spec §4.2 closing paragraph).

The Phase 1 evidence (`reports/perf-baseline/zobrist-residual-cost-2026-05-25.md`) anchors the expected gain: aggregate mean encoded chars per miss is 23 647.62; aggregate encode total is 44 355.641 ms; aggregate FNV-1a digest total is 82 289.213 ms. Reducing the encoded surface should drop both proportionally, materializing the wall-clock gain the Phase 3 ticket (`tickets/194ZOBDECSTA-003.md`) is responsible for measuring.

## Assumption Reassessment (2026-05-25)

1. **Audit gate**: `archive/tickets/194ZOBDECSTA-001.md` produces the authoritative Drop field list. This ticket consumes that list verbatim from the audit report at `reports/audits/zobrist-encoded-surface-field-irrelevance-<DATE>.md` — the Drop list determines the exact edit to `encodeDecisionStackFrameDigestInput`. If the audit yields zero `DROP-*` verdicts, this ticket is structurally infeasible and the spec must be re-evaluated.
2. **Edit target verified**: `encodeDecisionStackFrameDigestInput` at `packages/engine/src/kernel/zobrist.ts:174-194`. Companion: `summarizeSuspendedFrameForDigestCache` at `zobrist.ts:160-172`. Both are the only producers of the JSON string consumed by `digestEncodedDecisionStackFrame` (`zobrist.ts:196-204`) and the only feed into the FNV-1a digest pass.
3. **Version salt mechanism**: the digest version is encoded as `decision-stack-frame-v1:a` / `decision-stack-frame-v1:b` at `zobrist.ts:140-141`. Bumping to `decision-stack-frame-v2:a` / `:b` causes `FRAME_DIGEST_PREFIX_A` / `_B` to recompute, so the FNV-1a chains produce a different canonical output even if the JSON content were identical — this is the version-pin mechanism per Foundation #13. No separate metadata file change is required, since the kernel version IS the salt string; record the bump in the migration doc and ticket Outcome.
4. **Fixture/snapshot blast radius** (verified by `grep -rln '"stateHash":\s*"0x[0-9a-f]' packages/engine/test/`):
   - `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json`
   - `packages/engine/test/fixtures/trace/eval-golden-trace.json`
   - `packages/engine/test/fixtures/trace/eval-state-snapshot.json`
   - `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/initial-state.json`
   - `packages/engine/test/fixtures/trace/valid-serialized-trace.json`
   - `packages/engine/test/fixtures/gamestate/spec-138-march-draw-space-seed-1002.json`
   - `packages/engine/test/fixtures/trace/fitl-turn-flow.golden.json`
   - `packages/engine/test/fixtures/gamestate/spec-138-march-draw-space-seed-1010.json`
   - `packages/engine/test/fixtures/trace/simulator-golden-trace.json`
   - `packages/engine/test/fixtures/trace/fitl-foundation-initial-state.golden.json`
   - `packages/engine/test/fixtures/gamestate/fitl-seed12-turn2-freeop-template.json`
   - `packages/engine/test/fixtures/policy-profile-quality/fitl-arvn-action-distribution-windows.json`
   Twelve pinned-hex `stateHash` files total. Several literals of the form `stateHash: 0n` in `*.test.ts` files (e.g., `packages/engine/test/integration/effects-complex.test.ts:70`) are placeholder zeros — they are not canonical hashes and are not affected by the encoding change. Confirm during reassessment by running the suite first and re-blessing only the files whose tests fail.
5. **Regeneration tooling**: only `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/regenerate.mjs` provides a fixture regenerator script today. Most fixtures must be re-blessed by hand-substituting the new `stateHash` value as the suite reports the expected/actual mismatch. Treat the re-bless as a mechanical post-test-failure substitution loop, not a script-driven regeneration.
6. **Foundation #14 atomic cut**: the encoding edit, version-salt bump, and re-bless MUST land in a single commit per F#14. The mechanical-uniformity exception (per `.claude/skills/spec-to-tickets/SKILL.md` Step 5 effort bullet) applies: every re-bless is a substring substitution on a pinned hex literal. The ticket is rated Large to reflect file count.
7. **New architectural-invariant test target**: `packages/engine/test/architecture/zobrist-canonical-key-byte-identity.test.ts` per spec §9. Target directory exists (`packages/engine/test/architecture/`); marker required: `// @test-class: architectural-invariant`.
8. **Spec 80 incremental contract preservation**: `recomputeDecisionStackFrameDigest` (`zobrist.ts:206-209`) and `digestDecisionStackFrame` (`zobrist.ts:211-245`) share `encodeDecisionStackFrameDigestInput`; both paths receive the reduction uniformly, so the incremental update path produces the same digest as a full recompute at the new encoding by construction (Spec 80 contract preserved).
9. **No WASM-side migration**: verified — `packages/engine-wasm/policy-vm/` contains no Zobrist routine. The canonical key is TS-only and the salt bump applies uniformly.
10. **Replay-identity prerequisite inserted 2026-05-25**: A Foundations reassessment after the first implementation attempt rejected closing this canonical hash migration without the full replay-identity proof. The active determinism lane and focused `spec-140-replay-identity.test.js` replacement probes timed out with only `TAP version 13`; the same 600s focused timeout reproduced in a clean `HEAD` baseline worktree, proving the timeout is pre-existing but still blocking under Foundations #8 and #16. New prerequisite `archive/tickets/194ZOBDECSTA-002A.md` owns restoring a citeable Spec 140 replay-identity proof before this ticket resumes.

## Architecture Check

1. **Single canonical encoding at every commit**: after this ticket lands, `decision-stack-frame-v2` is the only Zobrist decision-stack-frame canonical encoding in production code. There is no parallel v1 path, no feature flag, no opt-in branch — Foundation #14 satisfied by construction. Historical replays use the v1 encoding only at the pre-ticket kernel version, which is reproducible via Git commit pinning (Foundation #13).
2. **Reduction proves field-irrelevance via the audit gate**: the field drops are not heuristic; each is justified by `archive/tickets/194ZOBDECSTA-001.md`'s audit, which proves field-irrelevance against current consumer graph and Spec 80 / Spec 168 contracts. The ticket implements the audit's verdict, not new judgment.
3. **F#14 mechanical-uniformity exception applies**: the re-bless across 12 fixture files is mechanically uniform (substitute pinned stateHash hex literal at the suite-reported mismatch). The encoding edit itself is a small, localized diff. The Large effort rating reflects file count, not per-file complexity.
4. **Determinism preservation is proof-bound, not assumed**: the new `zobrist-canonical-key-byte-identity.test.ts` asserts that random decision-stack shapes hashed twice in the same process produce byte-identical `computeFullHash` outputs at the new canonical encoding. Combined with the Spec 168 cache-equivalence test and the Spec 192 trajectory-identity test, the determinism contract has three independent proof surfaces at the new encoding (per spec §6).
5. **No backwards-compatibility aliasing/shims introduced**: no `v1Encode`/`legacyEncodeFrame` paths, no feature flags, no `pre-v2` shim. The salt bump replaces v1 in place; the audit gates which fields disappear from the JSON.

## What to Change

### 1. Apply Drop verdicts to `encodeDecisionStackFrameDigestInput`

Edit `packages/engine/src/kernel/zobrist.ts:174-194` to omit every field the audit verdicts as `DROP-*`. If the audit also Drops sub-fields of `summarizeSuspendedFrameForDigestCache` (`zobrist.ts:160-172`), apply the same omission there. The edit must:

- Preserve every `KEEP` field at its current position in the encoded object (insertion order matters under JSON.stringify).
- Omit every `DROP-*` field unconditionally — no opt-in flag, no feature gate.
- Preserve the optional-field omission pattern (`...(frame.continuationBindings === undefined ? {} : { continuationBindings: ... })`) for any KEEP fields that retain optionality.
- Leave `digestEncodedDecisionStackFrame` (`zobrist.ts:196-204`) untouched — only the encoded surface changes; the FNV-1a algorithm is unchanged.

### 2. Bump digest version salt to `decision-stack-frame-v2`

Edit `packages/engine/src/kernel/zobrist.ts:140-141`:

- `FRAME_DIGEST_SALT_A = 'decision-stack-frame-v1:a'` → `'decision-stack-frame-v2:a'`
- `FRAME_DIGEST_SALT_B = 'decision-stack-frame-v1:b'` → `'decision-stack-frame-v2:b'`

The downstream `FRAME_DIGEST_PREFIX_A` / `_B` recompute automatically (constants derived via `updateFnv1a64State`). No other version literal changes are required at this layer.

### 3. New architectural-invariant test `packages/engine/test/architecture/zobrist-canonical-key-byte-identity.test.ts`

Per spec §9 lever 2A/2B test obligation. Properties:

- File-top marker: `// @test-class: architectural-invariant`.
- Body: generate a sufficient corpus of random decision-stack frame shapes (use existing helpers from `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` if available, otherwise synthesize per-test fixtures matching `DecisionStackFrame` shape).
- For each shape, build a minimal `GameState` via the determinism helpers, compute `computeFullHash` twice in the same process, and assert byte-equality of the returned bigint.
- Assert that re-running `digestDecisionStackFrame` on a freshly-constructed table (warm and cold cache scenarios) produces the same digest for the same frame.
- The test must explicitly assert it is running at salt `decision-stack-frame-v2` (e.g., via a brittle string check at module-load to fail loudly if the salt is reverted).

### 4. Re-bless pinned `stateHash` literals across all affected files

For each of the twelve files enumerated in Assumption Reassessment item 4, replace the pinned `stateHash` value with the new canonical hash. Process:

- Run `pnpm -F @ludoforge/engine run test:determinism` and `pnpm -F @ludoforge/engine run test` first; the suite reports the new expected hashes as `expected` / `actual` mismatches.
- Substitute the new hash into each file, repeating until the suite is 100% green at the new encoding.
- For the spec-144 probe-recovery fixture, prefer regenerating via `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/regenerate.mjs` if the script reads the new salt automatically; otherwise hand-substitute.
- The `stateHash: 0n` placeholder literals in `*.test.ts` files (per Assumption Reassessment item 4) are NOT affected — verify by running the suite and confirming they don't appear in failure output.
- Snapshot file `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json` contains multiple per-microturn `stateHash` entries; every one must be re-blessed.

### 5. Update Spec 80 / Spec 168 / Spec 192 cross-reference notes (if any test file embeds a salt literal)

Grep for any other source/test file embedding the literal `decision-stack-frame-v1` to confirm only the two `zobrist.ts:140-141` lines reference it. If additional references exist (e.g., docs, comments inside test files), update or remove them.

Verified at decomposition time:

```
$ grep -rln "decision-stack-frame-v1\|FRAME_DIGEST_SALT" packages/engine/
packages/engine/dist/test/unit/zobrist-table.test.js
packages/engine/dist/src/kernel/zobrist.js
packages/engine/src/kernel/zobrist.ts
packages/engine/test/unit/zobrist-table.test.ts
```

The `dist/` matches regenerate from `tsc` at build. The source matches are `zobrist.ts:140-141`. Check `packages/engine/test/unit/zobrist-table.test.ts` during implementation: if it asserts on the salt string, update the literal alongside the source bump.

### 6. Migration-doc and Spec 194 status update

- Add a one-paragraph entry under `docs/migration/` (sibling to `docs/migration/spec-140-trace-transform.md`) named `docs/migration/spec-194-zobrist-decision-stack-encoding-v2.md` describing the v1 → v2 bump, the dropped fields (verbatim from the audit), and the reproducibility-pin guidance for historical replays.
- The Spec 194 status update to `IN-FLIGHT — Phase 2 landed; Phase 3 pending` is owned by the Outcome line of this ticket and the spec back-link in `tickets/194ZOBDECSTA-003.md`. Do not archive Spec 194 here — Phase 3 (`tickets/194ZOBDECSTA-003.md`) handles archive.

### 7. Determinism verification (post-implementation)

Run the full proof surface and confirm green:

- `pnpm -F @ludoforge/engine run test:determinism` — 31/31 files (or current count) green.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js` — Spec 168 equivalence green.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/perf-baseline-trajectory-identity.test.js` — Spec 192 trajectory-identity green across six workloads.
- `pnpm -F @ludoforge/engine run test` — full engine suite green.
- `pnpm turbo lint typecheck` — green.
- `pnpm run check:ticket-deps` — green.

## Files to Touch

- `packages/engine/src/kernel/zobrist.ts` (modify — encoded-surface reduction + salt bump)
- `packages/engine/test/architecture/zobrist-canonical-key-byte-identity.test.ts` (new — architectural-invariant test)
- `packages/engine/test/unit/zobrist-table.test.ts` (modify if it asserts on the salt literal — verify at implementation)
- `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/trace/eval-golden-trace.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/trace/eval-state-snapshot.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/initial-state.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/trace/valid-serialized-trace.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/gamestate/spec-138-march-draw-space-seed-1002.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/trace/fitl-turn-flow.golden.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/gamestate/spec-138-march-draw-space-seed-1010.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/trace/simulator-golden-trace.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/trace/fitl-foundation-initial-state.golden.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/gamestate/fitl-seed12-turn2-freeop-template.json` (modify — re-bless stateHash)
- `packages/engine/test/fixtures/policy-profile-quality/fitl-arvn-action-distribution-windows.json` (modify — re-bless stateHash)
- `docs/migration/spec-194-zobrist-decision-stack-encoding-v2.md` (new — Foundation #13 reproducibility-metadata migration note)

Additional fixture / snapshot files MAY surface during the test-driven re-bless loop if the suite reveals dependencies the decomposition-time grep did not catch. Add them under §4 as discovered; the decomposition list above is the seeded set, not a closed set.

## Out of Scope

- **Adding any new cache / parallel encoding pathway** — Spec 194 §4.4 explicitly rejects this. The only allowed mechanism is the in-place encoded-surface shrink.
- **Changing the FNV-1a algorithm itself** — only the encoded surface changes; the digest hashing pipeline is unchanged.
- **Engine-WASM Zobrist parity** — out of scope per spec §2.
- **Phase 3 perf witness re-capture** — owned by `tickets/194ZOBDECSTA-003.md`.
- **Spec 194 archive** — owned by `tickets/194ZOBDECSTA-003.md` (after Phase 3 confirms the gain target).
- **Audit re-authoring** — the audit ticket (`archive/tickets/194ZOBDECSTA-001.md`) is the gate; this ticket consumes its verdict.
- **Splitting the re-bless into a separate ticket** — Foundation #14 atomic discipline forbids it; the cut MUST be one commit.

## Acceptance Criteria

### Tests That Must Pass

1. New: `packages/engine/test/architecture/zobrist-canonical-key-byte-identity.test.ts` — passes at salt `decision-stack-frame-v2`.
2. Existing Spec 168 frame-digest-cache equivalence test (`packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`) — 100% green at new encoding.
3. Existing Spec 192 trajectory-identity test (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) — 100% green across all six workloads at new encoding.
4. Determinism corpus: `pnpm -F @ludoforge/engine run test:determinism` — 100% green at new encoding.
5. Full engine suite: `pnpm -F @ludoforge/engine run test` — 100% green.

### Invariants

1. **Single canonical encoding**: at every commit during and after this ticket, there is exactly one canonical Zobrist decision-stack-frame encoding in `packages/engine/src/kernel/zobrist.ts`. No v1 path, no parallel encoder, no opt-in flag — Foundation #14 satisfied by `grep -c "decision-stack-frame-v1" packages/engine/src/` returning 0.
2. **Reproducibility by version pin**: the salt string `decision-stack-frame-v2` is the kernel-version identifier per Foundation #13; historical commits at the v1 encoding remain reproducible via Git commit pinning, documented in the new `docs/migration/spec-194-zobrist-decision-stack-encoding-v2.md`.
3. **Spec 80 incremental contract preserved**: `recomputeDecisionStackFrameDigest` and `digestDecisionStackFrame` consume the same encoded surface; the incremental and full-recompute paths produce identical digests for the same input.
4. **No new cache infrastructure**: no new `WeakMap` / `LruCache` / `Map` is introduced in `zobrist.ts`; the existing two-cache pipeline is the only digest cache hierarchy.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/zobrist-canonical-key-byte-identity.test.ts` (new, `@test-class: architectural-invariant`) — random decision-stack shapes hashed twice in the same process; asserts byte-equality of `computeFullHash` output at the new canonical encoding; also asserts warm/cold cache equivalence for `digestDecisionStackFrame`.
2. Re-bless pinned `stateHash` literals in the 12 fixture/snapshot files enumerated in §Files to Touch.
3. (If `packages/engine/test/unit/zobrist-table.test.ts` asserts on the salt literal): update to the new `decision-stack-frame-v2:*` strings.

### Commands

1. Build engine: `pnpm turbo build`.
2. Targeted: `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/zobrist-canonical-key-byte-identity.test.js`.
3. Targeted: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js`.
4. Targeted: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/perf-baseline-trajectory-identity.test.js`.
5. Determinism corpus: `pnpm -F @ludoforge/engine run test:determinism`.
6. Full engine suite: `pnpm -F @ludoforge/engine run test`.
7. Lint + typecheck (project canonical): `pnpm turbo lint typecheck`.
8. Dependency integrity: `pnpm run check:ticket-deps`.

## Outcome

Completed: 2026-05-25

What changed:

- Applied the audit-selected v2 encoded-surface reduction in `packages/engine/src/kernel/zobrist.ts`: `effectFrame.pendingTriggerQueue` and `effectFrame.decisionHistory` no longer feed `encodeDecisionStackFrameDigestInput`; all KEEP fields remain in their prior JSON insertion order.
- Bumped the Zobrist decision-stack-frame digest salts from `decision-stack-frame-v1:*` to `decision-stack-frame-v2:*`; no v1 encoder, compatibility flag, or parallel cache path was retained.
- Added `packages/engine/test/architecture/zobrist-canonical-key-byte-identity.test.ts` as the Spec 194 architectural invariant. It asserts the compiled salt is v2, no compiled v1 salt remains, repeated full hashes are byte-identical, and recompute/cold-cache/warm-cache frame digests agree.
- Added `docs/migration/spec-194-zobrist-decision-stack-encoding-v2.md` documenting the v1 to v2 reproducibility boundary and the dropped fields.
- Re-blessed the only suite-reported pinned hash fallout: `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json` top-level `serializedFinalState.stateHash` changed from `0x2fb6f5427d98e3cc` to `0x32fa1019e7a46390`. The nested suspended-state hash remained unchanged because that state does not include the v2 decision-stack surface.

Deviations:

- The seeded 12-file fixture list did not all require edits. The TDD re-bless loop found one actual failing pinned hash, and the full engine suite passed after that single update.
- `packages/engine/test/unit/zobrist-table.test.ts` did not embed a salt literal and required no edit.

Verification:

- `pnpm turbo build` — passed after the new test fixture typing fixes.
- `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/zobrist-canonical-key-byte-identity.test.js` — passed, 2/2 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js` — passed, 4/4 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/perf-baseline-trajectory-identity.test.js` — passed, 6/6 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` — passed after the snapshot re-bless, 2/2 tests.
- `pnpm -F @ludoforge/engine run test:determinism` — passed, 31/31 determinism files.
- `pnpm -F @ludoforge/engine run test` — passed; schema artifact check plus 170/170 default test files.
- `pnpm turbo lint typecheck` — passed.
- `pnpm run check:ticket-deps` — passed.
- `rg -n "decision-stack-frame-v1" packages/engine/src` — no matches; the only remaining v1 literals are historical/provenance prose in this ticket and the migration doc.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
|---|---:|---:|---|---:|---|---|
| `packages/engine/src/kernel/zobrist.ts` | 645 | 643 | no | -2 | below 800-line cap; no extraction needed | none |

Generated artifact provenance:

- artifact path(s): `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json`
- generation command: direct focused witness `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` exposed the expected/actual mismatch; the committed change is the suite-reported actual top-level `stateHash`
- canonical inputs: current v2 Zobrist salts, Spec 161 chooseNStep default-off fixture, and `serializeGameState(finalState)` from the focused determinism test
- expected refresh reason: intentional canonical hash version bump and encoded-surface reduction under Spec 194 Phase 2
- generator durability: retained generator: `packages/engine/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.ts`
- hygiene proof: focused witness plus full determinism corpus and full engine suite passed
