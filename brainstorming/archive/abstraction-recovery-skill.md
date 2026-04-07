# Name

recover-architectural-abstractions

test-to-architecture-recovery is also a good name. I would not name it detect-missing-abstractions-v2, because that hides the fact that this is a different layer.

# Purpose

Given a complex test file or test directory, recover the as-built architecture of the exercised area and propose higher-order abstractions that would make the architecture cleaner, more robust, and more extensible.

Those higher-order abstractions must name:

- the owned truth
- the invariants
- the interaction protocol
- the rightful owner boundary

The skill should not just say “extract a helper” or “make an interface.”

Inputs

The skill should accept:

1. test_path — file or directory.
2. source_roots — optional override; otherwise auto-detect.
3. docs_paths — optional architecture docs / FOUNDATIONS docs.
4. use_git_history — default true.
5. use_existing_artifacts — default true.
6. allow_execution — default false.
7. Static-first. Use existing coverage/traces/profiling if present. Only execute anything if explicitly permitted.
8. prior_reports — optional paths to earlier missing-abstractions, golden-gap, or similar reports.

# Outputs

The skill should emit:

1. A markdown report:
reports/architectural-abstractions-<date>-<context>.md
2. A machine-readable companion:
reports/architectural-abstractions-<date>-<context>.json

The JSON should contain the scenario map, concept graph, candidate abstractions, and evidence links so lower-level skills can consume it later.

# Core workflow

This should be the workflow.

## Phase 0: Gather evidence, but do not start moralizing yet

Read the tests, source roots, docs, prior reports, existing coverage/tracing/profiling artifacts, and a bounded amount of git history. Do not apply FOUNDATIONS or architecture principles first. Recover the structure first; judge it second.

## Phase 1: Build a scenario map from the tests

Treat tests as scenarios, not just files.

For each test or test family, recover:

- what behavior is being exercised
- which fixture/setup path it uses
- which assertions define success/failure
- which domain concepts appear in names, helpers, and expected values

Then cluster tests into scenario families.
Example shapes:

- “free action continuation”
- “trade acquisition”
- “belief update after observation”
- “turn interruption and resumption”
- “ownership transfer”

Every later architectural inference should be tied back to scenario families.

## Phase 2: Recover test-to-code traceability with multiple strategies

Do not rely on one strategy.

The traceability pass should fuse:

- imports / use statements
- static call graph
- data flow from final asserts
- naming and lexical similarity
- registry / dispatch / schedule membership
- builder/factory/helper indirection
- existing coverage / traces if present
- temporal coupling between test files and production files

Each link should get a confidence score and a reason code.

This part should be deliberately multi-strategy. Test-to-code traceability work already uses naming, conventions, static call graphs, assert-adjacent behavior, lexical evidence, and other mixed strategies; there is no single magic link-recovery trick.

## Phase 3: Extract architecture views

The skill should build at least five views.

1. Structural view
Packages/crates, modules, imports, call edges, schedule/registry edges.
2. State and authority view
State carriers and who creates, mutates, reads, invalidates, destroys, or projects them.
3. Protocol and lifecycle view
Commands, events, messages, state transitions, and legal ordering constraints.
4. Change/history view
Hotspots, temporal coupling, cross-boundary co-change, and test–production co-change.
5. Domain/lexical view
Concept names from tests, identifiers, docs, comments, type names, and exported symbols.

This is the right level because architecture recovery is normally done by extracting views, fusing them, reconstructing abstractions, and then analyzing the result. Modern recovery work improves when it fuses dependencies with textual and structural evidence, and hidden dependencies often live in change history rather than in static imports alone.

## Phase 4: Fuse the views into a concept graph

Build a unified graph that links:

- scenario families
- tests
- modules/files
- types/components/resources
- events/commands
- state carriers
- invariants
- temporal-coupling edges

Then cluster on shared truth and shared protocol, not just shared names.

This is where the higher-level abstraction starts to emerge.

## Phase 5: Detect architectural fractures

The skill should look for these fracture types.

1. Split protocol
The legal sequence of interactions is spread across multiple modules/layers.
2. Authority leak
Multiple modules/layers write the same truth.
3. Projection drift
Derived summaries/caches are recomputed everywhere, or no one owns them.
4. Boundary inversion
Higher layers own rules that belong in lower layers.
5. Concept fracture / aliasing
The same domain concept exists under different names/types in neighboring subsystems.
6. Hidden seam
Files across nominal boundaries repeatedly change together.
7. Overloaded abstraction
One type/module carries several lifecycle roles that should be separated.
8. Orphan compatibility layer
A shim or fallback path exists only to mask a deeper missing abstraction.

A fracture should not be reported unless it is supported by at least two views.

## Phase 6: Synthesize candidate architectural abstractions

For each real fracture, produce a candidate abstraction.

Each candidate must declare:

- title
- kind
- scope
- owned_truth
- invariants
- protocol_or_transition_surface
- rightful_owner
- producers
- consumers
- writers
- modules_absorbed_or_constrained
- tests_explained
- expected_boundary_simplification
- migration_sequence
- confidence
- counter_evidence

The kind should be one of a small explicit set, for example:

- Protocol
- Authority boundary
- Bounded context
- Projection owner
- Capability / claim / grant ledger
- Workflow coordinator
- Translation boundary
- Commitment record / lifecycle carrier

In your repos, the outputs will often look like a turn-continuation protocol, a temporary capability ledger, an ownership-transfer protocol, a belief/perception frontier, or a projection owner—not a classic design pattern.

## Phase 7: Validate and rank the candidates

A candidate should survive only if it meets all of these:

1. It explains at least two tests or one whole scenario family.
2. It reduces at least one real architectural cost:
- fewer writers
- fewer repeated predicates
- fewer cross-boundary transitions
- fewer co-change edges
- clearer ownership
3. It can name the owned truth.
4. It can name the rightful owner boundary.
5. It does not merely wrap existing code with a façade.

Then, and only then, apply FOUNDATIONS / architecture principles as an evaluation layer.

That ordering matters. Recovery first, judgement second.

## Phase 8: Report

The markdown report should contain:

1. Executive summary
2. Scenario families
3. Recovered architecture views
4. Fracture summary table
5. Candidate abstractions
6. Proposal details
7. Acceptable existing architecture
8. Counter-evidence and open questions
9. Sequencing / migration order
10. Proposal format

Each proposal should contain:

- Claim
- Evidence
- Why current architecture is split
- Candidate abstraction
- Owned truth
- Invariants
- Protocol / lifecycle
- Owner package/crate
- Modules replaced or constrained
- Expected simplification
- Priority
- Confidence
- Counter-evidence
- Hard rules

The new skill should obey these rules.

1. No pattern theater.
Never recommend a pattern name unless it corresponds to owned truth and a real boundary.
2. No abstraction without authority.
If the proposal cannot say who owns the truth, it is not ready.
3. No wrapper-only recommendations.
“Create a helper/service/interface” is not good enough unless it relocates invariant ownership.
4. Static first.
Use existing artifacts before running anything.
5. Do not invent problems.
“Acceptable complexity” must remain a valid outcome.
6. Every finding needs counter-evidence.
The report should say what would falsify the hypothesis.
7. Integrate with the current skills; do not replace them.
This skill should sit above detect-missing-abstractions, not replace it.

# Where it should sit in the workflow

The best workflow is:

1. run the new architecture-recovery skill on a complex suite
2. identify the candidate higher-order abstractions
3. run the lower-level missing-abstractions skill on the most promising candidate areas
4. draft specs from the combined output