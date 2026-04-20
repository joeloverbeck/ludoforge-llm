# GameState Fixtures

## Spec 138 draw-space fixtures

- `spec-138-march-draw-space-seed-1002.json` records the pre-terminal NVA `march` head `chooseN` draw space for failing seed `1002`; the first `march` move exposes `44` head options.
- `spec-138-march-draw-space-seed-1010.json` records the same characterization for failing seed `1010`; the first `march` move exposes `30` head options.
- These fixtures exist to quantify the viable head subset that the guided-completion work in Spec 138 will consume. The viable subset size is the count of `optionOutcomes` entries with outcome `completed`.
- Observed live results on 2026-04-19: seed `1002` shows `44/44` completed outcomes for each captured `march` move; seed `1010` shows `1/30` completed outcomes on the captured `march` move.
