# Draft Handling

When the active ticket or referenced artifacts are untracked drafts:

1. Confirm draft/untracked state explicitly, including siblings and referenced specs.
2. Treat the active draft ticket as the session contract once reassessment is complete.
3. Classify stale draft wording separately from true boundary errors in working notes and final closeout.
4. Prefer correcting the active draft ticket over broad sibling/spec cleanup unless the live boundary truly requires wider edits.
5. When live evidence proves a draft example snippet, helper sketch, or command block is semantically wrong but the owned boundary is still correct, update the active draft ticket so future turns do not inherit the stale example.
   - Timing: apply these nonblocking draft-ticket corrections either immediately after reassessment or during final closeout, but do not mark the ticket complete while the stale draft text remains.
   - Preference: if the stale draft text could mislead the implementation itself (for example wrong type mutability, wrong owned file, wrong command shape, or wrong acceptance semantics), correct the active draft ticket before code edits. If it only affects future readability or closeout accuracy, correcting it during final closeout is acceptable.
   - Acceptance-text rule: rewrite the active draft ticket before completion when the stale wording changes the meaning of an acceptance criterion, invariant, owned file list, or verification expectation a later turn could reasonably follow literally. A closeout-only semantic correction is sufficient only when the live boundary stayed correct and the stale text is clearly documented in the outcome without leaving the ticket's forward-looking contract misleading.
6. Prefer minimal sibling edits until live verification or authoritative evidence proves ownership drift. If live verification forces absorbed fallout, update the active ticket outcome first, then narrow or rewrite only the directly affected siblings.
7. If a draft ticket's acceptance text or test description asserts the wrong value shape, output contract, or semantic expectation, distinguish that from a wrong implementation boundary. Wrong semantic expectations may still require a stop-and-confirm if satisfying the literal text would violate the live contract or `AGENTS.md` ticket fidelity.
8. When an active untracked draft ticket completes, update it before closeout so it reflects the final status, actual touched-file scope, and repo-valid verification commands that ran. Do not leave a completed draft with stale forward-looking acceptance text or stale command examples.

## Draft Drift Preflight

When the active ticket is an untracked draft, or when a tracked ticket appears stale, run this quick preflight before coding:

1. Confirm ticket-named file paths still exist before opening them blindly.
2. Confirm ticket-named commands still match the live repo tooling and output paths.
3. Check example snippets for semantic drift that would mislead implementation (for example `readonly` vs mutable fields, stale return shapes, or wrong helper names).
4. Check sibling draft ownership only far enough to confirm the current ticket has not already been absorbed, contradicted, or split differently.
