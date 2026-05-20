---
name: implement-spec-tickets
description: "Run the Ludoforge spec-ticket implementation loop for a spec: select active same-family tickets, invoke implement-ticket with the originating spec as authority, review/archive completed tickets with post-ticket-review, apply evidence-backed skill-audit hardening when child workflows expose it, persist resume state, archive the originating spec when all owned tickets are done, and optionally create/push a final branch."
---

# Implement Spec Tickets

Use this skill when the user wants the full Ludoforge spec-family loop handled across multiple tickets without repeatedly invoking child skills by hand.

This is an orchestration skill. Do not reimplement `.codex/skills/implement-ticket`, `.codex/skills/post-ticket-review`, or `.codex/skills/skill-audit`; load and obey those skills at each phase, and let their narrower guardrails control their owned work.

The default unit of execution is one ticket iteration: implement, review/archive when complete, commit, persist state, and hand off the next target. The full loop is resumable across invocations. Continue into another ticket in the same invocation only when the next target is an immediate follow-up or explicit direct dependent, the continuation is still the same seam, context remains small enough to preserve proof accuracy, and the worktree/state file are clean enough to avoid ambiguity.

Prefer a fresh context boundary between unrelated ticket iterations. After each iteration commit, persist state, print a compact handoff, and stop for `/new` or context compaction unless the continuation test above is satisfied.

## Child Skill Audit Override

This harness intentionally narrows `skill-audit` output when auditing child workflow skills during an implementation loop. Use the live `skill-audit` criteria to identify evidence-backed issues, improvements, and features, but emit the compact child-audit block required below instead of the full report template.

This harness also grants explicit authorization to patch child skills when a child-audit suggestion is specific, evidence-backed, and compatible with `AGENTS.md`, `docs/FOUNDATIONS.md`, and Ludoforge's local ticket workflow. That authorization applies only inside this orchestrated loop; a standalone `$skill-audit` request remains report-only unless the user separately asks to implement suggestions.

For any nonzero child-audit finding count, include enough evidence in the compact block to justify each apply, reject, or defer decision. Do not collapse nonzero findings into unexplained counts.

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

Apply every audit suggestion that is specific, evidence-backed, and compatible with `AGENTS.md`, `docs/FOUNDATIONS.md`, and Ludoforge's local ticket workflow. This skill is explicit authorization to apply those suggestions; do not wait for a separate "Implement suggestions" prompt.

Reject or defer suggestions that are speculative, duplicate existing guidance, weaken proof/closeout guardrails, or import assumptions from another repository.

Before applying or rejecting suggestions, print:

```text
Child skill audit:
- Target skill: .codex/skills/implement-ticket
- Findings: <N issues, N improvements, N features>
- Evidence basis: <one-line session evidence checked>
- Apply: <specific suggestions to patch, or "none">
- Reject/defer: <specific suggestions and reason, or "none">
```

If no skill files change, record `Apply: none`. If skill files change, run focused hygiene such as `git diff --check -- .codex/skills/implement-ticket`.

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

Use the live `post-ticket-review` skill exactly. It owns closeout truthing, archival, dependency/path repairs, and warranted follow-up creation.

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

When a ticket is archived, independently grep the originating spec for the moved active ticket path before committing, even when `post-ticket-review` or the archive helper reports successful reference repair. Patch actionable stale spec-list or dependency references to the archive path, or report why a remaining reference is historical and harmless.

If review blocks archival because same-seam work remains, put the active ticket back at the front of the queue and continue through `implement-ticket` unless the review requires a user decision.

Before moving any ticket into `archive/tickets/`, perform this archive gate in visible text:

- `post-ticket-review`: `invoked`, `manual late recovery: <reason>`, or `not_applicable: <reason>`
- `Post-ticket review block`: `emitted` or `late recovery pending`
- `archive eligibility`: `terminal and outcome-current` or `blocked`

If the review was not invoked and there is no valid `manual late recovery` or `not_applicable` classification, stop before archival and run the child workflow.

### 4. Audit Post-Ticket Review When It Changes Handoff Surfaces

If `post-ticket-review` creates or materially updates a follow-up ticket, active spec, active ticket dependency, current contract doc, or same-family archive reference, run:

```text
$skill-audit .codex/skills/post-ticket-review
```

Apply sound, evidence-backed suggestions under the same rules as the implement-ticket audit. Emit the same compact child-audit block and run focused hygiene over changed skill files.

Put any review-created follow-up ticket at the front of the queue. If review only truthed dependencies, specs, or archive references and created no follow-up, recompute dependency order but keep the existing queue where still valid.

### 5. Commit The Iteration

Before committing:

1. Refresh `git status --short`.
2. Inspect `git diff --cached --name-status` before staging. Pre-existing unrelated staged entries must not enter a harness commit.
3. Verify every dirty path is owned by the iteration, explicitly approved, or intentionally left unstaged.
4. Run whitespace/hygiene over owned files. For newly untracked files, use `git diff --no-index --check /dev/null <path>` or an equivalent trailing-whitespace check.
   - For any new generated fixture, witness, report, trace, or serialized-state artifact over 1 MB or over 10,000 lines, emit a generated-artifact provenance ledger before staging:
     - `artifact path`
     - `size / line count`
     - `generation command or retained script`
     - `canonical inputs`
     - `why checked in instead of generated on demand`
     - `hygiene proof`
     If the generator was ad hoc and is not retained, record the exact command or script body in the ticket outcome, a report, or the final handoff; otherwise stop for `1-3-1` before committing a large opaque artifact.
   - For any refreshed generated golden, profile-quality witness, deterministic decision sequence, trace, report, or serialized-state artifact caused by an intentional trajectory or fixture shift, record lightweight provenance even when the file is below the large-artifact threshold:
     - `artifact path`
     - `generation command or retained script`
     - `canonical inputs`
     - `why the refresh is expected`
     Record this in the ticket outcome, a report, or the final handoff before staging. If the generator was ad hoc, preserve the exact command text in that durable location.
5. Validate `.codex/run-state/implement-spec-tickets.json` if it changed: live paths exist or are intentionally archived/final, queued paths exist, `last_work_commit` is a full reachable SHA or `"none"`, `last_state_commit` is a reachable SHA, the same SHA as `last_work_commit`, `"self"`, or `"none"`, and `dirty_state` matches the worktree classification.
6. Stage only owned and approved paths.
7. Re-run `git diff --cached --name-status` and confirm the staged set is scoped to the iteration.
8. If `.codex/run-state/implement-spec-tickets.json` is staged, re-read the staged state before committing. It must describe the post-review terminal or blocked state represented by the commit being made, not stale intake or in-progress state for the ticket that just completed. If the state file still needs the finalized work commit SHA or otherwise describes a later handoff phase, unstage it and use the state-file-only follow-up commit pattern in `Persist State And Prepare Reset`.
9. Emit the checkpoint below.
10. Commit with a message naming the ticket id and truthful contents, such as `181STRSTRPOL-001 implement and archive selector probe fix`. Mention follow-ups or skill hardening only when they actually changed.

Required checkpoint. This is a hard stop: do not commit until every row below has been emitted or explicitly marked `not_applicable` with a reason. If any row was missed earlier, emit this as a `late harness recovery checkpoint` and say it is late.

```text
Required-visible-block checkpoint:
- implement-ticket audit block: <emitted | not_applicable: reason>
- post-ticket-review block: <emitted | not_applicable: reason>
- post-ticket-review audit block: <emitted | not_applicable: reason | blocked: reason>
- state-file validity: <valid | not_changed | blocked: reason>
- generated-artifact provenance: <emitted | not_applicable: reason | blocked: reason>
- approved extra paths: <none | paths + approval source + commit-message/handoff treatment>
- Harness handoff: <ready_to_emit | not_applicable: reason>
```

Finalizer micro-checklist: immediately before any iteration commit, no-commit final response, or final response after a state-only commit, verify these visible artifacts are present or explicitly recovered late: child `implement-ticket` audit block, `Acceptance-to-command map`, `Post-ticket review` block, `post-ticket-review` audit block when triggered, the `Required-visible-block checkpoint`, generated-artifact provenance when triggered, final state-file validation, and the full `Harness handoff`. For any generated report staged or left as a durable proof artifact, the generated-artifact provenance must name `path`, `generation command`, `canonical inputs`, and the ticket/report/handoff location where that provenance is recorded. If any item is missing, emit the matching `late harness recovery checkpoint` before committing or finalizing.

If a required child skill audit block is missing and there is no visible evidence that the audit actually ran in the current observable context, run the child audit before committing or finalizing. Do not treat a late checkpoint as a substitute for an unrun or unobservable `$skill-audit`. After running it, emit the compact child-audit block and apply, reject, or defer evidence-backed suggestions under the normal child-audit rules.

Manual review is not a substitute for a child-skill workflow unless it is explicitly classified in this checkpoint. If you manually perform any `post-ticket-review` step, still emit the `Post-ticket review:` block and classify it as `child-skill invocation`, `manual late recovery`, or `not_applicable`.

If a required-visible block was missed at its intended point, emit a `late harness recovery checkpoint` before committing or finalizing. Name the missed block, classify why it was late, provide the current truthful contents, and do not describe the recovered block as timely in the commit or handoff.

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

If the state file must record the finalized work commit SHA and changes after the work commit, prefer committing it separately as a state-file-only commit with `last_state_commit: "self"`. Prepare that state file for the expected post-state-commit repo state, not the transient pre-commit state: for example, if the only remaining dirty path is the state file itself and it is about to be committed, `dirty_state` should normally describe the final clean state after the state-only commit. Do not amend solely to embed the finalized work commit SHA, because amending changes that SHA again.

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
- if no retained script performs this validation, do the checks manually and record the result in the Required-visible-block checkpoint

Print:

```text
Harness handoff:
- Originating spec: <active or archived path>
- Last ticket processed: <ticket id and result>
- Work commit: <sha or "none">
- State commit: <sha or "none" | same as work commit>
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
