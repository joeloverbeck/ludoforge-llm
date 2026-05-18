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
- recorded commit SHAs are reachable from `HEAD`; `"self"` and `"none"` are allowed for `last_state_commit`
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
6. If unrelated dirty paths exist and this harness would need to commit, stop and ask whether those paths should be included. Do not silently commit unrelated work.
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

If implementation blocks:

- if a concrete follow-up or prerequisite ticket is created or named as next owner, put it at the front of the queue
- if the current ticket is blocked by active same-family prerequisites, truth the dependency or queue notes as needed, move prerequisites ahead of it, commit that retarget/state update when files changed, print a handoff, and resume at the prerequisite after a reset boundary
- if no next owner exists, stop and report the blocker, current ticket, proof gap, and required user decision

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

When a ticket is archived, independently grep the originating spec for the moved active ticket path before committing, even when `post-ticket-review` or the archive helper reports successful reference repair. Patch actionable stale spec-list or dependency references to the archive path, or report why a remaining reference is historical and harmless.

If review blocks archival because same-seam work remains, put the active ticket back at the front of the queue and continue through `implement-ticket` unless the review requires a user decision.

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
5. Stage only owned and approved paths.
6. Re-run `git diff --cached --name-status` and confirm the staged set is scoped to the iteration.
7. Emit the checkpoint below.
8. Commit with a message naming the ticket id and truthful contents, such as `181STRSTRPOL-001 implement and archive selector probe fix`. Mention follow-ups or skill hardening only when they actually changed.

Required checkpoint:

```text
Required-visible-block checkpoint:
- implement-ticket audit block: <emitted | not_applicable: reason>
- post-ticket-review block: <emitted | not_applicable: reason>
- post-ticket-review audit block: <emitted | not_applicable: reason | blocked: reason>
- Harness handoff: <ready_to_emit | not_applicable: reason>
```

If a ticket or spec was archived with `node scripts/archive-ticket.mjs` or `git mv`, stage the archive destination and other edited owned paths, then confirm the source deletion/rename appears in `git diff --cached --name-status`.

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

If the state file must record the finalized work commit SHA and changes after the work commit, prefer committing it separately as a state-file-only commit with `last_state_commit: "self"`. Do not amend solely to embed the finalized work commit SHA, because amending changes that SHA again.

If the state file is amended into the work commit for a reason other than recording that commit's finalized SHA, `last_state_commit` may be the same as `last_work_commit` or `"self"` when that is the truthful non-self-referential state. Do not create a chain of state-only commits to embed the state commit's own SHA.

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
```

Stop after the handoff for a non-follow-up ticket unless context remains small and the next target is an immediate follow-up or explicit direct dependent. The next session must reload this skill, child skills, live active tickets, and `git status --short`.

## Queue And Follow-Up Rules

- A follow-up ticket created by `implement-ticket` or `post-ticket-review` is the next target.
- If multiple follow-ups are created, choose the one explicitly identified as next owner. If none is identified, choose the lowest lexical path and record the ordering.
- Between non-follow-up tickets, keep active same-family prerequisites ahead of active dependents.
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
10. Commit the final spec archive unless already included in the last ticket-family commit for a documented reason.
11. Update the state file with `archived_spec`, `next_target: null`, an empty queue, `blocked: false`, the final commit SHA, and clean dirty-state classification.

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

End with:

- originating spec path and archived path, if archived
- tickets implemented, blocked, archived, or left active
- follow-up retargeting decisions
- child-skill audit suggestions applied or rejected
- commits created
- final branch and push result, if reached
- verification commands or review surfaces that proved the final state
- final state-file status
