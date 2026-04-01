# Design: triage-brainstorm skill

**Date**: 2026-04-01
**Status**: Approved

## Problem

External LLM reviews (e.g., ChatGPT Pro architecture reports) produce brainstorming documents with numerous findings — issues, improvements, and feature proposals. These documents need systematic triage against the actual codebase and FOUNDATIONS.md to determine which findings warrant implementation specs. The current process is manual and ad hoc.

## Approach

Single skill (`/triage-brainstorm <path>`) that handles the full pipeline: read brainstorming doc, validate claims against the codebase, classify findings by FOUNDATIONS.md alignment, present a triage table for user approval, write specs for approved items, and update the brainstorming doc with a coverage status table.

## Process (7 Steps)

1. **Mandatory Reads** — Read brainstorming doc, `docs/FOUNDATIONS.md`, scan `specs/` + `archive/specs/` for next available spec number.
2. **Extract Findings** — Parse the brainstorming doc into discrete findings with IDs. Record: claim, proposed fix, architectural area.
3. **Codebase Validation** — Validate each finding's claims against the actual codebase using Explore agents. Flag stale claims, already-addressed items, and misunderstandings.
4. **FOUNDATIONS.md Triage** — Classify each finding as spec-worthy (real gap, aligned fix), deferred (valid but not blocking), or rejected (wrong, already fixed, or violates FOUNDATIONS.md).
5. **Present Triage Table** — Structured table with verdicts and reasoning. Wait for user approval. User can override classifications.
6. **Write Specs** — For each approved spec-worthy finding, write a spec using the project's standard format with auto-incremented numbers.
7. **Update Brainstorming Doc** — Prepend a "Spec Coverage Status" table matching the `agent-dsl-improvements.md` format.

## Guardrails

- FOUNDATIONS alignment is mandatory for every spec
- Codebase truth — no propagation of stale external claims
- YAGNI ruthlessly — only real architectural gaps get spec'd
- No scope inflation — discrete, well-bounded specs; split if too large
- Downstream compatibility — specs consumable by `/reassess-spec` and `/spec-to-tickets`
- External reviewer corrections recorded in specs and brainstorming doc

## Invocation

```
/triage-brainstorm <brainstorming-doc-path>
```

Single required argument: path to a brainstorming document (e.g., `brainstorming/agent-dsl-improvements.md`).

## Outputs

1. Triage table (presented inline for approval)
2. Spec files in `specs/<N>-<slug>.md` for approved findings
3. Updated brainstorming doc with coverage status table

## Downstream Workflow

```
/triage-brainstorm brainstorming/foo.md
  -> produces specs/107-bar.md, specs/108-baz.md
/reassess-spec specs/107-bar.md
  -> validates and refines spec
/spec-to-tickets specs/107-bar.md 107BARPREFIX
  -> produces implementation tickets
```
