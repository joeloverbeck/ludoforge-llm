# Verification Evidence States

When verification is partially blocked by environment behavior, flaky wrappers, or shell/session desynchronization, report the strongest honest evidence state instead of overstating the result:

1. `focused proof green`: the narrow reproducer or owned acceptance witness is green
2. `package lane green`: the relevant build/typecheck/test package lane is green with a confirmed exit code
3. `full acceptance green`: the complete ticket-owned verification set is green with confirmed exit codes
4. `partial clean evidence only`: logs or partial output show a clean run through a meaningful checkpoint, but the final exit code or tail segment is unconfirmed

If you cannot reach `full acceptance green`, state exactly:
- which lanes are confirmed green
- which lane or exit code remains unconfirmed
- whether the remaining gap is a code failure, an environment/tooling failure, or merely missing proof capture

For long-running suites or flaky terminal sessions, prefer capturing authoritative evidence early:
- use a stable log-capture wrapper from the start when feasible
- preserve the exact command and the intended acceptance scope
- if the environment still drops the final status, split the suite into smaller deterministic lanes rather than making an unqualified green claim
- For campaign, tournament, or trace-inspection tickets, prefer the smallest bounded seed/run window that reaches the claimed scenario or reproducer before escalating to larger harness runs. If the first bounded run misses the target behavior, widen only enough to reach the intended trace slice.
- When a ticket names a high-level reproducer but the setup proves too coupled or noisy, prefer the narrowest valid proof surface that still exercises the owned invariant: first the authority/helper that owns the behavior, then a production-data integration slice, then the broader end-to-end flow only if needed.
- For shared contract or object-shape migrations, verify both sides of the boundary deliberately: the live runtime shape you intended to change, and any serialized/golden/fixture surface you intended to preserve. Do not assume one implies the other.
- When one ticket-owned acceptance lane is known to be long-running but independent of other verification surfaces, it is acceptable to overlap that wait with non-contentious workspace checks such as downstream typecheck or unrelated package-local proof lanes, as long as the final closeout still waits for the long lane's result before claiming completion.

## Trace-Heavy Ticket Evidence

Use this when the ticket's acceptance depends on saved traces, decision-gap inspection, harness summaries, or campaign metrics:

1. Confirm which command writes the authoritative trace/report artifact and where it lands.
2. Confirm whether the existing artifact exposes the literal acceptance field or only an adjacent proxy.
3. Inspect one saved artifact directly before broad reruns so you know what the surface can and cannot prove.
4. Classify evidence gathered during verification as:
   - `direct`: the artifact shows the exact invariant the ticket names
   - `indirect`: the artifact proves the change through compiled structure, goldens, score gaps, or adjacent observable behavior
   - `insufficient`: the artifact does not expose enough to support the claim
5. If evidence remains `indirect`, state that explicitly in working notes and closeout instead of overstating certainty.

## Generated Artifact Isolation Checklist

Use this after commands that regenerate fixtures, bootstrap JSON, schema artifacts, or golden files:

1. Run the narrowest authoritative generator for the owned surface.
2. Inspect every regenerated file, not just the one the ticket named.
3. For shared contract or identifier migrations, check whether another package consumes the regenerated surface through committed fixture artifacts rather than live source compilation.
4. Classify each regenerated artifact as `owned`, `already-owned sibling fallout`, or `unrelated churn`.
5. For owned metadata or summary artifacts, verify semantic ordering as well as freshness when the generated output exposes user-facing ordered lists such as factions, phases, seats, or action summaries.
6. Keep only the owned artifacts required to make the ticket true in live runtime.
7. Revert unrelated churn before final closeout.
8. Rerun the narrowest affected proof lane after artifact triage so the kept generated files are validated.
