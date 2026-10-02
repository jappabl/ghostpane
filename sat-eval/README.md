# sat-eval

Offline benchmark: how accurately do small local models answer SAT-style questions, and how
much does each technique (hidden reasoning, majority vote, type routing) raise that accuracy,
at what cost in seconds per question. Runs on stored questions only. It is not connected to
Ghostpane or any overlay, and is not for use during a real exam.

## Setup

```bash
pip install -e '.[dev]'
```

Start Ollama so votes run in parallel and long reasoning is not truncated:

```bash
OLLAMA_NUM_PARALLEL=3 OLLAMA_MAX_LOADED_MODELS=3 OLLAMA_CONTEXT_LENGTH=8192 ollama serve
```

`OLLAMA_CONTEXT_LENGTH` matters: the OpenAI-compatible endpoint cannot set the context size per
request, and Ollama's default can cut off a long chain of reasoning.

## Commands

```bash
python -m sateval validate                                   # check data/questions.jsonl
python -m sateval run --model gemma3:4b --condition C1       # test split by default
python -m sateval run --models gemma3:12b,qwen3-vl:8b,gemma3:4b --condition C3   # strongest first
python -m sateval report runs/<run>                          # rebuild report.md
python -m sateval compare runs/*                             # one table across runs
pytest
```

`run` also takes `--section math|rw`, `--ids m-001,r-004`, `--limit N`, `--split train`.

## Conditions

| # | What runs |
|---|---|
| C0 | Answer immediately. Thinking models get `reasoning_effort: none`. |
| C1 | Reason freely, end with `ANSWER: X`; only that line is graded. Temperature 0. |
| C2 | C1 × 3 samples from one model, temperature 0.7, seeds 1–3, in parallel; majority wins. |
| C3 | C1 × one sample from each of 3 models in parallel. On a three-way split the first model listed wins, so list the strongest (by C1 accuracy) first. |
| C4 | A short call labels the question type, then C1 with that type's method note and 2 worked examples from the **train** split. |
| C5 | C4 + vote: same-model with `--model`, mixed with `--models`. |

C6 (LoRA fine-tune) is not built; it is milestone 7 and only runs if C5 still trails the target.

## Grading

- The last line matching `^ANSWER:\s*(.+)$` counts (case-insensitive; markdown bold around it is ignored).
- Multiple choice: one letter A–D, optionally with its choice text (`D) 14`). `C or D` is unparsed.
- Grid-in: fractions, decimals, negatives, `$`, `%`, `x = 4`, `\frac{}{}` and `\boxed{}` are normalised, then compared within 0.001. Use `|` in `answer` for questions with more than one correct value (`2|-2`).
- No valid line: one retry asking only for the answer line. Still none counts as wrong and is logged as unparsed.
- Thinking models' reasoning is stored but never graded.

## Data

One record per line in `data/questions.jsonl`:

```json
{"id": "m-007", "section": "math", "type": "linear-rate", "difficulty": "medium", "format": "mcq",
 "stem": "...", "choices": {"A": "4", "B": "8", "C": "12", "D": "16"}, "answer": "C",
 "image": null, "source": "hand-written", "split": "test", "explanation": null}
```

`section` is `math` or `rw`. `type` must be a label from `sateval/taxonomy.py`. `split` is `test`
(never used for prompts or training) or `train`. `explanation` is the worked solution shown when a
train item serves as a C4 example. `image` is a PNG path relative to `data/`, and image items are
skipped for models without vision.

The file currently holds 60 original seed items (20 test, 40 train: one test and two train items
per type), enough to exercise every condition but far below the 200/300+ the milestones require.
1600.now cannot be a source: its terms forbid bulk copying "by manual or automated means" and
using its content to evaluate ML models.

Optional: `data/score_table.json` (`{"math": [[fraction_correct, score], ...], "rw": [...]}`, from a
published practice-test conversion table) adds an estimated 200–800 score to each report.

## Output

Each run writes `runs/<timestamp>-<model>-<condition>/` (git-ignored):

- `results.jsonl`: one line per question × sample, with full reply, reasoning, extracted answer, retry and timing
- `questions.jsonl`: one line per question, with the voted answer, agreement, router label, wall-clock and summed call time
- `report.md`: accuracy with Wilson 95% intervals by section and type (types under 70% flagged), median/p90 seconds, unparsed rate, vote agreement with accuracy per level, router accuracy
- `meta.json`: model, condition, settings, git commit
