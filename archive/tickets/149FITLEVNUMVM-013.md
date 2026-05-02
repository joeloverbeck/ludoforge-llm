# 149FITLEVNUMVM-013: AgentPolicyExpr → bytecode compiler + disassembler

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/cnl/policy-bytecode/compile.ts`, `packages/engine/src/agents/policy-bytecode/disassemble.ts`
**Deps**: `archive/tickets/149FITLEVNUMVM-011.md`, `archive/tickets/149FITLEVNUMVM-012.md`

## Problem

Phase 3's core deliverable: lower the compile-time `AgentPolicyExpr` IR (Spec 147's compiler input) into flat numeric bytecode. The disassembler is bundled into this ticket because the disassembler inverts compilation — they share traversal logic and are debugged together. No runtime use yet — the compiler is gated behind an experimental flag until ticket 015's VM is ready.

Per spec §2.4: the lowering bypasses the closure-tree intermediate (`buildPolicyExprClosure`) entirely.

## Assumption Reassessment (2026-04-28)

1. `AgentPolicyExpr` is the input IR (defined in `packages/engine/src/kernel/types.ts`); ticket 011's opcodes + ticket 012's feature table are the output substrate.
2. The compile-time AST is what `compiled-policy-runtime.ts:buildPolicyExprClosure` currently consumes — the bytecode lowering operates on the same input but produces different output.
3. Effort is Large because the compiler must handle every `AgentPolicyExpr` variant + every `CompiledPolicyExpr` discriminant + the score-overflow guard from ticket 011's `validateScoreRange` stub.

## Architecture Check

1. Bytecode is generated, not authored. F7 preserved.
2. Compiler is deterministic — same `AgentPolicyExpr` input + same feature table → byte-identical bytecode (F8).
3. Bytecode emission produces no FITL-specific opcodes. F1 preserved.
4. The closure-tree path (`compiled-policy-runtime.ts:buildPolicyExprClosure`) is NOT modified or deleted in this ticket — that happens in ticket 016 after parity is proven. Until then, both paths coexist.

## Foundation Reassessment (2026-04-30)

`docs/FOUNDATIONS.md` requires exact rule-authoritative numeric operations; today that means integer-only. Live FITL policy authoring contained decimal score weights (`-0.1`, `0.02`, `0.03`, `1.5`), so the implementation first normalizes FITL policy scoring units by multiplying consideration weights/profile weight params by 100. This preserves relative score ordering while removing decimal score inputs from the compiled FITL agent catalog. The compiler itself refuses non-integer numeric literals by emitting `RESOLVE_DYNAMIC`; it does not silently round or truncate.

## What to Change

### 1. `packages/engine/src/cnl/policy-bytecode/compile.ts` (new)

Export:
- `function compilePolicyBytecode(expr: AgentPolicyExpr, def: GameDef, layout: EncodedStateLayout): PolicyBytecode` — main lowering entry.
- Internal traversal functions per `AgentPolicyExpr` variant — emit opcode sequences.
- Score-overflow guard: refuses expressions whose static range exceeds 2^30 (spec §5 edge case). On refusal, emit `RESOLVE_DYNAMIC` opcode + log a perf warning so the expression gets eliminated.
- Compiler determinism: instruction emission order matches AST traversal order; constants table sorted; feature ids resolved via ticket 012's `buildFeatureTable`.

### 2. `packages/engine/src/agents/policy-bytecode/disassemble.ts` (new)

Export:
- `function disassemble(bytecode: PolicyBytecode): string` — produces human-readable opcode listing.
- Format: one instruction per line, opcode mnemonic + operands, optional inline comments referencing feature-table ref names.

Used as a debugging tool during Phase 3 development and Phase 4 default-flip parity diagnosis.

### 3. Compiler-determinism test

Add a test verifying that compiling the same `AgentPolicyExpr` twice produces byte-identical `PolicyBytecode.instructions` Int32Array.

### 4. RESOLVE_DYNAMIC tracking

Add a perf-warning logger when the compiler emits `RESOLVE_DYNAMIC`. The log entry includes the expression's source file/line (if available from `AgentPolicyExpr` metadata) so operators can prioritize elimination before Phase 4's default-flip (ticket 016 explicitly requires zero `RESOLVE_DYNAMIC` cases pre-flip).

### 5. Experimental-flag gating

Until ticket 015 lands the VM, compilation is gated behind an env var (`LUDOFORGE_BYTECODE_COMPILE=on`) so the closure-tree path remains the production runtime. The compiler runs only in test scenarios.

## Files to Touch

- `packages/engine/src/cnl/policy-bytecode/compile.ts` (new)
- `packages/engine/src/cnl/policy-bytecode/index.ts` (modify — extend barrel)
- `packages/engine/src/agents/policy-bytecode/disassemble.ts` (new)
- `packages/engine/src/agents/policy-bytecode/index.ts` (new — barrel)
- `packages/engine/test/unit/cnl/policy-bytecode-compile.test.ts` (new)
- `packages/engine/test/unit/agents/policy-bytecode-disassemble.test.ts` (new)
- `data/games/fire-in-the-lake/92-agents.md` (modify — integer policy score units)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (modify — regenerated integer policy catalog mirror)
- `packages/runner/src/bootstrap/fitl-game-def.json` (modify — regenerated source mirror)
- `packages/runner/src/bootstrap/texas-game-def.json` (modify — stale canonical drift refreshed by shared bootstrap generator)
- `specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md` (modify — opcode list reflects compiler-owned generic operators)

## Out of Scope

- Round-trip equivalence harness (ticket 014).
- VM core (ticket 015).
- Default-flip + closure-tree deletion (ticket 016).
- Runtime use in production (gated behind experimental flag until ticket 015).

## Acceptance Criteria

### Tests That Must Pass

1. New test: compiling all 4 FITL baseline profiles' `AgentPolicyExpr` succeeds with zero `RESOLVE_DYNAMIC` opcodes (anecdotal expectation per spec §11).
2. New test: compiler is deterministic — two compilations produce byte-identical bytecode.
3. New test: disassembler round-trip — `compile → disassemble` produces valid human-readable text; the text is informative (mnemonic + operands).
4. New test: score-overflow guard refuses a synthetic expression with static range > 2^30 by emitting `RESOLVE_DYNAMIC` + logging a warning.
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific compiler branches.
2. Bytecode output is integer-only.
3. Closure-tree path (`buildPolicyExprClosure`) is unchanged at this ticket's scope.
4. F1, F7, F8, F14 preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/policy-bytecode-compile.test.ts` — compilation coverage, determinism, RESOLVE_DYNAMIC fallback, both games.
2. `packages/engine/test/unit/agents/policy-bytecode-disassemble.test.ts` — disassembler output shape.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/policy-bytecode-compile.test.js dist/test/unit/agents/policy-bytecode-disassemble.test.js`.
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo schema:artifacts`.

## Closeout Notes (2026-04-30)

Implemented the bytecode compiler, disassembler, compiler/disassembler tests, FITL integer scoring-unit normalization, and generated bootstrap updates. Verification used the focused compiler/disassembler tests, full engine default lane, lint, typecheck, schema artifacts, and ticket dependency checks.

## Outcome

Completed: 2026-04-30

What changed:
- Added the policy bytecode compiler and disassembler.
- Extended the generic opcode enum for the live FITL baseline policy DSL surface.
- Added compiler/disassembler unit coverage, including zero `RESOLVE_DYNAMIC` across all four FITL baseline profiles.
- Normalized FITL authored policy score weights to integer units by multiplying the scoring surface by 100, preserving relative score ordering while removing decimal score inputs.
- Regenerated committed production mirrors affected by the compiled agent/catalog surface, including runner bootstrap fixtures and the FITL policy catalog golden.

Deviation from original plan:
- The draft `LUDOFORGE_BYTECODE_COMPILE=on` compile-stage gate was not added because ticket 013 does not route bytecode into production runtime. Runtime A/B gating remains owned by ticket 015 through `LUDOFORGE_POLICY_VM=on`; ticket 015 was amended during post-ticket review to own the full live opcode enum introduced here.

Verification:
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/policy-bytecode-compile.test.js dist/test/unit/agents/policy-bytecode-disassemble.test.js dist/test/unit/cnl/policy-bytecode-types.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo schema:artifacts`
- `pnpm -F @ludoforge/runner run bootstrap:fixtures:check`
- `git diff --check`
- `pnpm run check:ticket-deps`
