# Verification

## Command Sanity Check (Reassessment-Time)

Sanity-check ticket-named verification commands against live repo tooling before relying on them later:

- Prefer catching stale runner assumptions early (for example, Jest-style flags in a Node test-runner package) so the focused proof lane is valid before implementation starts.
- Validate behavior, not just syntax: confirm default flag interactions, output paths, and artifact-write conditions when the ticket depends on a specific file or JSON field.
- For new helper modules that write artifacts through defaults, verify the real caller supplies or derives the ticket-owned output path. A helper-level unit test may pass while the production caller writes to a default directory tied to a fixture, entrypoint, or cwd. Use a real caller smoke and inspect `git status --short --ignored`, `find`, or equivalent to confirm the actual generated path before final proof.
- For tests or fixtures that spawn a package script and parse its output, verify the child process boundary early: package cwd, required build step, environment assumptions, machine-readable stdout, progress/errors on stderr, and exact JSON field oracle. If the fixture writes a sidecar artifact, confirm the path and ignore rule before final proof.
- For campaign runners or harnesses that support no-op, zero-seed, dry-run, setup-only, or metadata-only invocations, use them as intermediate wiring proof only. They can prove imports, cache hit/miss metadata, output paths, and JSON fields, but they do not replace ticket-named semantic/manual harness lanes unless the active ticket explicitly narrows acceptance.
- Determine whether each critical verification lane executes source files or compiled/generated outputs such as `dist`. If compiled/generated outputs are involved, identify the authoritative rebuild step before trusting runtime failures or green results.
- Check whether any likely verification commands contend on generated output trees such as `dist`, schema artifacts, compiled JSON, or goldens. If they do, plan those lanes as sequential-only before you start running checks.
- For lane wrappers that accept explicit file paths, inspect whether explicit-pattern mode preserves the normal lane semantics: per-file timeout, sequential execution, sharding, reporter, environment variables, and child-process boundaries. If explicit mode changes the budget or process boundary, classify the direct command as a focused substitute, wrap it with a bounded timeout when needed, and record the substitution before closeout.
- For root `pnpm turbo <task>` commands, verify that `<task>` is declared in the root `turbo.json` task graph before treating the lane as runnable. If the intended script exists only in a package `package.json`, use the package-filtered script form such as `pnpm -F <package> run <task>` and record the substitution before final proof.
- For Turbo or other cached package/workspace lanes, decide in advance how a cache replay will count. If the final command returns from cache after this session changed files, classify it as `cache-covered`, `cache-hit supplemental`, or `cache-hit proof pending`; load `references/verification-acceptance-proof.md` for the detailed cache-hit rules before citing it as acceptance proof.
- When a command is stale but the intended verification surface is clear, treat it as nonblocking drift and note the repo-valid substitution in working notes.
- For tracked tickets kept as historical records, prefer preserving the original command block and recording the repo-valid substitution in working notes and the ticket outcome unless the user explicitly asks for in-place cleanup.
- For active tracked tickets that are not yet archival records, correct nonblocking stale wording or path drift in place before marking the ticket complete so the active ticket remains a reliable session contract for later turns.
- For active untracked drafts, prefer correcting stale command examples in the ticket once the repo-valid replacement is confirmed, so future turns do not inherit the drift.

For tickets introducing a new non-JavaScript toolchain or target (for example Rust/WASM, native binaries, Python packages, or another compiler), run a compact prerequisite preflight before coding:

1. verify the compiler/package manager version command works
2. verify required target triples, SDKs, or plugins are installed
3. verify the intended build artifact path and whether it is ignored/generated
4. if an install/download is required, request approval through the normal sandbox/escalation path rather than deferring the missing prerequisite until final proof
5. record any toolchain command substitution or install prerequisite in working notes and the active ticket outcome when it affects reproducibility

For WASM/FFI, VM, or accelerator tickets that change ABI identity, route constants, or host/guest contracts, also load `references/wasm-ffi-abi.md`. Do this before coding when the draft clearly owns the boundary, or immediately after live evidence exposes an ABI mismatch. The reference's mirror sweep is required when changing versions, magic values, buffer headers, status codes, opcode/feature tables, or host/guest validation logic.

## Verification Preflight

Before running any substantive verification, do a verification preflight for each planned lane:

1. Confirm whether the command exercises source files, compiled artifacts, generated schemas, compiled JSON, or goldens.
2. Identify the authoritative rebuild/regeneration prerequisite, if any.
3. Record whether the lane is safe to overlap with other commands that touch the same outputs.
4. Decide what evidence level that lane can provide: focused proof, package-level proof, or full acceptance proof.
5. For shared-contract or migration tickets, explicitly label each lane as `intermediate green` or `acceptance-proof`; do not treat an intermediate package-local green lane as ticket completion if downstream repo-owned consumers remain unverified.

For accelerator routes, prove activation separately from correctness parity:

1. `activation`: show the accelerated path was actually selected, such as route count greater than zero, a nonzero WASM/VM execution counter, or a production smoke that would fail if only fallback ran.
2. `unsupported/fallback classification`: classify unsupported counts, fallback reasons, or fail-closed statuses so fallback success is not mistaken for route coverage.
3. `parity/correctness`: prove the activated route matches the authoritative reference path for the ticket-owned values, score rows, candidates, or serialized result.
4. `fallback non-masking`: when fallback remains allowed, include a witness or assertion that distinguishes activated success from fallback-only success.

Before running broader checks, identify whether any ticket-relevant commands clean or rewrite shared outputs such as `packages/*/dist`, generated schemas, compiled JSON, or goldens. If they do, run those lanes serially even when the surrounding Codex guidance favors parallel tool use.

For bugfix tickets, the red step can come from an existing failing proof lane. If the ticket already names a failing test or reproducer that cleanly proves the bug, rerun that lane first and treat it as the red proof unless the bug needs a narrower or more direct witness. If the repo already contains a nearby passing or semantically adjacent regression that exercises the same seam, prefer adapting that witness before authoring a brand-new fixture from scratch.

For newly authored tests, separate test-authoring setup failures from the intended product red witness. A TypeScript compile error, missing import, bad fixture helper type, or absent marker in the new test must be fixed before counting the behavioral red step. Record those setup failures separately when useful, then capture the first assertion/runtime failure that actually proves the ticket-owned bug or invariant gap.

For compiler, schema, and authored-data tests, preflight any ticket prose that says authors write a new field, YAML key, CNL property, or `GameSpecDoc` shape. Check the live authored type/schema/validator before building the fixture. If the shape is not accepted, classify it as either a stale authored example with an unchanged runtime invariant or a new authored contract deliverable that needs schema/type work and possibly `1-3-1`; do not count a TypeScript fixture compile error from that mismatch as the product red witness.

For new scripts that scan, validate, warm, provision, or summarize generated assets/build output, first classify the script as a `scanner/guard` or a `producer/warm/provisioner` before treating it as final proof.

For scanners/guards, run a compact scanner preflight:

1. `missing output`: run or inspect the script behavior when the expected generated directory or asset set is absent, and make sure the failure explains the missing producer step
2. `clean output`: run the scanner against current generated output after the authoritative producer completes
3. `false-positive sample`: inspect any matches from minified, bundled, or generated text before treating substrings as real violations
4. `deliberate violation`: inject the smallest temporary source or fixture violation, run the producer, then run the scanner and confirm the live emitted marker fails clearly
5. `exact restore`: revert the temporary source or fixture edit, verify it no longer appears in `git diff` / `git status --short`, rebuild clean output, and rerun the scanner or package build lane before closeout

For producer/warm/provisioner scripts over generated outputs, use a compact producer preflight instead:

1. `syntax/import surface`: run the cheapest syntax or direct invocation check that proves the script can load in the intended package context
2. `missing prerequisite`: when cheap and proportionate, inspect behavior when the expected generated output prerequisite is absent, and make sure the failure or guidance points at the authoritative producer step
3. `clean production`: run the authoritative build/regeneration step first, then run the producer/warm/provisioner script against clean generated output
4. `artifact inventory`: verify expected artifact names, counts, and representative sizes or hashes when those are part of the ticket contract
5. `downstream consumer`: after any later rebuild or clean of the generated tree, rerun the narrowest consumer proof that depends on the produced/warmed output before citing final acceptance

Do not require a deliberate violation fixture for producer/warm/provisioner scripts unless the ticket specifically owns fail-closed detection of bad generated content.

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
   - In this repo, `packages/engine/scripts/run-tests.mjs` may change execution mode when explicit patterns are provided. Confirm whether the requested lane still applies its timeout before treating a focused explicit-path command as equivalent to the manifest-driven lane; use an external `timeout` wrapper when the focused proof needs a hard wall-clock budget.
   - In this repo, runner/Vitest argument forwarding can be package-script dependent. Inspect the run summary before labeling a runner command as focused; if a command such as `pnpm -F @ludoforge/runner test -- <pattern>` unexpectedly runs the full runner suite, record it as full-package proof rather than focused proof.
7. **Long-running commands**: Some ticket-required commands may run for minutes with sparse output. Treat that as normal when consistent with repo history; keep running and provide periodic progress updates.
   - For known noisy lanes with huge TAP or per-test streams, keep the final evidence low-noise without weakening proof: prefer repo summary wrappers when available, set a bounded tool output size, or capture logs to a temporary file and inspect the final summary/tail. Still report the exact command, exit status, and final pass/fail count or summary in the active ticket outcome/final closeout. Do not hide product failures behind truncation; if the summary is missing or ambiguous, inspect the captured log or rerun a narrower lane before classifying the result.
   - For very verbose Turbo or workspace lanes, use an optional final-summary capture when the terminal output may truncate: send output to a temp log or tee-like capture, then inspect the final summary/tail and `rg` for ticket-owned test file names or package summaries. Cite the command exit status plus the extracted summary; keep direct focused reruns as the primary proof when they exercise the owned boundary more clearly than a broad log.
8. **Post-clean reruns**: If a later authoritative command cleans shared build output (e.g., `dist`), rerun earlier test lanes after rebuilding. Treat the first post-clean module-resolution failure as an ordering issue.
9. **Ticket-named Turbo rebuilds**: When a ticket-named broad Turbo lane internally rebuilds or cleans a shared output tree, the command may still be valid broad proof, but any earlier compiled-output tests that consumed that tree must be rerun afterward before closeout. If rerunning is disproportionate, substitute package-local serial lanes only when the ticket allows that substitution and the active ticket records it before final proof.
   - If the Turbo lane exits via cache replay, do not let the green process exit blur into acceptance. Record one of: `cache-covered` when the changed files are known cache inputs, `cache-hit supplemental` when direct/nocache lanes prove the owned boundary and the cached lane is only supporting evidence, or `cache-hit proof pending` when coverage is unknown. A ticket-named cached broad lane cannot be the sole final proof while still `cache-hit proof pending`.
10. **Sandbox child-process failures**: If a test wrapper, `node --test`, or package lane fails with environment-shaped child-process errors such as `spawnSync /bin/sh EPERM`, classify that first run as inconclusive unless a product assertion is visible. When the wrapper redirects stderr/stdout to a captured log and only prints a top-level `test failed`, inspect the captured log first, or run the compiled module directly when safe, so you can distinguish a hidden assertion from sandbox denial. Rerun the smallest failing lane with the required sandbox escalation or equivalent unsandboxed command, then rerun the ticket-named broad lane unsandboxed when that broad lane is final acceptance. Record the substitution and final classification in the active ticket outcome or final closeout.

## Build Ordering & Output Contention

Tests depending on `dist` require typecheck/rebuild first. Module-resolution errors during concurrent clean/rebuild are ordering failures — rerun after the serialized build.

Before running broader commands, check whether they share generated output trees, caches, or clean steps. Commands that clean, write `dist`, regenerate schemas, or depend on built test files must finish before another command touching the same tree starts.

Do not launch contending commands in the same parallel tool batch.

**In this repo**: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test`, `pnpm turbo build`, and `pnpm turbo typecheck` all contend on `packages/engine/dist` — run serially.

Ticket-named Turbo lanes can also contain unavoidable internal rebuilds through the task graph. Do not overlap an external compiled-output proof with those lanes; after the broad lane finishes, rerun any earlier `dist`-consuming proof you still intend to cite as final acceptance evidence.

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
- For golden or fixture witnesses where the historical seed reaches the right surface but lacks the ticket-owned values, use a compact value-bearing witness search before classifying the ticket as stale or blocked:
  1. bound the search by a small deterministic seed/turn/profile set and record the stop condition before launching it
  2. preserve the authoritative production entrypoint, profile wiring, replay harness, or in-memory overlay needed for the ticket seam
  3. record rejected witnesses with the reason they fail the proof noun, such as `right decision kind but no ready values` or `invocation only`
  4. freeze the discovered witness only after the required observable fields or values prove the claimed invariant
  5. capture the seed/source state, replay prefix or decision index, normalized excerpt shape, byte-identity oracle, and re-bless diagnostic in the ticket outcome or fixture provenance ledger
- When a ticket changes RNG consumption, retry branching, representative sampling order, or any other deterministic random-path behavior, immediately audit fixed-seed proof surfaces for intentional fallout: representative-seed helpers, exact completion-order assertions, exact success-count assertions, policy summary goldens, and other fixed-seed trace fixtures may need to be rewritten from old-path expectations to invariant-based proofs or refreshed golden outputs.
- For deterministic-RNG changes, prefer assertions on boundedness, determinism, witness elimination, and the intended chosen representative over preserving a formerly incidental random-path order unless the ticket explicitly owns that order as part of the contract.
- When a ticket names a simulator path, agent profile, campaign harness, replay harness, or other configuration-sensitive reproducer, preserve that authoritative setup in quick repro probes before classifying the witness as stale, fixed, or shifted. Do not treat a cheaper default-path probe as authoritative if profile wiring, RNG routing, or harness behavior can materially change the witness.
- When extending an existing script, profiler, or harness with a named case/profile/seed, audit the fixture source before the first final proof. Record whether the case uses production rules/data, a bootstrap fixture, a synthetic fixture, an overlay, or diagnostic-only data, and compare that source to the ticket's witness noun. If a script default silently points at a cheaper fixture while the ticket owns a production or profile-quality witness, correct the script or stop for 1-3-1 before citing the run.
- If an initial bounded witness proves only part of the target invariant, keep searching for a stronger bounded witness before classifying the ticket as stale, contradictory, or blocked. Escalate only after bounded search aligned to the full invariant fails or reveals a true contract conflict.
- Treat generated production fixtures and compiled JSON assets as first-class owned fallout when the ticket changes the live compiled surface. Check whether authoritative verification writes or validates them, prefer isolated regeneration when unrelated fixture drift exists elsewhere in the repo, and record any intentional scoped substitution. When the change is a shared contract or identifier migration, explicitly check for downstream committed fixture consumers in other packages as well, such as runner bootstrap `*-game-def.json`, compiled production snapshots, or other checked-in generated runtime artifacts that may need regeneration before runtime verification is trustworthy.
- After any shared generator command, inspect every changed generated artifact and classify it as `owned` or `unrelated churn` before closeout. Keep owned fallout, rerun the affected checks, and revert unrelated churn so the final diff stays isolated to the ticket boundary.
  - When a shared generator writes multiple artifacts but only some persist as diffs, make that explicit in the active ticket or final closeout. Use a compact ledger such as: `generator wrote: A, B, C`; `persisted diffs: A only`; `byte-identical after generator: B, C`; `semantic owner: <source contract>`. This prevents checked-but-unchanged generated surfaces from being mistaken for skipped deliverables.
  - For generated schema changes, prefer this compact closeout ledger when the generator touches or checks multiple schema artifacts: `generator command`, `written artifacts`, `persisted diffs`, `byte-identical artifacts`, `semantic source owner`, and `check command`. Use it especially when only one schema file persists as a diff or when a large diff is mostly canonical `$ref`, definition-name, or ordering churn.
  - If the canonical generator updates additional committed targets outside the ticket's named artifact list, do not automatically revert them as churn. Classify each spillover target as `owned fallout` when it serializes the active change, `stale canonical drift` when the generator is bringing an already-stale repo-owned artifact back in sync, or `unrelated churn` when it is neither caused by nor required for the active boundary. Keep `stale canonical drift` only when the generator's check mode proves the artifact is canonical and update the ticket touched-file/proof ledger so the diff is not unexplained.
  - When a recursive schema or other generated public-contract change causes broad `$ref`/definition reshuffling inside a single generated artifact, do not attempt line-by-line exhaustion as the primary proof. Summarize the semantic owner path in source, verify generator determinism with the repo's check mode, run the affected schema/build tests, and keep the artifact only if those checks prove the reshuffle is canonical owned fallout.
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

**Required compiled-field exact-shape fallout**: When a ticket adds a required compiled/runtime field, search for sibling fields and exact-shape assertions before relying on broad unit output alone. Mirror nearby field expectations intentionally, then rerun the likely compiler/schema exact-shape test files directly before escalating back to the broad package or workspace lane.

**Required compiler-guard diagnostic ordering**: When a ticket adds a required compiler diagnostic, fallback, or precondition, sweep nearby positive and negative compiler tests for earlier-diagnostic masking. Add only the minimal prerequisite data needed to keep each existing test aimed at its original invariant, then rerun the focused sibling test file or glob before treating the new diagnostic as complete.

**Identity-sensitive cache proofs**: When proving WeakMap or reference-keyed cache behavior, verify that helper fixtures preserve AST object identity. Avoid helpers that clone, retag, or normalize nodes when the assertion depends on repeated evaluation of the same object reference.

**Isolating `node --test` failures**: If only a top-level file failure appears, rerun narrowly with test-name filtering or direct helper reproduction. Run built test modules directly for nested subtest output. For compiler/schema tests, reproduce minimal compile input against the built module.

**Built-test reporter fallback**: When a focused built-file `node --test` invocation reports only a top-level failure without nested assertion details, rerun the built module directly or with a repo-approved verbose reporter so the failing subtest becomes visible before patching.

**Opaque Node test child failure**: If `node --test <compiled-test-file>` or a package wrapper reports only `test failed`, inspect any wrapper-captured log first when the lane redirected output, then run the compiled module directly with `node <compiled-test-file>` from the package cwd when safe. This often exposes nested assertion, cwd, or child-process errors hidden by the test-runner child boundary. If repo-root and package-cwd behavior differ, classify the cwd/process-boundary difference before patching code or tests.

**Sandbox EPERM child failure**: If the direct rerun or captured log exposes only `EPERM`, shell spawn denial, or another sandbox permission boundary, do not patch code against that signal. Escalate the same focused command or use the repo-approved unsandboxed proof, then rerun the exact ticket-named wrapper unsandboxed before closeout when that wrapper is final acceptance rather than only diagnostic.

**Raw-vs-classified debugging**: Compare raw `legalMoves(...)`, classified `enumerateLegalMoves(...)`, and downstream agent preparation surfaces separately. For agent-driven regressions, inspect the preparation layer (e.g., `preparePlayableMoves(...)`) before assuming the bug belongs to legality or move enumeration.

**Fallback paths**: When a ticket changes a fallback compilation or runtime path, verify that path directly AND check the primary production path for non-regression.

## Export & Regression Guards

- If implementation adds a helper or type primarily for tests, check whether the module has export-surface guards. Prefer structural local typing or test-local seams over widening a curated public API.
- If a ticket includes a vague "no performance regression" clause without naming a benchmark, resolve with 1-3-1 or satisfy through the nearest existing regression suite.

## Schema & Artifact Regeneration

- If you changed runtime Zod/object schemas or shared contract shapes, regenerate schema artifacts before interpreting schema-test failures.
- When kernel schema sources, generated GameDef/Trace contracts, exported trace/result shapes, or other generator-backed public contracts change, schedule the authoritative artifact-generation command plus the artifact-check command before broad package/root test lanes. Record both commands in the active ticket outcome or final closeout when generated diffs persist.
  - If the artifact checker reads built output such as `dist/`, treat broad build/test lanes that refresh that output as producers, not just verification. A typical stable sequence is: build the package/root lane, run artifact generation, run artifact check, run later broad lanes as needed, then rerun the narrow artifact check if any later lane rebuilt or cleaned the consumed output tree.
- Confirm producing commands have exited before diagnosing artifact contents. Confirm artifact paths match command write targets.
- Check freshness (timestamp or file size) before treating missing fields as real discrepancies.
- When touched source contributes to exported contracts or schema surfaces, expect generator-backed artifact checks even if the ticket didn't name a generated file.
- New lowered ref kinds or expression variants: assume `GameDef.schema.json` may drift even if edits are outside `schemas-core.ts`.
- Runtime schema shape changes: expect `Trace.schema.json` or other serialized artifacts to drift even if the ticket only named TypeScript or Zod surfaces.
- When a shared generator rewrites multiple artifacts, identify which encode the changed contract and summarize specifically.
- If a generator-backed JSON schema diff is large because anonymous definition names, `$ref` targets, or definition ordering churned, do not hand-edit the generated artifact to minimize the diff. Classify it as `generator-produced expected artifact churn` only after the authoritative generator and artifact-check lane pass, and name which changed artifact actually encodes the ticket-owned contract.
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
