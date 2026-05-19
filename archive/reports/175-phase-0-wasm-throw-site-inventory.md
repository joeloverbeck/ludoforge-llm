# Spec 175 Phase 0 WASM Throw-Site Inventory

**Status**: ✅ EXPLOITED — archived 2026-05-19.

## Date & Spec Link

- Date: 2026-05-16
- Spec: `archive/specs/175-wasm-ts-fallback-contract-enforcement.md`
- Ticket: `archive/tickets/175WASMTSFALCON-001.md`
- Inventory commit: `ed23802274c5941c4578cae84770fe7555d1de48`

## Methodology

Commands run from the repository root:

```bash
grep -rn "throw " packages/engine/src/agents/policy-wasm-*.ts
grep -rn "throw " packages/engine/src/agents/policy-wasm-*.ts | wc -l
grep -rn "throw new PolicyRuntimeError" packages/engine/src/agents/policy-wasm-*.ts
```

Raw count at `ed23802274c5941c4578cae84770fe7555d1de48`:

```text
85
```

`throw new PolicyRuntimeError` appears 6 times, all in
`packages/engine/src/agents/policy-wasm-score-routing.ts`.

## Summary Counts

| Class | Meaning | Count |
| --- | --- | ---: |
| A | unsupported-detection with TS fallback available; convert to null-return or typed analog in Phase 1 | 2 |
| B | remain-throw -- contract violation outside a safe TS fallback contract | 15 |
| C | remain-throw -- codec/internal ABI contract | 68 |
| Total | all `throw ` sites under `packages/engine/src/agents/policy-wasm-*.ts` | 85 |

Files containing throw sites: 9.

## Per-Site Table

| File:Line | Class | Surrounding branch | TS fallback path | Rationale |
| --- | --- | --- | --- | --- |
| `policy-wasm-preview-drive-completion.ts:23` | C | `depthCap` validation before completion-record sizing | None | Invalid batch sizing would corrupt the completion-record ABI. |
| `policy-wasm-preview-drive-completion.ts:29` | C | completion-record count exceeds `depthCap` | None | The host input violates the bounded completion-record layout. |
| `policy-wasm-preview-drive-completion.ts:44` | C | encoded completion records exceed batch max | None | The encoder/decoder batch contract has drifted and must fail closed. |
| `policy-wasm-preview-drive-completion.ts:50` | C | completion `iterationIndex` is invalid | None | Invalid ordered completion metadata cannot be repaired by policy scoring fallback. |
| `policy-wasm-preview-drive-completion.ts:53` | C | completion records are not strictly ordered | None | The WASM completion carrier requires deterministic record ordering. |
| `policy-wasm-preview-drive-completion.ts:56` | C | residual budget outside `depthCap` | None | The completion carrier is internally inconsistent. |
| `policy-wasm-preview-drive-completion.ts:83` | C | decoded completion iteration mismatches expected record | None | A returned WASM completion row disagrees with the host ABI mirror. |
| `policy-wasm-preview-drive-completion.ts:86` | C | decoded residual budget mismatches expected record | None | A returned WASM completion row disagrees with the host ABI mirror. |
| `policy-wasm-preview-drive-completion.ts:89` | C | decoded completion outcome mismatches expected record | None | A returned WASM completion row disagrees with the host ABI mirror. |
| `policy-wasm-preview-drive-completion.ts:120` | C | unknown completion outcome code | None | The WASM module returned an unrecognized enum discriminant. |
| `policy-wasm-preview-drive-slots.ts:43` | C | preview-state slot id code mismatch | None | Slot metadata returned by WASM does not match the host-declared slot layout. |
| `policy-wasm-preview-drive-slots.ts:58` | C | unknown preview-state slot kind code | None | The WASM module returned an unrecognized slot-kind discriminant. |
| `policy-wasm-preview-drive-slots.ts:66` | C | unknown preview-state slot lifetime code | None | The WASM module returned an unrecognized slot-lifetime discriminant. |
| `policy-wasm-preview-drive-state-patch-codec.ts:52` | C | state-patch op count exceeds depth cap | None | The host patch contract would exceed the bounded preview-drive ABI. |
| `policy-wasm-preview-drive-state-patch-codec.ts:68` | C | materialized state patch missing for a candidate | None | Materialized patch mode requires a patch for every candidate. |
| `policy-wasm-preview-drive-state-patch-codec.ts:71` | C | state-patch op count exceeds batch maximum | None | The host patch contract is inconsistent with the encoded batch maximum. |
| `policy-wasm-preview-drive-state-patch-codec.ts:92` | C | decoded op count is negative or too large | None | The WASM result violates the declared patch-op bounds. |
| `policy-wasm-preview-drive-state-patch-codec.ts:96` | C | decoded op count mismatches expected patch | None | The WASM result does not mirror the host patch contract. |
| `policy-wasm-preview-drive-state-patch-codec.ts:162` | C | decoded op words mismatch expected op | None | The WASM result does not mirror the host patch contract. |
| `policy-wasm-preview-drive-state-patch-codec.ts:200` | C | patch scalar is not finite i32 | None | Non-i32 patch words cannot be encoded safely into the ABI. |
| `policy-wasm-preview-drive-state-patch.ts:98` | C | patch references unknown global variable | None | A materialized patch refers to state the GameDef does not own. |
| `policy-wasm-preview-drive-state-patch.ts:108` | C | patch references unknown zone variable | None | A materialized patch refers to state the GameDef does not own. |
| `policy-wasm-preview-drive-state-patch.ts:125` | C | patch references unknown token move | None | A materialized patch references a token or zone outside the state mirror. |
| `policy-wasm-preview-drive-state-patch.ts:129` | C | token move is not materializable | None | The patch cannot be converted into the generic state projection. |
| `policy-wasm-preview-drive-state-patch.ts:139` | C | patch references unknown token property | None | A materialized patch refers to token data outside the GameDef contract. |
| `policy-wasm-preview-drive-state-patch.ts:143` | C | token property patch is not materializable | None | The patch cannot be converted into the generic state projection. |
| `policy-wasm-preview-drive-state-patch.ts:154` | C | patch references unknown marker | None | A materialized patch refers to marker data outside the GameDef contract. |
| `policy-wasm-preview-drive-state-patch.ts:163` | C | patch references unknown action usage | None | A materialized patch refers to an action outside the GameDef contract. |
| `policy-wasm-preview-drive-state-patch.ts:187` | C | chooseNStep continuation kind/frame mismatch | None | The patch attempts to apply a continuation that is not the published microturn. |
| `policy-wasm-preview-drive-state-patch.ts:191` | C | chooseNStep decision key mismatch | None | The patch attempts to apply a continuation that is not the published microturn. |
| `policy-wasm-preview-drive-state-patch.ts:195` | C | chooseNStep add/remove lacks a value | None | The continuation patch is incomplete and cannot be applied deterministically. |
| `policy-wasm-preview-drive-state-patch.ts:207` | C | chooseNStep continuation is not legal | None | The patch attempts a decision the public microturn did not publish. |
| `policy-wasm-preview-drive-state-patch.ts:226` | C | chooseOne continuation kind/frame mismatch | None | The patch attempts to apply a continuation that is not the published microturn. |
| `policy-wasm-preview-drive-state-patch.ts:230` | C | chooseOne decision key mismatch | None | The patch attempts to apply a continuation that is not the published microturn. |
| `policy-wasm-preview-drive-state-patch.ts:238` | C | chooseOne continuation is not legal | None | The patch attempts a decision the public microturn did not publish. |
| `policy-wasm-preview-drive.ts:254` | C | candidate preview-state value count mismatches slot count | None | The preview-state carrier cannot be encoded without one value per declared slot. |
| `policy-wasm-preview-drive.ts:377` | C | candidate group ordinal is invalid | None | Candidate-group metadata is malformed before ABI encoding. |
| `policy-wasm-preview-drive.ts:380` | C | candidate group size is invalid | None | Candidate-group metadata is malformed before ABI encoding. |
| `policy-wasm-preview-drive.ts:383` | C | candidate group ordinal outside group size | None | Candidate-group metadata is malformed before ABI encoding. |
| `policy-wasm-preview-drive.ts:405` | C | group metadata returned for ungrouped candidate | None | The WASM result produced unexpected metadata outside the host-declared layout. |
| `policy-wasm-preview-drive.ts:411` | C | candidate group id code mismatch | None | The WASM result does not mirror the host-declared group id. |
| `policy-wasm-preview-drive.ts:414` | C | candidate group ordinal mismatch | None | The WASM result does not mirror the host-declared group ordinal. |
| `policy-wasm-preview-drive.ts:417` | C | candidate group size mismatch | None | The WASM result does not mirror the host-declared group size. |
| `policy-wasm-preview-drive.ts:462` | C | candidate delta count mismatches candidate count | None | The preview-drive step cannot be encoded safely for the current batch. |
| `policy-wasm-preview-drive.ts:506` | C | unknown preview-drive outcome code | None | The WASM module returned an unrecognized outcome discriminant. |
| `policy-wasm-preview-drive.ts:546` | C | unknown preview status code | None | The WASM module returned an unrecognized preview-status discriminant. |
| `policy-wasm-preview-drive.ts:570` | C | unknown preview branch code | None | The WASM module returned an unrecognized preview-branch discriminant. |
| `policy-wasm-preview-drive.ts:581` | C | unknown boolean flag code | None | The WASM module returned an invalid boolean carrier value. |
| `policy-wasm-preview-drive.ts:615` | C | decision-stack maxDepth invalid | None | Decision-stack publication metadata is malformed before ABI encoding. |
| `policy-wasm-preview-drive.ts:618` | C | decision-stack frame count exceeds maxDepth | None | Decision-stack publication metadata is malformed before ABI encoding. |
| `policy-wasm-preview-drive.ts:636` | C | publication maxDepth exceeds batch maxDepth | None | Decision-stack publication metadata is inconsistent with batch sizing. |
| `policy-wasm-preview-drive.ts:642` | C | decision-stack frame depth not strictly ordered | None | Decision-stack publication metadata would be nondeterministic or ambiguous. |
| `policy-wasm-preview-drive.ts:682` | C | decision-stack context code mismatch | None | The WASM result does not mirror the host-declared decision-stack context. |
| `policy-wasm-preview-drive.ts:727` | C | unknown decision-stack frame variant code | None | The WASM module returned an unrecognized decision-stack discriminant. |
| `policy-wasm-preview-drive.ts:733` | C | preview-drive word is not signed i32 | None | Non-i32 words cannot be encoded safely into the preview-drive ABI. |
| `policy-wasm-production-preview-drive.ts:101` | C | supported row lacks required state patch | None | Materialized state-patch mode returned an incomplete supported row. |
| `policy-wasm-runtime-node-loader.ts:21` | B | repository root cannot be located | None | This is environment/tooling setup, not an unsupported preview-drive shape. |
| `policy-wasm-runtime.ts:238` | B | runtime scalar is not signed i32 | None | Invalid host input cannot be safely coerced through TS fallback. |
| `policy-wasm-runtime.ts:245` | B | module lacks `memory` export | None | The loaded WASM module is not the required policy VM. |
| `policy-wasm-runtime.ts:259` | B | module lacks a required function export | None | The loaded WASM module is not the required policy VM. |
| `policy-wasm-runtime.ts:431` | C | bytecode input size drifted in fast little-endian path | None | The host bytecode encoder disagrees with its own ABI word count. |
| `policy-wasm-runtime.ts:479` | C | bytecode header size drifted | None | The host bytecode encoder disagrees with the ABI header layout. |
| `policy-wasm-runtime.ts:502` | C | bytecode input size drifted in portable path | None | The host bytecode encoder disagrees with its own ABI word count. |
| `policy-wasm-runtime.ts:590` | B | batch program is not i32-aligned | None | The runtime batch input is malformed before WASM execution. |
| `policy-wasm-runtime.ts:616` | B | candidate feature row count mismatches candidate count | None | Precomputed row inputs are internally inconsistent. |
| `policy-wasm-runtime.ts:626` | B | preview candidate feature value count mismatches candidate count | None | Precomputed preview row inputs are internally inconsistent. |
| `policy-wasm-runtime.ts:629` | B | preview candidate feature outcome count mismatches candidate count | None | Precomputed preview outcome inputs are internally inconsistent. |
| `policy-wasm-runtime.ts:639` | B | dynamic candidate feature row count mismatches candidate count | None | Precomputed dynamic row inputs are internally inconsistent. |
| `policy-wasm-runtime.ts:672` | B | precomputed value is not undefined/boolean/safe integer | None | Unsupported scalar value shape cannot be encoded safely. |
| `policy-wasm-runtime.ts:688` | B | preview outcome cannot be encoded | None | Unknown preview outcome is a host contract violation. |
| `policy-wasm-runtime.ts:717` | C | unknown bytecode value tag returned | None | The WASM module returned an unrecognized value discriminant. |
| `policy-wasm-runtime.ts:738` | C | rethrow after non-unsupported batch error | None | Only status `-14` is a typed unsupported sentinel; other errors remain fatal. |
| `policy-wasm-runtime.ts:1102` | C | ABI magic mismatch | None | Host and guest identity constants do not match. |
| `policy-wasm-runtime.ts:1105` | C | ABI version mismatch | None | Host and guest ABI versions do not match. |
| `policy-wasm-runtime.ts:1108` | C | smoke layout mismatch | None | Host and guest smoke layout constants do not match. |
| `policy-wasm-runtime.ts:1130` | C | smoke evaluation returned nonzero status | None | The raw WASM smoke call failed outside the unsupported-preview contract. |
| `policy-wasm-runtime.ts:1152` | C | bytecode evaluation returned nonzero status | None | Single-row bytecode evaluation has no score-routing TS fallback at this boundary. |
| `policy-wasm-runtime.ts:1179` | C | bytecode batch evaluation returned nonzero status | `supportedBatchValues` only maps status `-14` to `null` | Non-`-14` batch statuses are fatal WASM runtime errors. |
| `policy-wasm-runtime.ts:1280` | C | preview-drive batch returned nonzero status other than `-14` | `evaluatePreviewDriveBatch` already maps status `-14` to an unsupported result | Non-`-14` preview-drive statuses are fatal WASM runtime errors. |
| `policy-wasm-score-routing.ts:53` | B | precomputed policy value is not scalar integer/boolean/undefined | None | Invalid scoring value shape has no correct WASM or TS fallback interpretation. |
| `policy-wasm-score-routing.ts:373` | B | unknown consideration id in profile plan | None | Catalog/profile mismatch is a policy contract violation, not an unsupported WASM shape. |
| `policy-wasm-score-routing.ts:399` | B | unknown candidate feature id in profile plan | None | Catalog/profile mismatch is a policy contract violation, not an unsupported WASM shape. |
| `policy-wasm-score-routing.ts:465` | A | preview candidate-feature row route returns `null` for unsupported expression | `policy-eval.ts` `!scoredWithWasm` branch at the caller can run the TS evaluator for all candidates | This is an unsupported WASM row route with existing telemetry and a safe TS scoring fallback. |
| `policy-wasm-score-routing.ts:528` | A | move consideration score-row route returns unsupported result | `policy-eval.ts` `!scoredWithWasm` branch at the caller can run the TS evaluator for all candidates | This is an unsupported WASM score-row route with existing telemetry and a safe TS scoring fallback. |
| `policy-wasm-score-routing.ts:550` | B | supported score-row result omits a candidate row | None | A supported result missing a candidate is an ABI/route correctness violation, not an unsupported shape. |

## Already-Converted Reference Null-Return Sites

These are not conversion targets for Phase 1; they document the canonical pattern to mirror.

| File:Line | Pattern | Notes |
| --- | --- | --- |
| `policy-wasm-score-routing.ts:225-230` | records `production-preview-drive.cardEventAction` unsupported telemetry and returns `null` | Unsupported card-event action candidates are absorbed by the local TS fallback path. |
| `policy-wasm-score-routing.ts:235-237` | records preview candidate-feature unsupported telemetry and returns `null` | Unsupported preview-state slot/ref shapes are absorbed by TS candidate-feature evaluation. |
| `policy-wasm-score-routing.ts:266-273` | records preview-drive unsupported telemetry plus preview candidate-feature unsupported telemetry and returns `null` | Unsupported production preview-drive batches are absorbed by TS candidate-feature evaluation. |
| `policy-wasm-runtime.ts:738` | `supportedBatchValues` converts only status `-14` to `null` | This is the runtime-level unsupported sentinel; all other errors remain throws. |
| `policy-wasm-runtime.ts:1262-1271` | `evaluatePreviewDriveBatch` converts status `-14` to an unsupported result | This is the preview-drive typed analog of a null-return unsupported sentinel. |

## Phase 1 Conversion Plan

Convert these class-A sites in this order:

1. `policy-wasm-score-routing.ts:465`: after `evaluateWasmCandidateFeatureRow(...)` returns `null`, preserve `recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported')`, then return the typed fallback sentinel from `tryScoreMoveConsiderationsWithWasm` (`false`) so the caller's `!scoredWithWasm` branch evaluates scores in TypeScript.
2. `policy-wasm-score-routing.ts:528`: after `evaluateWasmMoveConsiderationScoreRows(...)` returns `unsupported`, preserve `recordProductionPolicyWasmScoreRows('unsupported')`, then return `false` so the caller's `!scoredWithWasm` branch evaluates scores in TypeScript.

Do not convert:

- `policy-wasm-score-routing.ts:550`: a supported route omitting a candidate row remains fatal because it means WASM returned a corrupt or incomplete supported payload.
- `policy-wasm-score-routing.ts:53`, `:373`, and `:399`: scalar/catalog mismatches remain fatal contract violations.
- Any lower-level codec, loader, ABI, or state-patch throw listed as class B/C above.

## Phase 2 Enforcement Seed

Phase 2 should allowlist preserved throws with a comment marker adjacent to each throw, using:

```ts
// @policy-wasm-throw: contract-violation
```

The architecture test should require that marker for all class-B and class-C throws listed above. Converted class-A sites should instead carry:

```ts
// @policy-wasm-unsupported: null-return
```

Expected Phase 2 marker counts after Phase 1, assuming no additional throw sites are added before then:

| Marker | Expected count |
| --- | ---: |
| `// @policy-wasm-throw: contract-violation` | 83 |
| `// @policy-wasm-unsupported: null-return` | 2 new markers, plus any existing canonical null-return references Phase 2 chooses to mark |

## Cross-Reference Verification

- `grep -rn "throw " packages/engine/src/agents/policy-wasm-*.ts | wc -l` returned `85`.
- The per-site table above contains 85 rows.
- `grep -rn "throw new PolicyRuntimeError" packages/engine/src/agents/policy-wasm-*.ts` returned 6 rows, all in `policy-wasm-score-routing.ts`.
- Class-A conversion target count: 2 (`policy-wasm-score-routing.ts:465`, `policy-wasm-score-routing.ts:528`).
