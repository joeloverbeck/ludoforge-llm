---
name: implement-spec-tickets
description: "Run the Ludoforge spec-ticket implementation loop for a spec: select active same-family tickets, invoke implement-ticket with the originating spec as authority, review/archive completed tickets with post-ticket-review, surface evidence-backed skill-audit hardening proposals when child workflows expose them, persist resume state, archive the originating spec when all owned tickets are done, and optionally create/push a final branch."
---

# Implement Spec Tickets

Use this skill when the user wants the full Ludoforge spec-family loop handled across multiple tickets without repeatedly invoking child skills by hand.

This is an orchestration skill. Do not reimplement `.codex/skills/implement-ticket`, `.codex/skills/post-ticket-review`, or `.codex/skills/skill-audit`; load and obey those skills at each phase, and let their narrower guardrails control their owned work.

In Codex, "invoke" a child skill by loading the live child `SKILL.md`, executing its required reads and workflow checklist in the current session, and emitting this harness's required marker/block. There is no separate slash-command subprocess; do not claim the child workflow ran unless its live checklist was actually used.

The default unit of execution is one ticket iteration: implement, review/archive when complete, commit, persist state, and hand off the next target. The full loop is resumable across invocations. Continue into another ticket in the same invocation only when the next target is an immediate follow-up or explicit direct dependent, the continuation is still the same seam, context remains small enough to preserve proof accuracy, and the worktree/state file are clean enough to avoid ambiguity.

Prefer a fresh context boundary between unrelated ticket iterations. After each iteration commit, persist state, print a compact handoff, and stop for `/new` or context compaction unless the continuation test above is satisfied.

## Child Skill Audit Override

This harness intentionally narrows `skill-audit` output when auditing child workflow skills during an implementation loop. Use the live `skill-audit` criteria to identify evidence-backed issues, improvements, and features, but emit the compact child-audit block required below instead of the full report template.

This harness does not grant implicit authorization to patch child skills. When a child-audit suggestion is specific, evidence-backed, and compatible with `AGENTS.md`, `docs/FOUNDATIONS.md`, and Ludoforge's local ticket workflow, propose the skill update in the compact child-audit block and wait for explicit user confirmation before editing any skill or rules file. A standalone `$skill-audit` request remains report-only unless the user separately asks to implement suggestions.

For any nonzero child-audit finding count, include enough evidence in the compact block to justify each proposed, rejected, or deferred decision. Do not collapse nonzero findings into unexplained counts.

For a zero-finding child audit, the `Evidence basis` line must still name at least two concrete exercised surfaces that were checked, such as boundary reset handling, archival/reference repair, proof invalidation, ticket graph updates, state persistence, or terminal-status gating. Do not emit a bare "no findings" audit without saying which parts of the child workflow were actually exercised.

## Required Reads

Before the first loop iteration, read:

- `AGENTS.md`
- `docs/FOUNDATIONS.md`
- `docs/archival-workflow.md`
- `tickets/README.md`
- `tickets/_TEMPLATE.md`
- `.codex/skills/implement-ticket/SKILL.md`
- `.codex/skills/post-ticket-review/SKILL.md`
- `.codex/skills/skill-audit/SKILL.md`
- the resolved originating spec

When a phase invokes a child skill, read any focused references that child skill requires. This harness is not a substitute for child-skill required reads.

## State File

Use `.codex/run-state/implement-spec-tickets.json` as the resume record. Create `.codex/run-state/` if needed.

Keep the file small and machine-readable. Update it after intake, after every iteration commit or no-commit checkpoint, after blockers, and after final spec archival. Use this shape unless a field is genuinely not applicable:

```json
{
  "originating_spec": "specs/181-example.md",
  "archived_spec": null,
  "last_ticket": "tickets/181EXAMPLE-001.md",
  "last_result": "completed_archived",
  "last_work_commit": "0123456789abcdef0123456789abcdef01234567",
  "last_state_commit": "self",
  "next_target": "tickets/181EXAMPLE-002.md",
  "queue": [
    "tickets/181EXAMPLE-002.md"
  ],
  "phase": "ready_for_next_ticket",
  "in_progress_ticket": null,
  "owned_dirty_summary": null,
  "blocked": false,
  "blocker": null,
  "dirty_state": "clean",
  "updated_at": "YYYY-MM-DD"
}
```

`dirty_state` must describe the final live worktree state, not only owned harness paths. Use compact strings when a structured field is unnecessary:

- `"clean"` only when `git status --short` has no entries.
- `"unrelated_untracked: reports/example.md"` when only unrelated untracked paths remain and they are intentionally left untouched.
- `"unrelated_dirty: <paths>"` when unrelated tracked modifications, unrelated untracked paths, or both remain and they are intentionally left untouched.
- `"owned_dirty: <paths>"` when owned paths remain dirty for a no-commit or blocked handoff.
- `"mixed_dirty: owned=<paths>; unrelated=<paths>"` when both owned and unrelated paths remain.

Use stable `last_result` values where possible so later resumes can distinguish implementation, retarget, and state-only handoffs. Current vocabulary:

- `"completed_archived"` or `"implemented_archived"` when the ticket reached terminal status and was archived.
- `"implemented_not_archived"` when implementation completed but review/archive did not run.
- `"retargeted_to_prerequisite"` when the iteration only inserted or selected a prerequisite before returning to the original target.
- `"blocked"` when no next owner exists or the current target remains blocked by an unresolved owner.
- `"state_only"` when only the state file was refreshed and no work commit represents a new ticket/spec decision.
- `"final_spec_archived"` when the originating spec was archived.

On resume, read this file first, then verify it against live repo state before invoking a child skill:

- `originating_spec` still exists unless `archived_spec` is set
- `next_target` exists and is active unless the next action is final spec archival or blocked exit
- queued ticket paths still exist and still belong to the originating spec family
- `last_work_commit` is either a full reachable commit SHA or `"none"`; `"self"` is not valid for `last_work_commit`
- `last_state_commit` is a full reachable commit SHA, the same SHA as `last_work_commit`, `"self"`, or `"none"`
- `phase`, `in_progress_ticket`, and `owned_dirty_summary` match the live ticket and worktree when present
- `git status --short` matches or safely supersedes `dirty_state`

If state conflicts with the live repo, trust the live repo and refresh the state file before continuing. If substantial owned dirty work exists for the target, inspect the diff and infer the next unfinished phase instead of restarting the ticket from the top.

If an in-flight proof command or terminal session may still be running after interruption or compaction, poll or classify it before rerunning proof, editing closeout, committing, or finalizing. If the old session is unobservable, mark it unverified and rerun the lane before citing it.

If resuming after compaction, interruption, or a long handoff near proof, closeout, commit, or final response time, reread `### 5. Commit The Iteration` before committing or finalizing. Emit the required visible blocks or an explicit `late harness recovery checkpoint` before any commit/final response: child audit blocks, `Acceptance-to-command map`, `Post-ticket review` block, generated-artifact provenance when triggered, state-file validation when changed, `Required-visible-block checkpoint`, and full `Harness handoff` readiness. A recovered checkpoint can repair conversation visibility, but it is not a substitute for an unrun or unobservable child workflow.

Compact required-block ledger for recovered or late-stage iterations. Copy this order into the visible conversation as each surface becomes applicable; do not wait until after archive or commit to reconstruct it:

1. `Child skill audit:` for `.codex/skills/implement-ticket`, or `not_applicable` with the allowed retarget-only reason.
2. `Acceptance-to-command map:` before invoking review/archive for a terminal ticket.
3. `post-ticket-review child workflow:` before archive eligibility is trusted.
4. `Pre-archive gate:` immediately before any archive move.
5. `Post-ticket review:` after review/archive or manual late recovery.
6. `post-ticket-review` audit classification: compact child audit block when triggered, or `not_applicable: routine archive/reference repair`.
7. Generated-artifact provenance when triggered, otherwise a reasoned `not_applicable`.
8. Source-size ledger when triggered by `implement-ticket`, otherwise a reasoned `not_applicable`.
9. Abandoned-probe cleanup proof when a retarget restores exploratory source/test/schema edits or when a proof/process probe is abandoned, superseded, interrupted, or replaced after hang triage. For proof/process probes, name the command or session, termination or no-lingering-process proof, replacement proof lane, and whether any files were restored or retained. Otherwise emit a reasoned `not_applicable`.
10. Baseline worktree lifecycle when temporary worktrees or alternate checkouts were used for proof classification, otherwise a reasoned `not_applicable`.
11. State-file validation when `.codex/run-state/implement-spec-tickets.json` changed.
12. `Required-visible-block checkpoint:` immediately before commit or no-commit finalization.
13. `Harness handoff:` before final response.

Retarget-only visibility profile: when an iteration only inserts/selects a prerequisite and does not reach terminal ticket status, do not force terminal-ticket review blocks into misleading prose. Emit `Acceptance-to-command map: not_applicable: retarget-only prerequisite insertion`, `Post-ticket review: not_applicable: retarget-only prerequisite insertion`, and `post-ticket-review audit classification: not_applicable: no review/archive surface exercised`. Preserve the state/proof/handoff requirements, and when an exploratory probe was restored include an explicit `Abandoned-probe cleanup proof:` block naming the abandoned probe, restored/removed paths, and cleanup proof.

The helper `node .codex/skills/implement-spec-tickets/scripts/handoff-preflight.mjs` prints the checkpoint/handoff scaffold and performs lightweight state/path checks. Run it before every archive move, iteration commit, state-only commit, no-commit finalization, and final response after a context transition. It is a mandatory preflight for visibility and state/path sanity, but it does not replace child workflows, proof lanes, or the required visible blocks; fill in or emit the scaffold rows truthfully before taking the gated action.

## Intake

1. Resolve `spec_path` to exactly one live file under `specs/`. If it is missing, ambiguous, or already archived, stop and ask for the exact active spec path.
2. Snapshot the worktree with `git status --short`.
3. Classify pre-existing dirty and staged paths before doing work:
   - active spec/ticket-family state for this run
   - user or concurrent-session work that must not be absorbed silently
   - unrelated noise
4. If staged unrelated entries exist, either leave them staged and do not commit, or unstage them only with explicit user approval while preserving working-tree content.
5. If `.codex/run-state/implement-spec-tickets.json` already exists, validate it even on a first invocation. Trust live repo state over stale JSON.
6. If unrelated dirty paths exist and this harness would need to commit, classify whether they can be safely excluded. Proceed without asking only when every unrelated path is unstaged, can remain unstaged, and has been explicitly recorded as out of scope for the harness commit. Stop and ask whether unrelated paths should be included only when ownership is ambiguous, an unrelated path is already staged, exclusion is not possible, or the user explicitly asks for a whole-worktree commit. Do not silently commit unrelated work.
   - Do not delete, move, rewrite, or "clean up" unrelated untracked reports, generated artifacts, byproducts, or user files discovered during proof or status checks unless the user explicitly approves that destructive cleanup. Leaving them unstaged is the default.
7. Resolve the first ticket:
   - if `ticket_path` is supplied, resolve it to exactly one active file under `tickets/`
   - otherwise inspect active `tickets/*.md` and choose the first ticket in lexical order whose filename, `Deps`, problem statement, or explicit spec reference ties it to the originating spec
8. Build the queue from active same-family tickets. Parse `**Deps**` and order active prerequisites before dependents, treating archived/completed dependencies as satisfied and using lexical order within each ready set. If dependencies form a cycle or name an unresolved active prerequisite, stop and report the dependency problem.
9. If the supplied first ticket has unsatisfied active same-family prerequisites, retarget to the first prerequisite, refresh state, and state the retarget before invoking `implement-ticket`.
10. Decide how to handle pre-existing untracked same-family ticket/spec files before implementation. Include them only when they are required for the current queue, dependency story, or truthful handoff; otherwise leave them uncommitted or split them into a separate explicitly named intake/state commit.
11. Write or refresh the state file with the resolved spec, target, queue, dirty-state classification, and `blocked: false`.

## Loop

Repeat conceptually until there is no active same-family ticket left and no newly created follow-up takes priority. In a single Codex invocation, normally run one ticket iteration and stop after the harness handoff unless the continuation policy above is satisfied.

### 1. Implement Target Ticket

Invoke the implementation phase as if the user had said:

```text
$implement-ticket <ticket> . Rely on <originating-spec>
```

Use the live `implement-ticket` skill exactly. It owns reassessment, implementation, proof, closeout wording, terminal-status decisions, and any follow-up ticket needed for honest closeout.

If any user-approved `1-3-1`, `docs/FOUNDATIONS.md` reassessment, or other explicit boundary reset changes the active ticket's deliverable, proof lane, dependency story, or ownership boundary, patch the affected active ticket/spec/sibling artifacts before source or test edits resume. Then re-emit a compact working checkpoint that names the approved option, invalidated proof lanes, replacement proof plan, and next terminal-status boundary. This applies whether or not the ticket entered a durable blocked state.

If a user-approved `1-3-1` resolves only a process gate, such as a source-size deferral, commit-shape choice, or proof sequencing decision, and does not change the ticket's behavior, deliverables, acceptance criteria, proof lanes, dependency story, or ownership boundary, record that narrower authorization in the active ticket outcome or state/checkpoint and continue under the existing ticket boundary. Do not force a broad boundary-reset rewrite or rerun proof solely because of the process approval. Still rerun proof when the approval leads to code, acceptance wording, or proof-story edits that invalidate earlier evidence.

If a red proof lane or repo invariant exposes a contradiction between the active ticket/spec wording and `docs/FOUNDATIONS.md`, `AGENTS.md`, or a current repo policy test, stop before proposing implementation choices as neutral alternatives. Present the problem with three options already ranked by Foundations/repo-rule alignment, explicitly reject or demote any option that would weaken the rule, recommend the compliant option, and wait for user confirmation before patching the boundary or resuming implementation. After confirmation, record the approved option in the affected active ticket/spec/sibling artifacts and rerun the affected proof lanes before terminal status or archival.

If a broad proof lane is still alive but produces no output long enough that the result may be unobservable, treat it as hang triage instead of waiting indefinitely. Poll and record the command/session, owning process when visible, last emitted test/file/output, elapsed runtime, and no-output interval. If there is no prior approval to interrupt the lane, stop for `1-3-1` before killing or replacing it. If interruption was approved or preauthorized, stop the lane, rerun the suspected next file or smallest owned proof surface with an explicit timeout, and classify the outcome as active-ticket-owned failure, prerequisite/follow-up, stale lane, or unrelated/preexisting. Record the timeout command, exit status, and decisive output in the active ticket, prerequisite, or handoff, even when the decisive output is only a TAP header or timeout status.

If implementation blocks:

- if a concrete follow-up or prerequisite ticket is created or named as next owner, put it at the front of the queue
- if the current ticket is blocked by active same-family prerequisites, truth the dependency or queue notes as needed, move prerequisites ahead of it, commit that retarget/state update when files changed, print a handoff, and resume at the prerequisite after a reset boundary
- if no next owner exists, stop and report the blocker, current ticket, proof gap, and required user decision

When an approved `1-3-1` or Foundations reassessment turns the current implementation attempt into `blocked by new prerequisite`, use this compact retarget path before committing:

1. Restore or isolate any abandoned source/test/schema probe so the repo no longer contains a half-applied implementation path, unless the user explicitly approved retaining it as evidence.
2. Patch the blocked active ticket to record the approved option, failed proof lane, restored/retained probe state, new prerequisite owner, archive status, and next workflow.
3. Patch the originating spec and directly affected sibling tickets so phase order, dependency lists, and ticket-list prose point at the new prerequisite before returning to the blocked ticket.
4. Create or update the prerequisite ticket with a narrow problem statement, dependency edge, out-of-scope note that leaves the blocked ticket's remaining cleanup with the blocked ticket, and proof lane that reproduces or isolates the red gate.
5. Rerun the smallest proof that proves the restored safe path plus the ticket graph/integrity lanes, emit `post-ticket-review: not_applicable` in the required checkpoint, and commit the retarget as a blocked handoff rather than as implementation completion.
6. Persist state with the new prerequisite at the front of the queue and the blocked ticket immediately after it.

Use the blocked handoff classification when implementation edits remain landed, a partial behavioral slice is retained, terminal status is blocked by unresolved ownership, or no concrete next owner exists. If source/test/schema edits were only exploratory, are fully restored before commit, and the durable diff is limited to ticket/spec/state or other workflow artifacts, use the clean prerequisite insertion path below with `last_result: "retargeted_to_prerequisite"` instead of `blocked`. In that case, still record the abandoned probe and cleanup proof in the visible checkpoint.

For exploratory-probe cleanup before a clean prerequisite insertion, use this order:

1. Run `git diff --name-status` and `git status --short`, then classify tracked and untracked probe paths.
2. Restore only owned tracked source, test, schema, generated, or artifact diffs from the abandoned probe. Do not touch user, concurrent, or unrelated paths.
3. Delete only owned untracked probe files after confirming they are not user or concurrent work.
4. Rerun `git status --short` and a literal residue sweep for abandoned probe ids, paths, template ids, fixture names, and command labels across edited source, test, schema, generated, ticket, spec, and state areas.
5. Run the ticket graph or dependency-integrity lanes that prove the durable ticket/spec/state rewrite.

Record restored/removed paths and residue-sweep proof in `Abandoned-probe cleanup proof:`.

When the same approved reassessment happens before any source/test/schema implementation has landed, and the truthful result is a clean prerequisite insertion rather than a blocked landed slice:

1. Keep the original ticket nonterminal unless its own durable outcome needs to record a landed partial.
2. Create or update the prerequisite ticket with the narrow YAML/code/proof owner, dependencies, out-of-scope boundary, and proof lanes required before returning to the original ticket.
3. Patch the original ticket, originating spec, and directly affected siblings so dependency lists, phase order, ticket-list prose, and proof expectations point at the prerequisite.
4. Emit a dependent classification ledger for active same-family tickets that were inspected for retarget impact:

   ```text
   Dependent classification:
   - <path>: <relation to original/prerequisite>; <edit | no edit>; <rationale>
   ```

   Use `no edit` when a sibling correctly continues to depend on the original ticket rather than the new prerequisite, and cite that rationale instead of silently leaving it out.
5. Run the ticket graph/integrity lanes and focused hygiene for the artifact rewrite. The default proof set for a clean prerequisite insertion is `pnpm run check:ticket-deps`, `git diff --check` over edited tracked files, a no-index or equivalent whitespace check for any new untracked ticket/spec file, and an old/new id/path sweep covering the original ticket, prerequisite ticket, originating spec, and directly affected siblings.
6. Commit the retarget as a prerequisite handoff, not as `blocked` completion. Use `last_result: "retargeted_to_prerequisite"` and place the prerequisite immediately before the original target in the queue.

If the blocker is resolved by a user-approved 1-3-1 option or other explicit boundary reset, do this before resuming implementation:

1. Record the approved option and the user's confirmation in the active ticket, state file, or next visible checkpoint.
2. Patch any active ticket/spec/sibling artifact whose boundary, deliverable, proof lane, or dependency story changed because of the approved option.
3. Refresh `.codex/run-state/implement-spec-tickets.json` from `blocked: true` to the truthful resumed phase only after the owned artifacts reflect the new boundary.
4. Re-emit a compact working checkpoint for the resumed boundary, including invalidated proof lanes and the replacement proof plan.
5. Rerun affected focused proof before terminal status or archival. Do not cite proof from before the approved reset unless it is explicitly classified as still valid.

### 2. Audit Implement-Ticket When Exercised

After each implementation phase, run:

```text
$skill-audit .codex/skills/implement-ticket
```

If the iteration stopped in a pre-implementation prerequisite insertion or pure retarget before `implement-ticket` exercised source/test edits, terminal status, proof closeout, or archival handoff behavior, the audit may be marked `not_applicable: retarget-only boundary reset`. The visible checkpoint must still name the exercised child surfaces, such as reassessment, 1-3-1 ranking, ticket graph updates, and state persistence. If source/test/schema edits were made only as an exploratory probe, then fully restored before the retarget commit, this exception may still apply, but the checkpoint must name the abandoned probe, classify it as fully removed, and cite the cleanup proof that no source/test/schema diff remains. Do not use this exception when implementation edits landed, proof ran for a completed slice, terminal status changed, retained source/test/schema edits remain, or any child workflow behavior was worked around.

For retarget-only iterations, prefer the visibility profile above over terminal-ticket review wording. The child-audit exception is valid only when the final durable work is a prerequisite/queue/state rewrite, not when `implement-ticket` behavior was materially exercised and then manually reconstructed by the harness.

Propose every audit suggestion that is specific, evidence-backed, and compatible with `AGENTS.md`, `docs/FOUNDATIONS.md`, and Ludoforge's local ticket workflow. Do not apply child-skill edits during the implementation loop unless the user explicitly confirms the proposed skill/rules-file update.

Reject or defer suggestions that are speculative, duplicate existing guidance, weaken proof/closeout guardrails, or import assumptions from another repository.

Before proposing, applying, or rejecting suggestions, print:

```text
Child skill audit:
- Target skill: .codex/skills/implement-ticket
- Findings: <N issues, N improvements, N features>
- Evidence basis: <one-line session evidence checked>
- Apply: <specific user-confirmed suggestions to patch, or "none">
- Reject/defer: <specific suggestions and reason, or "none">
```

If no skill files change, record `Apply: none`. If the user explicitly confirms a child-skill edit and skill files change, run focused hygiene such as `git diff --check -- .codex/skills/implement-ticket`.

### 3. Review Completed Tickets

If the target ticket reaches a repo-local terminal implemented/completed status, run:

```text
$post-ticket-review <completed-ticket>
```

Before invoking `post-ticket-review`, re-open the completed ticket's `Acceptance Criteria`, `Test Plan`, `Commands`, and `Outcome`/proof ledger and confirm every ticket-named broad lane that could affect status, acceptance wording, dependency ownership, or archive eligibility has either run after the final boundary text, been explicitly substituted by a repo-valid lane, or been classified as intentionally post-archive-safe. If a remaining broad lane could expose a Foundations/repo-policy contradiction or force ticket/spec/follow-up truthing, run or classify that lane before archival rather than archiving first and amending after the fact. If running the lane is infeasible in the current turn, keep the ticket active with an implemented-not-archived handoff instead of invoking review.

Before invoking review, also map each acceptance criterion and invariant to current proof:

```text
Acceptance-to-command map:
- <criterion/invariant>: <direct command | covered by broader command | substituted with rationale | not exercised/blocking>
```

Use this map to catch semantic gates that are not named as exact commands, such as budget harnesses, policy-profile-quality lanes, generated-artifact checks, or repo integrity scripts. If any entry is `not exercised/blocking`, do not archive yet.

For prerequisite tickets, map the prerequisite ticket's own commands and invariants. If a dependent ticket names a broader or different proof command, classify that dependent command as next-owner proof unless the prerequisite explicitly adopted it; do not overclaim the dependent ticket's acceptance lane as current-ticket proof.

Use the live `post-ticket-review` skill exactly. It owns closeout truthing, archival, dependency/path repairs, and warranted follow-up creation.

Before the archive move or any finalization that depends on review, emit a compact child-review invocation marker so the harness can distinguish a real child workflow from manual reconstruction:

```text
post-ticket-review child workflow:
- skill loaded: <yes | blocked: reason>
- child workflow checklist executed: <yes | manual late recovery: reason | blocked: reason>
- ticket reread: <Acceptance Criteria/Test Plan/Commands/Outcome current | blocked: reason>
- current code/docs checked: <yes | blocked: reason>
- reference sweep: <complete | blocked: reason>
- action decision: <archive | keep active | follow-up | blocked>
```

This marker does not replace the `Post-ticket review:` block below. For the normal archive path, `child workflow checklist executed` must be `yes`, meaning the live `post-ticket-review` required reads and Phase 1/2/3 checklist were used as the active workflow for this review slice. If the child workflow was not actually observable, use the `manual late recovery` path and say why normal invocation is no longer truthful.

After review, print:

```text
Post-ticket review:
- Target ticket: <ticket path or archived path>
- Archival status: <archived | already archived | blocked | not_applicable>
- Closeout truthing: <validated unchanged | factually corrected | blocked>
- Reference sweep: <paths repaired or "no stale active-path refs found">
- Follow-ups: <created/updated ticket paths or "none">
- Verification: <rerun proof command/result or why rerun was not needed>
- Post-review correction proof: <not_applicable | changed paths + invalidated lanes + rerun/substitute lanes + rationale for any broad lane not rerun>
```

When reporting stale-path sweeps, distinguish active-path references such as `tickets/<id>.md` from already-correct archive references such as `archive/tickets/<id>.md`.

If post-ticket review makes or requires must-fix-now implementation, ticket, spec, dependency, archive-reference, or proof-story edits after earlier broad verification passed, explicitly classify proof invalidation before committing. Record which paths changed, which earlier proof lanes those changes invalidate, which focused or broad lanes were rerun as substitutes, and why any previously cited broad lane remains valid if it was not rerun.

If a proof lane consumes generated artifacts after `npm run clean`, `pnpm run clean`, package-local clean scripts, archive helpers, fixture refreshes, or any other step that may delete `dist`, schemas, WASM targets, compiled JSON, goldens, or cache-backed outputs, do not trust cached producer logs alone. Either force/rerun the producer that materializes the consumed artifact, or verify the required generated files exist before running or citing the consumer lane. Treat a cached build replay that does not restore a required artifact as non-proving for artifact-consuming tests until the artifact is rebuilt or observed.

When a ticket is archived, independently grep the originating spec and `.codex/run-state/implement-spec-tickets.json` for the moved active ticket path before committing, even when `post-ticket-review` or the archive helper reports successful reference repair. Patch actionable stale spec-list, dependency, queue, next-target, or in-progress references to the archive path or next active ticket as appropriate, or report why a remaining reference is historical and harmless.

If review blocks archival because same-seam work remains, put the active ticket back at the front of the queue and continue through `implement-ticket` unless the review requires a user decision.

Manual late recovery is exceptional, not a normal substitute for the child workflow. Use `manual late recovery: <reason>` only when the live state already crossed a point where invoking `post-ticket-review` directly would be misleading, duplicative, or impossible to observe cleanly, and only after reconstructing the child workflow's checklist from live repo evidence. Before archival or finalization under manual late recovery, emit the reason and verify all of these surfaces in visible text:

- why the normal child invocation is no longer the truthful path
- completed-ticket status and outcome are current against the final diff
- acceptance criteria and invariants are mapped to proof
- archival eligibility is terminal, with no same-seam work left active
- stale active-path references were swept in the originating spec, active sibling tickets, archived siblings when relevant, and the state file
- follow-up creation/update decision is explicit
- proof invalidation from any review-created edits is classified, with rerun/substitute proof named

If any manual-recovery checklist item is unverified, stop before archival and either invoke `post-ticket-review` or leave the ticket active with a handoff naming the missing item.

Normal archive path hard rule: before any ticket archive move, if the ticket is not already archived and no visible `post-ticket-review child workflow:` invocation marker exists for the current review slice, run `$post-ticket-review <completed-ticket>` now. Do not use manual late recovery simply because manual review checks have already been performed; reserve it for already-crossed states where a normal child invocation would be misleading, duplicative, or impossible to observe cleanly.

Archive move recipe. Use this exact order for every ticket archive move:

1. Run `node .codex/skills/implement-spec-tickets/scripts/handoff-preflight.mjs`.
2. Emit the `Pre-archive gate:` block below with truthful values.
3. Re-check that the visible conversation already contains that block for this archive move.
4. Run `node scripts/archive-ticket.mjs <ticket> archive/tickets`, `git mv`, or the chosen archive command.

Before moving any ticket into `archive/tickets/`, run `node .codex/skills/implement-spec-tickets/scripts/handoff-preflight.mjs`, then perform this archive gate in visible text. Emit this exact block immediately before running `node scripts/archive-ticket.mjs`, `git mv`, or any other archive move:

```text
Pre-archive gate:
- post-ticket-review: <invoked | manual late recovery: reason | not_applicable: reason>
- Post-ticket review block: <emitted | pending: review in progress | late recovery pending>
- archive eligibility: <terminal and outcome-current | blocked: reason>
```

The rows mean:
- `post-ticket-review`: `invoked`, `manual late recovery: <reason>`, or `not_applicable: <reason>`
- `Post-ticket review block`: `emitted`, `pending: review in progress`, or `late recovery pending`; use `pending: review in progress` for the normal pre-archive moment when review has been invoked but the final review block naturally cannot be emitted until after review/archive, and reserve `late recovery pending` for an actual missed-block recovery.
- `archive eligibility`: `terminal and outcome-current` or `blocked`

If the review was not invoked and there is no valid `manual late recovery` or `not_applicable` classification, stop before archival and run the child workflow.

Immediately before running `node scripts/archive-ticket.mjs`, `git mv`, or any other archive move for the ticket, re-check that this pre-archive gate has already appeared in visible text. If it has not, emit it before the archive command rather than recovering it later.

### 4. Audit Post-Ticket Review When It Changes Handoff Surfaces

If `post-ticket-review` creates or materially updates a follow-up ticket, active spec, active ticket dependency, current contract doc, active sibling proof command, active sibling verification lane, or same-family archive reference, run:

```text
$skill-audit .codex/skills/post-ticket-review
```

Routine archive fallout is not a material update by itself. When review only moves a terminal ticket, rewrites active paths to `archive/tickets/...`, updates the originating spec's ticket list/status line, changes only `Deps` from `tickets/<id>.md` to `archive/tickets/<id>.md`, or recomputes dependency order without changing ownership semantics, creating a follow-up, reopening a ticket, changing future verification behavior, or exposing a concrete review workflow defect, classify the audit as `not_applicable: routine archive/reference repair` in the required visible blocks. For this routine path, do not emit a child skill audit block; emit only the `not_applicable` classification. Run the audit when the reference repair changes handoff ownership, creates or edits a follow-up, changes a current contract doc, corrects stale proof commands or verification lanes in active sibling tickets, rewrites same-family archive meaning beyond path correction, or otherwise shows evidence that `post-ticket-review` guidance failed.

Handle sound, evidence-backed suggestions under the same confirmation rules as the implement-ticket audit. Emit the same compact child-audit block. If the user explicitly confirms a child-skill edit and skill files change, run focused hygiene over changed skill files.

Put any review-created follow-up ticket at the front of the queue. If review only truthed dependencies, specs, or archive references and created no follow-up, recompute dependency order but keep the existing queue where still valid.

### 5. Commit The Iteration

Compact pre-commit visibility gate. This is a quick index for the longer rules below: do not commit until each required block has appeared in visible text, or has been emitted as a `late harness recovery checkpoint` with a reason:

- child `implement-ticket` audit block
- `Acceptance-to-command map`
- pre-archive gate emitted before any ticket archive command, when archival is triggered
- `Post-ticket review` block, or `not_applicable` classification
- `post-ticket-review` audit block when triggered, or `not_applicable` classification
- generated-artifact provenance when triggered
- source-size ledger when triggered by `implement-ticket`
- state-file validation when the state file changed
- `Required-visible-block checkpoint`
- full `Harness handoff` readiness

Before committing:

1. Refresh `git status --short`.
2. Inspect `git diff --cached --name-status` before staging only to detect pre-existing staged entries. Pre-existing unrelated staged entries must not enter a harness commit.
3. Verify every dirty path is owned by the iteration, explicitly approved, or intentionally left unstaged.
   - Unrelated untracked files, reports, generated artifacts, and proof byproducts must remain untouched and unstaged unless the user explicitly approves deletion or inclusion. Do not remove them merely to make `git status --short` clean; instead, record them in `dirty_state` and the handoff as unrelated retained paths.
4. Run whitespace/hygiene over owned files. For newly untracked files, use `git diff --no-index --check /dev/null <path>` or an equivalent trailing-whitespace check.
   - For any new or regenerated generated fixture, witness, report, trace, generated schema/contract artifact, serialized-state artifact, or comparable generated proof artifact over 1 MB or over 10,000 lines, emit a generated-artifact provenance ledger before staging:
     - `artifact path`
     - `size / line count`
     - `generation command or retained script`
     - `canonical inputs`
     - `why checked in instead of generated on demand`
     - `hygiene proof`
     The ledger must classify generator durability as either `retained generator: <repo path>` or `ad hoc generator body recorded in: <ticket/report/committed provenance note>`. If the generator was ad hoc and is not retained, record the exact command and script body in a durable repo artifact before staging; a temporary path such as `/tmp/example.mjs` and a conversational handoff alone are not reproducible evidence for committed generated artifacts. Otherwise stop for `1-3-1` before committing a large opaque artifact.
     For inline shell generators such as `node -e`, avoid raw JavaScript template literals or markdown backticks inside shell-quoted command strings because the shell can treat backticks as command substitution before Node runs. Prefer a retained script, a temporary script whose exact body is copied into the durable outcome before staging, or shell-safe string concatenation.
   - If `implement-ticket` triggered a source-size ledger, preserve that ledger through final visibility before staging. The ledger must name every triggered path and the child workflow's resolution, such as extraction done, user-approved deferral, verified no edit, preexisting oversize with no active growth, or successor owner. The source-size ledger normally applies to implementation source and other repo-owned files governed by local size caps; for authored data or markdown/YAML GameSpecDoc support files, either emit the ledger when the child workflow triggered it or mark `not_applicable` with the reason, such as `authored data doc below cap` or `data-only growth, no source-size trigger`.
   - For any refreshed generated golden, profile-quality witness, deterministic decision sequence, trace, report, hash-only generated fixture output, or serialized-state artifact caused by an intentional trajectory or fixture shift, record lightweight provenance even when the file is below the large-artifact threshold:
     - `artifact path`
     - `generation command or retained script`
     - `canonical inputs`
     - `why the refresh is expected`
     Record this in the ticket outcome, a report, or another committed provenance note before staging. The lightweight ledger must classify generator durability as either `retained generator: <repo path>` or `ad hoc generator body recorded in: <ticket/report/committed provenance note>`. If the generator was ad hoc, preserve the exact command and script body in that durable repository location; a temporary path or conversational handoff alone is not enough for committed generated artifacts.
     Use this compact ledger when several small generated fixtures moved together:

     ```text
     Generated artifact provenance:
     - artifact path(s): <paths or glob plus exact files>
     - generation command: <command or retained script path>
     - canonical inputs: <spec/scenario/seed/profile/hash inputs>
     - expected refresh reason: <intentional trajectory/schema/witness shift>
     - generator durability: <retained generator: repo path | ad hoc generator body recorded in: ticket/report/committed provenance note>
     - hygiene proof: <git diff --check/schema check/focused consumer proof>
     ```
     Before staging any generated artifact with `generator durability: ad hoc generator body recorded in: ...`, re-open the named durable ticket, report, or committed provenance note and verify it preserves the exact script body plus command needed to rerun the generator. A prose summary of copied logic is not enough. If the exact body is absent and no retained repo script exists, stop before commit and either record the exact body durably or run `1-3-1` for how to handle the opaque refresh.
     When the durable command is an inline shell generator, re-check that the recorded command is shell-safe. In particular, do not preserve a command that relies on unescaped JS template-literal backticks inside a double-quoted shell string; record the working shell-safe command or use a retained script instead.
   - For very verbose broad proof lanes such as root `pnpm turbo test`, prefer capturing the output to a local log or other concise durable witness when it will be cited as final proof. Before launching a `tee` or log-wrapper command, verify that the destination is shell-writable in the current sandbox. Do not assume `.codex/run-state/` is a suitable shell log directory merely because the state file can be patched. Prefer `/tmp/<ticket>-<lane>.log` for transient logs unless the log is an intentionally committed report artifact. If `tee` or log setup fails after the lane starts, stop or interrupt the lane only with existing user approval or after `1-3-1`, then rerun with working capture. Do not cite the failed log path as durable evidence. At minimum, record the exact command, exit status, and enough summary output in the ticket outcome or handoff to make the proof auditable if the terminal output is truncated.
   - When a clean-HEAD baseline, A/B comparison, or broad-lane causality check uses a temporary git worktree or alternate checkout, record a baseline worktree lifecycle ledger before staging:
     - `path`
     - `purpose`
     - `created from`
     - `commands/results used as evidence`
     - `retention decision: retained for inspection | removed`
     - `cleanup/status proof: git worktree list classification`
     Do not silently leave registered temporary worktrees behind; either remove them when no longer needed or name why they are retained in the handoff.
5. Validate `.codex/run-state/implement-spec-tickets.json` if it changed: live paths exist or are intentionally archived/final, queued paths exist, `last_work_commit` is a full reachable SHA or `"none"`, `last_state_commit` is a reachable SHA, the same SHA as `last_work_commit`, `"self"`, or `"none"`, and `dirty_state` matches the worktree classification. Prefer `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs` when available. `dirty_state` must use one of the documented forms (`"clean"`, `unrelated_untracked: ...`, `unrelated_dirty: ...`, `owned_dirty: ...`, or `mixed_dirty: ...`), unless this skill has been updated to document a new form first. For a state-file-only follow-up commit where the only live dirty path is `.codex/run-state/implement-spec-tickets.json` and the staged/final state truthfully says post-commit `dirty_state: "clean"`, validate with `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs --allow-only-state-file-dirty .codex/run-state/implement-spec-tickets.json`, then revalidate without that flag after the state commit.
6. Stage only owned and approved paths.
7. Re-run `git diff --cached --name-status` after staging and immediately before commit; confirm the staged set is scoped to the iteration.
8. If `.codex/run-state/implement-spec-tickets.json` is staged, re-read the staged state before committing. It must describe the post-review terminal or blocked state represented by the commit being made, not stale intake or in-progress state for the ticket that just completed. If the state file still needs the finalized work commit SHA or otherwise describes a later handoff phase, unstage it and use the state-file-only follow-up commit pattern in `Persist State And Prepare Reset`.
9. Emit the checkpoint below.
10. Commit with a message naming the ticket id and truthful contents, such as `181STRSTRPOL-001 implement and archive selector probe fix`. Mention follow-ups or skill hardening only when they actually changed.

Commit lock recipe: immediately before running `git commit`, run `node .codex/skills/implement-spec-tickets/scripts/handoff-preflight.mjs`, print the required checkpoint below, then run `git diff --cached --name-status`, then run the commit. Treat this order as the normal path. The late-recovery rules are only for accidental misses discovered after the fact; if late recovery was needed, name that process miss in the final handoff or state-only handoff instead of implying the checkpoint was timely.

Late-recovery classification. Before using any late recovery, classify the miss and take only the allowed action:

| Miss type | Allowed recovery |
|---|---|
| missed visibility only | Emit a `late harness recovery checkpoint` with the current truthful contents; name the miss in the final handoff or state-only handoff. |
| missed proof | Run or rerun the missing proof, or leave the ticket active with a handoff naming the unverified lane. A visibility checkpoint cannot make unrun proof valid. |
| missed child workflow | Run or rerun the child workflow unless the live state already crossed a point where normal invocation would be misleading, duplicative, or impossible to observe cleanly; in that exceptional case, use the manual late recovery checklist and say why. |

Required checkpoint. This is a hard stop: do not commit until every row below has been emitted or explicitly marked `not_applicable` with a reason. If any row was missed earlier, emit this as a `late harness recovery checkpoint` and say it is late.

```text
Required-visible-block checkpoint:
- implement-ticket audit block: <emitted | not_applicable: reason>
- Acceptance-to-command map: <emitted | not_applicable: reason | blocked: reason>
- pre-archive gate: <emitted before archive command | not_applicable: no ticket archive in this iteration | late_recovered: reason>
- post-ticket-review block: <emitted | not_applicable: reason>
- post-ticket-review audit block: <emitted | not_applicable: reason | blocked: reason>
- state-file validity: <valid | not_changed | blocked: reason>
- generated-artifact provenance: <emitted | not_applicable: reason | blocked: reason>
- generated-artifact generator durability: <verified exact body/retained script | not_applicable: no generated artifact | blocked: reason>
- source-size ledger: <emitted | not_applicable: reason | blocked: reason>
- abandoned-probe cleanup proof: <emitted | not_applicable: no abandoned exploratory source/test/schema/proof probe | blocked: reason>
- baseline worktree lifecycle: <emitted | not_applicable: no temporary baseline worktree | blocked: reason>
- dependent classification: <emitted | not_applicable: no prerequisite insertion or directly affected siblings | blocked: reason>
- approved extra paths: <none | paths + approval source + commit-message/handoff treatment>
- Harness handoff: <ready_to_emit | not_applicable: reason>
```

Finalizer micro-checklist: immediately before any iteration commit, no-commit final response, or final response after a state-only commit, run `node .codex/skills/implement-spec-tickets/scripts/handoff-preflight.mjs` and verify these visible artifacts are present or explicitly recovered late: child `implement-ticket` audit block, `Acceptance-to-command map`, `Post-ticket review` block, `post-ticket-review` audit block when triggered, the `Required-visible-block checkpoint`, generated-artifact provenance when triggered, source-size ledger when triggered, abandoned-probe cleanup proof when triggered, baseline worktree lifecycle when triggered, dependent classification when triggered, final state-file validation, and the full `Harness handoff`. For any generated report staged or left as a durable proof artifact, the generated-artifact provenance must name `path`, `generation command`, `canonical inputs`, and the ticket/report/handoff location where that provenance is recorded. If any item is missing, emit the matching `late harness recovery checkpoint` before committing or finalizing.

If a required child skill audit block is missing and there is no visible evidence that the audit actually ran in the current observable context, run the child audit before committing or finalizing. Do not treat a late checkpoint as a substitute for an unrun or unobservable `$skill-audit`. After running it, emit the compact child-audit block and apply, reject, or defer evidence-backed suggestions under the normal child-audit rules.

Manual review is not a substitute for a child-skill workflow unless it is explicitly classified in this checkpoint. If you manually perform any `post-ticket-review` step, still emit the `Post-ticket review:` block and classify it as `child-skill invocation`, `manual late recovery`, or `not_applicable`.

If a required-visible block was missed at its intended point, emit a `late harness recovery checkpoint` before committing or finalizing. Name the missed block, classify why it was late, provide the current truthful contents, and do not describe the recovered block as timely in the commit or handoff.

If a required-visible block is discovered missing only after the iteration work commit already exists, do not rewrite or amend the work commit solely to add conversational visibility. Emit the `late harness recovery checkpoint` immediately, classify the missed block as post-commit recovery, provide the current truthful contents, and name the missed-checkpoint fact in the final handoff or state-only commit handoff. If any missing block reflects an unrun or unobservable child workflow rather than only missed visibility text, run or rerun that workflow before finalizing.

When user-approved extra paths are included in the iteration commit even though they are not ticket-owned, list them in the checkpoint and final handoff. The commit message must either mention the extra skill/process hardening if it is material, or the final handoff must explicitly state that the extra path was included by user approval and was not part of the ticket deliverable. Do not let approved unrelated paths appear as silent ticket-owned work.

If a tracked ticket or spec was archived with `node scripts/archive-ticket.mjs` or `git mv`, stage the archive destination and other edited owned paths, then stage the source-parent deletion with `git add -A <source-parent-dir>` when the old source path no longer exists. A typical tracked move staging shape is `git add <archive-destination>` plus `git add -A tickets` or `git add -A specs`, followed by `git diff --cached --name-status` to confirm the source deletion/rename appears.

If the archived ticket was an untracked active draft, no tracked source deletion or rename entry is expected. Stage the archive destination and other edited owned paths, confirm the old active path is absent with a source-gone check, sweep active/spec references for the old `tickets/<id>.md` path, and use `git diff --cached --name-status` to confirm the staged shape is an added archive file plus any intended reference repairs.

If non-destructive git index commands fail because Codex cannot write the index or reports sandbox/read-only errors, rerun the same failed command with required approval/escalation and record the retry in the handoff.

If nothing changed, do not create an empty commit. Record why no commit was created.

### 6. Persist State And Prepare Reset

After each iteration work commit or no-commit checkpoint, update the state file with:

- originating or archived spec path
- last ticket and result
- `last_work_commit`: full commit SHA or `"none"`
- `last_state_commit`: same SHA as `last_work_commit`, `"self"`, or `"none"`
- next target, `"final_spec_archive"`, or `"blocked"`
- remaining queue
- blocker summary when blocked
- normalized dirty-state classification
- `updated_at`

No-commit finalization is still a terminal handoff state. Before any final response that does not create a work commit:

1. Refresh `git status --short`.
2. Update `.codex/run-state/implement-spec-tickets.json` so `last_work_commit: "none"` unless a prior reachable commit genuinely represents the just-completed iteration, `last_state_commit` is `"none"` or `"self"` as appropriate, and `dirty_state` truthfully records owned/unrelated dirty paths instead of `clean`.
3. Re-read the state file and confirm queued paths, `next_target`, `phase`, `in_progress_ticket`, `owned_dirty_summary`, and `dirty_state` match the live repo.
4. Emit the full `Harness handoff` block below with `Work commit: none` and `State commit: none` unless a state-only commit was actually created.
5. Do not send a final response until the no-commit handoff states what remains dirty and which invocation should resume or commit the work.

If the state file must record the finalized work commit SHA and changes after the work commit, prefer committing it separately as a state-file-only commit with `last_state_commit: "self"`. Prepare that state file for the expected post-state-commit repo state, not the transient pre-commit state: for example, if the only remaining dirty path is the state file itself and it is about to be committed, `dirty_state` must be `"clean"` for the final post-commit state. Do not amend solely to embed the finalized work commit SHA, because amending changes that SHA again.

State-only clean-state example: after a work commit `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, when the only remaining dirty path is `.codex/run-state/implement-spec-tickets.json` and you are about to commit that state file, write `last_work_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`, `last_state_commit: "self"`, `dirty_state: "clean"`, and an `owned_dirty_summary` that describes the post-state-commit repo as clean. Do not write `dirty_state: "state_file_only"` for that state commit; that describes the transient pre-commit moment and will be stale immediately after the commit.

Before a state-file-only commit, emit this lightweight checkpoint in visible text:

```text
State-only commit checkpoint:
- staged state file: <yes | blocked: reason>
- recorded work commit: <full sha | none>
- recorded state commit: <self | full sha | none>
- state-only validator mode: <not_applicable | --allow-only-state-file-dirty used because only state file is dirty>
- post-commit dirty-state expectation: <clean | unrelated_dirty/untracked paths | blocked: reason>
- planned revalidation: <retained validator + git status | manual state checks + git status>
```

This checkpoint does not replace the final `Harness handoff`; it records why the state-only commit is scoped to harness state and how the post-commit validation will be proven.

If unrelated dirty paths appear or change after a state-only commit but before final response, refresh the state file once when the committed state would make the handoff false. Use `unrelated_dirty: <paths>` for unrelated tracked modifications, unrelated untracked files, or both. If unrelated paths keep changing after that refresh, stop chasing state-only commits; report the latest live `git status --short`, identify the state file as stale because of concurrent unrelated work, and do not commit unrelated paths. Continue only after the user confirms how to handle the volatile unrelated worktree.

If the state file is amended into the work commit for a reason other than recording that commit's finalized SHA, `last_state_commit` may be the same as `last_work_commit` or `"self"` when that is the truthful non-self-referential state. Do not create a chain of state-only commits to embed the state commit's own SHA.

Do not write `"self"` into `last_work_commit`. When the state file is included in the same commit as the work and the finalized work SHA is not yet knowable, choose one of these valid patterns:

1. Commit the work without the final SHA, then immediately make a state-file-only commit that records `last_work_commit` as the full work commit SHA and `last_state_commit: "self"`.
2. If no work commit was created, record `last_work_commit: "none"` and `last_state_commit: "none"` or `"self"` depending on whether the state file itself was committed.
3. If the state file must be included in the work commit for a non-SHA reason, set `last_work_commit` to the previous reachable work SHA only when that is still the truthful last completed work commit; otherwise use the state-file-only follow-up commit pattern.

After committing state separately, revalidate the final handoff state before responding:

1. Refresh `git status --short`; `dirty_state` in the state file must match the final worktree classification.
2. Re-read `.codex/run-state/implement-spec-tickets.json` and confirm the paths, queue, `last_work_commit`, `last_state_commit`, `phase`, `in_progress_ticket`, and `dirty_state` describe the post-state-commit repo state.
3. Verify the recorded `last_work_commit` exactly matches the finalized work commit SHA. A compact recipe is: `git show --no-patch --format=%H <work-commit>` for the work commit you intend to record, then compare that full SHA to the state file. If the value is not `"none"`, also verify it is reachable with `git cat-file -e <sha>^{commit}` or an equivalent non-mutating git check.
4. If the state-only commit was amended, rerun the same checks against the amended commit before finalizing.

Use this compact state-file validation recipe whenever `.codex/run-state/implement-spec-tickets.json` changed before staging, committing, or finalizing:

- parse/read the state file and verify `last_work_commit` is a full reachable commit SHA or `"none"`; never `"self"`
- verify `last_state_commit` is a full reachable commit SHA, the same SHA as `last_work_commit`, `"self"`, or `"none"`
- verify active paths exist, archived paths exist, queued paths exist, and final queues are empty when `phase: "completed"`
- verify `next_target`, `phase`, `in_progress_ticket`, `blocked`, and `dirty_state` match `git status --short`
- if unrelated tracked or untracked paths remain intentionally unstaged, verify `dirty_state` and the handoff name them explicitly instead of claiming `clean`
- prefer the retained validator at `.codex/skills/implement-spec-tickets/scripts/validate-state.mjs`; if it is unavailable, do the checks manually and record the result in the Required-visible-block checkpoint
- for a state-file-only follow-up commit, use `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs --allow-only-state-file-dirty .codex/run-state/implement-spec-tickets.json` when the only live dirty path is the state file and the file truthfully records the expected post-commit state as `dirty_state: "clean"`; after the state commit, rerun the validator without the flag plus `git status --short`

When a retained validator is not available, this shell-safe validation shape is acceptable to run from the repo root and cite in the checkpoint:

```bash
node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('.codex/run-state/implement-spec-tickets.json','utf8')); if(s.last_work_commit==='self') throw new Error('last_work_commit cannot be self'); for (const key of ['originating_spec','last_ticket','next_target']) { const value=s[key]; if (typeof value==='string' && !['blocked','final_spec_archive'].includes(value) && !fs.existsSync(value)) throw new Error(key+' missing: '+value); } for (const value of s.queue || []) if (!fs.existsSync(value)) throw new Error('queue missing: '+value); if (!['clean'].includes(s.dirty_state) && !/^unrelated_untracked: |^unrelated_dirty: |^owned_dirty: |^mixed_dirty: /.test(s.dirty_state || '')) throw new Error('dirty_state vocabulary: '+s.dirty_state); console.log('state validation ok')"
```

Also verify any non-`"none"` `last_work_commit` is reachable with `git cat-file -e <sha>^{commit}` or an equivalent non-mutating git command.

Print:

```text
Harness handoff:
- Originating spec: <active or archived path>
- Last ticket processed: <ticket id and result>
- Work commit: <sha or "none">
- State commit: <sha or "none" | "self" | same as work commit; after a state-only commit prefer "self (<actual state commit sha>)">
- Next target: <follow-up ticket path | next queued ticket path | final spec archive | blocked>
- Queue: <remaining active ticket paths>
- Dirty state: <clean | expected ignored artifacts | owned/unrelated paths still present>
- State file: .codex/run-state/implement-spec-tickets.json
- Required next invocation: $implement-spec-tickets <spec> <next-target-if-any>
- Reset boundary: <fresh context recommended | continuing same-seam follow-up/direct dependent with reason | not_applicable: final/blocked>
- Approved boundary resets: <none | user-approved decision + artifact where recorded>
```

Stop after the handoff for a non-follow-up ticket unless context remains small and the next target is an immediate follow-up or explicit direct dependent. The next session must reload this skill, child skills, live active tickets, and `git status --short`.

## Queue And Follow-Up Rules

- A follow-up ticket created by `implement-ticket` or `post-ticket-review` is the next target.
- If multiple follow-ups are created, choose the one explicitly identified as next owner. If none is identified, choose the lowest lexical path and record the ordering.
- Between non-follow-up tickets, keep active same-family prerequisites ahead of active dependents.
- When a user-supplied target was retargeted only to satisfy active prerequisites, return that original target to the front once its active prerequisites are archived, unless a new follow-up or prerequisite takes priority.
- Do not skip active originating-spec tickets unless their deps, status, or review result proves they are not current work.
- If a sibling ticket is absorbed into the current ticket, update the sibling and queue truthfully before committing.
- If a ticket is archived, remove its old active path from the queue and repair dependency references according to `post-ticket-review` and `docs/archival-workflow.md`.

## Final Spec Archive

When all originating-spec tickets are completed, reviewed, archived, and committed:

1. Re-read the originating spec.
2. Confirm no active `tickets/*.md` still names the spec as active implementation work.
3. Inspect the spec's final verification/outcome expectations. Run the final proof lanes it names, or explicitly classify why a named lane is superseded, unavailable, or outside the accepted boundary.
4. If final proof exposes a small same-seam mismatch in completed deliverables, make the minimal repair, truth affected archived ticket/spec closeout text, and rerun focused hygiene. If the mismatch needs new ownership, create or surface a follow-up ticket instead of archiving the spec green.
5. Update the spec status and `## Outcome` per `docs/archival-workflow.md`.
6. Archive with `node scripts/archive-ticket.mjs <spec> archive/specs/`, using an explicit destination only when needed to avoid collisions.
7. Confirm the original `specs/` path no longer exists.
8. Sweep active tickets, specs, docs, reports, same-family archived tickets, and the state file for stale active-spec path references. Repair actionable references to the archived path; leave clearly historical references only when harmless.
9. Run `pnpm run check:ticket-deps` and focused `git diff --check` over edited archive/spec/state files.
10. Before committing the final spec archive, emit the same `Required-visible-block checkpoint` from `Commit The Iteration`, or an explicit `late harness recovery checkpoint` if any row was missed earlier. Mark rows `not_applicable` with reasons when the final archive did not exercise that surface.
11. Commit the final spec archive unless already included in the last ticket-family commit for a documented reason.
12. Update the state file with `archived_spec`, `next_target: null`, an empty queue, `blocked: false`, the finalized final-archive work commit SHA, and clean dirty-state classification.
13. Commit the updated state file as a state-file-only commit with `last_state_commit: "self"` when the finalized final-archive work SHA was not knowable at the time of the archive commit. Do not write `"self"` into `last_work_commit`.
14. Revalidate the state file after the state-only commit before final response.

## Branch And Push

After the final archive commit and any required state persistence commit:

1. Refresh `git status --short`. Stop if uncommitted owned changes remain.
2. Create a branch from current `HEAD` with a concise family name derived from the spec id or filename.
3. Push the branch to the configured remote.
4. Report the branch, remote, commits created by the harness, archived spec path, archived ticket paths, and any active follow-up tickets.

Do not create or push a branch if the loop stopped blocked or if the worktree still contains unapproved dirty paths.

## Hard Stops

- `docs/FOUNDATIONS.md` wins over spec prose, ticket prose, and this harness.
- Do not bypass child-skill guardrails.
- Do not commit unrelated pre-existing dirty paths unless the user explicitly approves inclusion.
- Do not treat blocked tickets as completed.
- Do not archive the originating spec while any active ticket still owns required work for it.
- Do not push with uncommitted owned changes or unresolved blockers.
- Do not import workflow assumptions from another repository. Use Ludoforge's `AGENTS.md`, `docs/FOUNDATIONS.md`, `tickets/README.md`, `docs/archival-workflow.md`, and live child skills as authority.

## Final Report

After each ticket iteration, include the `Harness handoff` block from `Persist State And Prepare Reset` verbatim unless the final spec archive or branch/push path supersedes it. End with:

Before the final response, perform a handoff preflight: confirm the response includes every `Harness handoff` row when applicable, including originating spec, last ticket processed, work commit, state commit, next target, queue, dirty state, state file, required next invocation, reset boundary, and approved boundary resets. If the final spec archive or blocked path supersedes the normal block, explicitly state why the normal row is not applicable.

- originating spec path and archived path, if archived
- tickets implemented, blocked, archived, or left active
- follow-up retargeting decisions
- child-skill audit suggestions applied or rejected
- commits created
- final branch and push result, if reached
- verification commands or review surfaces that proved the final state
- final state-file status
