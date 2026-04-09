# Lesson Extraction and Management

## Step 7.6: EXTRACT LESSON (with Curation Gate)

Before persisting ANY lesson, apply the **curation gate** — answer all 3 questions:
1. **Generalizable?** Would this lesson apply to a different experiment in this category, or is it specific to this one change?
2. **Non-obvious?** Does this add information beyond what the accept/reject status already communicates?
3. **Actionable?** Could a fresh agent use this lesson to make a better hypothesis?

If ANY answer is NO, do not persist the lesson. Log in musings: `"Lesson suppressed (failed curation gate: <which question>)"`

**Lesson types** (replaces flat `polarity` field):
- `finding`: a reusable pattern or insight (replaces `polarity: positive`)
- `decision`: a choice between alternatives with rationale
- `experiment`: a tried approach and its outcome pattern
- `question`: an open problem identified during the experiment
- `negative`: a pattern that consistently fails (replaces `polarity: negative`)
- `architectural`: a discovery about the system's structural properties that transcends individual experiments or categories. Architectural lessons bypass the "Generalizable to this category?" curation gate question because they apply across all categories. Curation gate for architectural lessons: (1) Does this reveal a system property not obvious from the code alone? (2) Would a fresh agent benefit from knowing this before starting experiments?

**On ACCEPT** (if curation gate passes): Extract a typed lesson:
```json
{"lesson": "<what pattern worked and why>", "type": "finding", "confidence": 0.7, "source_exp": "exp-NNN", "category": "<category>", "timestamp": "<ISO-8601>", "decay_weight": 1.0}
```
Append to `$WT/campaigns/<campaign>/lessons.jsonl`.

**On 3+ consecutive REJECT in same category** (if curation gate passes): Extract a negative lesson:
```json
{"lesson": "<what approach consistently fails in this category and why>", "type": "negative", "confidence": 0.6, "source_exp": "exp-NNN", "category": "<category>", "timestamp": "<ISO-8601>", "decay_weight": 1.0}
```

**On surprising observations or open problems** (if curation gate passes): Extract a question:
```json
{"lesson": "<what remains unexplained or worth investigating>", "type": "question", "confidence": 0.5, "source_exp": "exp-NNN", "category": "<category>", "timestamp": "<ISO-8601>", "decay_weight": 1.0}
```

**On strategic choices** (if curation gate passes): Extract a decision:
```json
{"lesson": "<why X was chosen over Y and the outcome>", "type": "decision", "confidence": 0.7, "source_exp": "exp-NNN", "category": "<category>", "timestamp": "<ISO-8601>", "decay_weight": 1.0}
```

**On successful meta-review KEEP**: Extract a meta-lesson with `"category": "meta"` and `"type": "finding"`.

**Backward compatibility**: If resuming a campaign whose lessons.jsonl uses the old `polarity` field, treat `polarity: positive` as `type: finding` and `polarity: negative` as `type: negative`.

**Lesson decay**: Every 50 experiments, decrease `decay_weight` by 0.1 for all lessons in `lessons.jsonl`. Prune lessons with `decay_weight < 0.3`.

**Global promotion**: Every 50 experiments (or on campaign completion), promote lessons with `confidence >= 0.8` AND `decay_weight >= 0.5` to `$WT/campaigns/lessons-global.jsonl`. Skip duplicates (same `lesson` text).
