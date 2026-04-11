# Phases 5-6: Synthesize and Validate

## Phase 5: SYNTHESIZE — Rank by Authority Confusion Severity

For each validated finding (two+ signals, scenario-grounded), produce:

- **title**: Descriptive name
- **severity**: Critical / High / Medium / Low (see ranking below)
- **detection**: Lens A / Lens B / Cross-lens reinforced
- **kind**: One of: Protocol | Authority boundary | Bounded context | Projection owner | Capability ledger | Workflow coordinator | Translation boundary | Lifecycle carrier
- **scope**: Which subsystems/modules it spans
- **owned_truth**: What state or invariant this abstraction would own (the single most important field — if you can't name this, the finding is not ready)
- **invariants**: What must always be true when this abstraction is correctly implemented
- **owner_boundary**: Which module/package should own it
- **modules_affected**: Existing modules absorbed, constrained, or simplified
- **tests_explained**: Which scenario families this finding accounts for
- **expected_simplification**: What gets simpler
- **confidence**: High / Medium / Low
- **counter_evidence**: What would falsify this hypothesis. Every finding MUST have this field.

### Severity Levels

| Level | Definition |
|-------|-----------|
| **Critical** | Multiple subsystems write the same truth with no single owner. Fixing a bug requires synchronized cross-boundary changes. |
| **High** | Lifecycle transitions scattered across subsystem boundaries (reads centralized), or protocol split so "what"/"when"/"whether" live in different modules. |
| **Medium** | Intra-subsystem scatter with strong structural signals (3+ scattered guards, repeated predicates). Contained but substantial. |
| **Low** | Single-subsystem scatter with moderate signals, or boundary-level fracture with limited blast radius. |

### Ranking Rules

1. Cross-lens reinforced findings outrank single-lens findings at the same signal strength
2. Findings grounded in more scenario families outrank those grounded in fewer
3. Findings with temporal coupling evidence outrank those without
4. Within the same severity level, order by number of affected modules descending

Severity measures impact. Confidence measures certainty. They are orthogonal — a finding can be high-severity but medium-confidence.

## Phase 6: VALIDATE — Survival Criteria + FOUNDATIONS Alignment

Apply two filters, in this order:

**Filter 1 — Survival criteria.** Drop any finding that fails ANY of:

1. It explains at least two tests or one whole scenario family
2. It reduces at least one real architectural cost (not just "cleaner")
3. It can name the owned truth
4. It can name the rightful owner boundary
5. It does not merely wrap existing code with a facade

**Filter 2 — FOUNDATIONS alignment.** For surviving findings only, check against `docs/FOUNDATIONS.md`. For each relevant foundation principle, note whether the finding aligns, strains, or conflicts. Flag conflicts prominently — a finding that violates FOUNDATIONS needs redesign before it becomes a spec.

This ordering matters. Recovery first, judgement second. Do not let FOUNDATIONS bias the detection phases.
