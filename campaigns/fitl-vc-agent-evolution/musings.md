# FITL VC Agent Evolution — Musings

**CONTINUATION**: This campaign builds on prior optimization (compositeScore 2.4667, 6/15 wins). Prior history preserved in campaigns/lessons-global.jsonl.

**New engine capabilities since prior campaign**:
- Spec 111: Multi-step preview for operation-granting events (automatic — no profile changes needed)
- Spec 112: `globalMarker.*` refs — observe capability marker states
- Spec 113: `preview.feature.*` refs — evaluate authored state features on preview state

These address the prior ceiling's root causes: the agent couldn't value capability cards or see board-state deltas from events.

