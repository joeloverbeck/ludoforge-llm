# Gathering Phases (1-3)

## Phase 1: GATHER — Build the Exercised Module Set

Starting from the test file(s), build a dependency graph of engine source modules.

**Short-circuit for integration/simulation tests**: If the test calls a top-level simulation step function (e.g., `runSim()`, `resolveAction()`, `advanceTurn()`, or equivalent) in a loop or sequence, treat the whole resolution pipeline and its registered handlers as exercised. Skip per-import tracing and enumerate all `.ts` files in the relevant `packages/engine/src/` subdirectories directly, excluding barrel/index files that only re-export.

**Otherwise, trace per-import**:

1. If the input is a directory, collect all `.ts` test files in it. If a single file, use that file.
2. Read the test file(s) and extract all `import` statements targeting `packages/engine/src/**`.
3. For each imported engine module, read it and extract ITS imports. Barrel/index re-export files count as zero depth — trace through to the actual defining module.
4. Continue following imports until the exercised set stabilizes (no new modules added in a pass) or after 10 iterations, whichever comes first. This is a fixed-point closure with cycle detection.
5. Produce a deduplicated list of all engine source files exercised by the test suite.
6. Read `docs/FOUNDATIONS.md` — hold it for Phase 6 validation. Do NOT apply it yet.
7. Read any `prior_reports` if provided — note already-identified issues to avoid rediscovery. Produce a numbered exclusion list of known findings with one-line summaries. Include this list verbatim in all sub-agent prompts for Phase 4. **Reject any prior report whose path starts with `archive/`.**
8. Check for existing coverage/trace artifacts (e.g., `coverage/`, `.nyc_output/`, `*.trace.json`). Use them if present; skip if none found.
9. Run bounded git history: `git log --since="6 months ago" --name-only --pretty=format:"COMMIT:%H" -- <exercised-file-paths>` to identify temporal coupling. Parse the output to identify **commit clusters** — sets of 3+ exercised files that appear together in 2+ commits. Filter to only commits touching 2+ of the exercised files, then count pairwise co-occurrences. Report the top 5 most frequent clusters. For >30 exercised files, delegate git parsing to a separate sub-agent.

**Sub-agent delegation**: For large test suites (>20 direct imports or barrel re-exports), delegate import tracing to 1-3 parallel Explore sub-agents. Each agent traces a subset of the import tree. Merge their deduplicated file lists (take the union). If agents report conflicting facts about the same file, re-read directly to resolve.

## Phase 2: SCENARIO MAP — Cluster Tests into Behavioral Families

Treat tests as behavioral scenarios, not just import sources.

For each test or test family (a `describe` block or test file), recover:

- **What behavior** is being exercised (e.g., "free action continuation after grant expires")
- **Which fixture/setup path** it uses (e.g., `makeIsolatedInitialState` with specific overrides)
- **Which assertions** define success/failure
- **Which domain concepts** appear in names, helpers, and expected values

Then cluster tests into **scenario families** — named behavioral groups. Example shapes:

- "free action continuation"
- "grant lifecycle management"
- "turn interruption and resumption"
- "ownership transfer"
- "decision resolution and override"
- "capability cost enforcement"

**Scaling guide**: <10 tests -> 2-5 families; 10-30 -> 4-8; 30-50 -> 5-10; 50-100 -> 5-12. Each family should map to a distinct domain protocol or lifecycle. When in doubt, keep families separate. Property-based test suites that parameterize the same assertion across seeds may produce fewer families — this is expected.

Every later finding must be tied back to scenario families. A finding not grounded in test behavior is speculation.

Canary, integration, and performance benchmark tests may produce only 1-3 scenario families. This is expected.

**Sub-agent delegation**: For large test directories (>30 test files), delegate scenario extraction to 2-3 parallel Explore sub-agents, each handling a subset. Merge and deduplicate scenario families.

## Phase 3: TRACE — Build Test-to-Code Traceability

Build traceability using multiple strategies:

| Strategy | What it finds | Confidence |
|----------|--------------|------------|
| Import statements | Direct dependencies | High |
| Static call graph (assertions back to production) | Functions actually exercised | High |
| Naming/lexical similarity (test helpers vs production) | Conceptual links | Medium |
| Temporal coupling from git history (files that co-change) | Hidden dependencies | Medium |

Each traceability link gets a confidence tag (high/medium/low) and a brief reason code.

**Collapse rule**: Phase 3 often collapses into Phase 1 when import analysis + temporal coupling achieve high confidence for all exercised modules. When this happens, note "Phase 3 satisfied by Phase 1 outputs" in the Traceability Summary. Only launch a dedicated Phase 3 agent when Phase 1 reveals registry/dispatch indirection or barrel-heavy import trees where static imports undercount actual dependencies.
