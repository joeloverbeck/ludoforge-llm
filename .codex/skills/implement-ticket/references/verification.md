# Verification

## Command Sanity Check (Reassessment-Time)

Sanity-check ticket-named verification commands against live repo tooling before relying on them later:

- Prefer catching stale runner assumptions early (for example, Jest-style flags in a Node test-runner package) so the focused proof lane is valid before implementation starts.
- Validate behavior, not just syntax: confirm default flag interactions, output paths, and artifact-write conditions when the ticket depends on a specific file or JSON field.
- Determine whether each critical verification lane executes source files or compiled/generated outputs such as `dist`. If compiled/generated outputs are involved, identify the authoritative rebuild step before trusting runtime failures or green results.
- Check whether any likely verification commands contend on generated output trees such as `dist`, schema artifacts, compiled JSON, or goldens. If they do, plan those lanes as sequential-only before you start running checks.
- When a command is stale but the intended verification surface is clear, treat it as nonblocking drift and note the repo-valid substitution in working notes.
- For tracked tickets kept as historical records, prefer preserving the original command block and recording the repo-valid substitution in working notes and the ticket outcome unless the user explicitly asks for in-place cleanup.
- For active tracked tickets that are not yet archival records, correct nonblocking stale wording or path drift in place before marking the ticket complete so the active ticket remains a reliable session contract for later turns.
- For active untracked drafts, prefer correcting stale command examples in the ticket once the repo-valid replacement is confirmed, so future turns do not inherit the drift.

## Verification Preflight

Before running any substantive verification, do a verification preflight for each planned lane:

1. Confirm whether the command exercises source files, compiled artifacts, generated schemas, compiled JSON, or goldens.
2. Identify the authoritative rebuild/regeneration prerequisite, if any.
3. Record whether the lane is safe to overlap with other commands that touch the same outputs.
4. Decide what evidence level that lane can provide: focused proof, package-level proof, or full acceptance proof.
5. For shared-contract or migration tickets, explicitly label each lane as `intermediate green` or `acceptance-proof`; do not treat an intermediate package-local green lane as ticket completion if downstream repo-owned consumers remain unverified.

Before running broader checks, identify whether any ticket-relevant commands clean or rewrite shared outputs such as `packages/*/dist`, generated schemas, compiled JSON, or goldens. If they do, run those lanes serially even when the surrounding Codex guidance favors parallel tool use.

For bugfix tickets, the red step can come from an existing failing proof lane. If the ticket already names a failing test or reproducer that cleanly proves the bug, rerun that lane first and treat it as the red proof unless the bug needs a narrower or more direct witness. If the repo already contains a nearby passing or semantically adjacent regression that exercises the same seam, prefer adapting that witness before authoring a brand-new fixture from scratch.

If a verification lane fails immediately after overlapping output-contending commands, treat the first result as inconclusive until you rerun it serially. Recovery order:
1. Classify the failure as a possible ordering artifact rather than as code-caused.
2. Rebuild the touched package or regenerate the touched artifact tree to restore a clean authoritative output.
3. Rerun the failed proof lane serially before drawing conclusions or widening scope.

## Execution Order

1. Run the most relevant tests for the touched area.
   - If a focused check reads built `dist/` artifacts while a rebuild is still in progress, treat the failure as inconclusive; wait for the build and rerun.
2. Run required typecheck, lint, or artifact-generation commands. If a full repo-wide command is too expensive, explain what was run and what remains unverified.
3. Report unrelated pre-existing failures separately from failures caused by your changes.
4. Prefer the narrowest commands that validate the actual changed code path. For documentation-only tickets, artifact inspection plus dependency-integrity checks may suffice.
5. **Ticket-named commands are authoritative**: Run them before declaring completion unless reassessment proves them stale. Narrower checks provide fast feedback but do not replace ticket-explicit commands.
   - Focused proof commands may run first for fast feedback but do not satisfy the ticket on their own.
6. **Command substitution**: If a ticket's example command conflicts with live repo tooling (e.g., Jest flags in a Node test-runner package), use the repo-approved equivalent. State substitutions explicitly.
   - In this repo, engine tests use `node --test`; replace Jest-style name filtering with `pnpm -F @ludoforge/engine build` followed by `pnpm -F @ludoforge/engine exec node --test dist/test/unit/<file>.test.js`.
7. **Long-running commands**: Some ticket-required commands may run for minutes with sparse output. Treat that as normal when consistent with repo history; keep running and provide periodic progress updates.
8. **Post-clean reruns**: If a later authoritative command cleans shared build output (e.g., `dist`), rerun earlier test lanes after rebuilding. Treat the first post-clean module-resolution failure as an ordering issue.

## Build Ordering & Output Contention

Tests depending on `dist` require typecheck/rebuild first. Module-resolution errors during concurrent clean/rebuild are ordering failures — rerun after the serialized build.

Before running broader commands, check whether they share generated output trees, caches, or clean steps. Commands that clean, write `dist`, regenerate schemas, or depend on built test files must finish before another command touching the same tree starts.

Do not launch contending commands in the same parallel tool batch.

**In this repo**: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test`, `pnpm turbo build`, and `pnpm turbo typecheck` all contend on `packages/engine/dist` — run serially.

## Verification Safety

- Keep bugfix/regression verification on a red-green path: when you add or expose a focused failing proof for the ticket, keep rerunning that focused lane until it passes before escalating to broader package or repo commands.
- After a focused-front repair is green on a broad test or fixture migration, prefer package-level `typecheck` before the full package `test` lane when both are relevant. Residual mechanical fallout often appears there first and is cheaper to resolve before rerunning the full suite.
- For shared-contract, migration, or identifier-change tickets, require at least one workspace-level build or typecheck lane before declaring completion whenever another repo-owned package consumes the changed surface.
- Treat verification commands that delete or regenerate shared outputs as sequential-only unless the repo explicitly documents them as parallel-safe.
- In repositories where tests execute compiled files from `dist`, do not run build commands that rewrite `dist` in parallel with those tests. A build that starts with `rm -rf dist` can create false negative failures unrelated to the implementation.
- Treat transitive task-graph builds as output contenders too: `turbo` lanes such as `turbo typecheck` or `turbo test` may invoke package `build` tasks that rewrite `dist`, so do not overlap them with compiled-file test runs unless you have confirmed the graph is output-safe.
- If a broad verification failure appears immediately after overlapping build/test commands, rerun the affected checks sequentially before classifying the failure as code-caused.
- When the ticket changes phase transitions, running hashes, turn/phase boundary accounting, or similarly sensitive shared invariants, grep for the nearest invariant-focused test file and run that focused lane before escalating to the full package or repo suite.
- When a ticket's focused proof surface mixes a cheap new unit/integration lane with a heavier replay, campaign, or determinism lane, run the cheap independent lane first so local regressions surface before you pay the higher-cost proof run.
- When a ticket names a broad scan, campaign, replay window, or other potentially expensive proof command, estimate feasibility early with one or two representative worst-case witnesses before committing to the literal full run. If those witnesses show the named proof surface is no longer proportionate to the live boundary, stop via 1-3-1 instead of discovering that drift deep into implementation.
- For deterministic but seed-sensitive preparation flows, prefer bounded witness discovery over hardcoding an unverified seed. Keep the search bounded, deterministic, and aligned with the invariant being proven.
- When a ticket changes RNG consumption, retry branching, representative sampling order, or any other deterministic random-path behavior, immediately audit fixed-seed proof surfaces for intentional fallout: representative-seed helpers, exact completion-order assertions, exact success-count assertions, policy summary goldens, and other fixed-seed trace fixtures may need to be rewritten from old-path expectations to invariant-based proofs or refreshed golden outputs.
- For deterministic-RNG changes, prefer assertions on boundedness, determinism, witness elimination, and the intended chosen representative over preserving a formerly incidental random-path order unless the ticket explicitly owns that order as part of the contract.
- When a ticket names a simulator path, agent profile, campaign harness, replay harness, or other configuration-sensitive reproducer, preserve that authoritative setup in quick repro probes before classifying the witness as stale, fixed, or shifted. Do not treat a cheaper default-path probe as authoritative if profile wiring, RNG routing, or harness behavior can materially change the witness.
- If an initial bounded witness proves only part of the target invariant, keep searching for a stronger bounded witness before classifying the ticket as stale, contradictory, or blocked. Escalate only after bounded search aligned to the full invariant fails or reveals a true contract conflict.
- Treat generated production fixtures and compiled JSON assets as first-class owned fallout when the ticket changes the live compiled surface. Check whether authoritative verification writes or validates them, prefer isolated regeneration when unrelated fixture drift exists elsewhere in the repo, and record any intentional scoped substitution. When the change is a shared contract or identifier migration, explicitly check for downstream committed fixture consumers in other packages as well, such as runner bootstrap `*-game-def.json`, compiled production snapshots, or other checked-in generated runtime artifacts that may need regeneration before runtime verification is trustworthy.
- After any shared generator command, inspect every changed generated artifact and classify it as `owned` or `unrelated churn` before closeout. Keep owned fallout, rerun the affected checks, and revert unrelated churn so the final diff stays isolated to the ticket boundary.
- When a focused built-test rerun still hides the concrete assertion mismatch, inspect the compiled runtime object or generated artifact directly with the narrowest possible probe before patching tests or code.

## Escalation Ladder

1. Focused test or reproducer for touched behavior
2. Touched-package typecheck/build/lint
3. Required artifact regeneration for schema/contract changes
4. Ticket-explicit broader package or root commands

Escalate sooner for shared exported contracts or cross-package consumers.

## Failure Isolation

**Boundary determination**: Determine whether broader failures are inside the corrected ticket boundary or owned by another active ticket. Do not silently absorb out-of-boundary scope. Minimal downstream fixes for shared exported contract fallout are required scope. Document as residual risk if covered by another ticket; stop and resolve with the user if not.

**Mechanical-refactor fallout**: After removing local aliases or helpers, scan touched files for remaining references in type annotations, return types, overloads, test seams, and import lists before assuming a `typecheck` failure is broader fallout.

**Test helper staleness**: Inspect shared test helpers, fixtures, and goldens for stale assumptions. Check seed-specific helper states or turn-position fixtures. Retarget to a current seed/turn exercising the same invariant. Test malformed and unsupported shapes for clean fallback on new fast paths. Check callers constructing minimal contexts when a new fast path depends on enriched context objects. With `exactOptionalPropertyTypes`, model "field absent" by omitting the optional field rather than assigning `undefined`.

**Compiled-IR fixture drift**: For positive schema or contract tests covering compiled nodes, copy the shape from nearby live compiled examples, existing goldens, or current compiled fixtures rather than reconstructing from authored syntax or spec pseudocode.

**Identity-sensitive cache proofs**: When proving WeakMap or reference-keyed cache behavior, verify that helper fixtures preserve AST object identity. Avoid helpers that clone, retag, or normalize nodes when the assertion depends on repeated evaluation of the same object reference.

**Isolating `node --test` failures**: If only a top-level file failure appears, rerun narrowly with test-name filtering or direct helper reproduction. Run built test modules directly for nested subtest output. For compiler/schema tests, reproduce minimal compile input against the built module.

**Built-test reporter fallback**: When a focused built-file `node --test` invocation reports only a top-level failure without nested assertion details, rerun the built module directly or with a repo-approved verbose reporter so the failing subtest becomes visible before patching.

**Raw-vs-classified debugging**: Compare raw `legalMoves(...)`, classified `enumerateLegalMoves(...)`, and downstream agent preparation surfaces separately. For agent-driven regressions, inspect the preparation layer (e.g., `preparePlayableMoves(...)`) before assuming the bug belongs to legality or move enumeration.

**Fallback paths**: When a ticket changes a fallback compilation or runtime path, verify that path directly AND check the primary production path for non-regression.

## Export & Regression Guards

- If implementation adds a helper or type primarily for tests, check whether the module has export-surface guards. Prefer structural local typing or test-local seams over widening a curated public API.
- If a ticket includes a vague "no performance regression" clause without naming a benchmark, resolve with 1-3-1 or satisfy through the nearest existing regression suite.

## Schema & Artifact Regeneration

- If you changed runtime Zod/object schemas or shared contract shapes, regenerate schema artifacts before interpreting schema-test failures.
- Confirm producing commands have exited before diagnosing artifact contents. Confirm artifact paths match command write targets.
- Check freshness (timestamp or file size) before treating missing fields as real discrepancies.
- When touched source contributes to exported contracts or schema surfaces, expect generator-backed artifact checks even if the ticket didn't name a generated file.
- New lowered ref kinds or expression variants: assume `GameDef.schema.json` may drift even if edits are outside `schemas-core.ts`.
- Runtime schema shape changes: expect `Trace.schema.json` or other serialized artifacts to drift even if the ticket only named TypeScript or Zod surfaces.
- When a shared generator rewrites multiple artifacts, identify which encode the changed contract and summarize specifically.
- If regeneration leaves no persisted diff, state explicitly that the surface was checked and remained in sync.
- If an authoritative verification lane fails on schema sync or golden fallout, treat that failure as stronger evidence than a draft sibling's deferred ownership text. Absorb the minimum required artifact update, then rewrite sibling ownership to match.

## Standard Commands

These are the default broader verification lanes, not an automatic must-run set for every ticket. Ticket-named commands remain authoritative; when the live change boundary is narrower, run the strongest relevant subset and state what was intentionally not run.

```
pnpm turbo build
pnpm turbo test
pnpm turbo lint
pnpm turbo typecheck
pnpm turbo schema:artifacts
```

## Measured-Gate Outcome

For profiling/audit tickets, capture: measured surface, command(s), decisive result, threshold comparison, downstream action (archived/amended/deferred/not-actionable).

For benchmark tickets with a baseline or disabled/enabled comparison, include the concrete comparison fields in the same durable outcome: baseline value, current value, absolute delta, ratio or percent change, threshold, gate result, and command. A green benchmark lane is not enough if the ticket's useful decision depends on the magnitude of the difference.

If a benchmark or perf lane passes at the process/test-runner level but does not assert or print the ticket-owned metric, classify it as `harness smoke only`. Do not cite it as final measured acceptance proof until a repo-owned lane reports the metric, variance/quality bound when required, threshold, and pass/fail verdict.

If implementation is correct but the measured gate fails, the final durable state should make that split explicit: `owned migration landed`, `measured gate red`, `follow-up owner`, and `status` (`BLOCKED`, `PARTIAL`, or the repo's equivalent). Do not weaken the target or silently convert the failed gate into a completed ticket.
