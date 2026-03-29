# Guidelines for skill modification or creation

do not create a skill because a ticket was hard. Create or modify a skill only when the work exposed a reusable method. In Codex, skills are meant for reusable workflows with clear scope, clear triggers, and optional scripts/resources; OpenAI’s guidance is basically “once a workflow becomes repeatable, stop retyping it as a long prompt.”

The cleanest way to think about it is to sort every post-ticket lesson into one of five buckets:

- Do nothing: the task was unusual, one-off, or too unstable to standardize.
- Update project guidance (AGENTS.md / equivalent): the lesson is a repo-wide rule, convention, command, constraint, or definition-of-done issue.
- Modify an existing skill: the task clearly fell into an existing skill’s territory, but the skill missed steps, had vague boundaries, or needed more explicit success criteria.
- Create a new skill: the task revealed a new repeatable one-job workflow with stable triggers, inputs, outputs, and checks.
- Add a script/tool/MCP integration: the workflow depends on deterministic execution or live external context rather than static instructions.

Here’s the actual decision test I’d use after every substantial task:

1. Will this come up again?
If not, no skill.
2. Did the agent need the same long prompt, same steering, or same corrections again?
If yes, that is strong evidence for standardization. OpenAI’s rule of thumb is that if you keep reusing the same prompt or correcting the same workflow, it should probably become a skill.
3. Is this one job, not a grab bag?
Skills should stay focused on a single job. “Review PR against our checklist” is a skill. “Do frontend work” is garbage.
4. Can you state exactly when it should and should not trigger?
If you cannot write a sharp boundary, you do not have a good skill yet. In Codex, implicit invocation depends heavily on the skill’s description, and vague or overloaded descriptions hurt triggering reliability.
5. Can you define inputs, outputs, and a checkable definition of done?
If success is fuzzy, the skill is premature. OpenAI explicitly recommends clear inputs/outputs and a concrete definition of done.

That gives you the distinction you asked for:

Use a skill when the current task clearly matches an existing skill’s trigger and boundaries. In Codex, that can happen explicitly or implicitly via the description match.

Create a skill when the completed work uncovered a workflow that is:

- likely to recur,
- narrow enough to be one job,
- stable enough to describe,
- and testable enough to verify.

Modify a skill when an existing skill was almost right, but this ticket exposed one of these failures:

- missing prerequisite checks,
- missing validation steps,
- unclear “when not to use this,”
- insufficient references/assets,
- or ambiguous scope that overlaps another skill.
That last one matters because skill selection relies on metadata and descriptions, so blurry overlap makes invocation worse.

Update AGENTS.md / repo instructions instead of a skill when the lesson is not a workflow but a standing rule: how to run tests, preferred package manager, review expectations, forbidden actions, where docs live, what “done” means, and similar repo norms. OpenAI’s docs explicitly place those in AGENTS.md, and even recommend updating guidance when repeated mistakes show up.

Use a tool/script/MCP instead of a pure skill when the job depends on live, changing, external information or needs deterministic execution. OpenAI’s guidance is to use MCPs when the needed context lives outside the repo or changes frequently, and to add tools when they remove a real manual loop.

My strong opinion: most teams create too many skills and too few sharp ones. A skill should not be a scrapbook of everything learned on a ticket. It should be a small operational contract: “when this kind of task appears, do these steps, use these references, and verify these outcomes.”

A very practical post-ticket rule is this:

- One-off weird fix → nothing
- Repo-wide rule learned → AGENTS.md
- Existing repeatable workflow needed correction → edit that skill
- New repeatable workflow discovered → new skill
- Workflow needs live systems or deterministic commands → tool/script, maybe wrapped by a skill

A few concrete examples:

- “In this repo, always run pnpm lint && pnpm test before finishing” → project guidance, not a skill.
- “Investigate CI failure, collect failing tests, classify root cause, propose minimal fix, rerun targeted checks, summarize risk” → skill.
- “Query Jira + Sentry + Datadog to build an incident summary” → tool/MCP integration, possibly with a skill on top.
- “This bizarre 2018 migration bug took six hours to untangle” → probably no skill.

The best litmus test is: if I saw the same kind of task tomorrow, would I want the agent to follow the same method again with minimal steering?
If yes, you’re in skill territory. If not, you aren’t.