# GRE Quant Mastery 📐

A self-contained, offline-capable web app that takes a learner from zero to a **165+ GRE Quant score**. Clean theory, worked examples, 180+ authentic GRE-style questions, timed tests, and an adaptive learning engine — all running in the browser with no build step, no server, and no account.

## Quick start

Just open **`index.html`** in any modern browser (double-click it). Everything works offline and your progress is saved locally in the browser via `localStorage`.

For guaranteed persistence across sessions you can serve it locally:

```bash
python3 -m http.server      # then visit http://localhost:8000
```

## Features

- **12 modules**, foundations → advanced: Arithmetic, Fractions/Decimals/Ratios, Percentages, Exponents & Roots, Algebra, Linear & Quadratic Equations, Inequalities & Absolute Value, Word Problems, Geometry, Coordinate Geometry, Statistics, and Probability & Counting.
- Each module has **theory + "what ETS tests most" + GRE shortcuts + common traps**, **4 worked examples**, and **12 practice questions** with full solutions.
- **184 questions** in real GRE formats — multiple-choice, **quantitative comparison**, **numeric entry**, and **multiple-answer** — each with a worked explanation.
- **Adaptive gating** — a module unlocks only after you hit the mastery bar (≥70% easy, ≥60% medium) on the previous one.
- **40-question timed Master Test** with an estimated 130–170 scaled score and band interpretation.
- **Spaced repetition** (Leitner system), **weak-topic dashboard**, **mistake redo**, and a per-module **error log**.
- **Searchable formula sheet** covering every high-yield GRE Quant formula.
- Clean, responsive **light theme**, no external libraries or frameworks.

## Project structure

```
index.html        Dashboard: roadmap, progress, weak-topic radar
module.html       Module template (theory, examples, practice, self-test, error log)
test.html         40-question Master Test
review.html       Spaced repetition, weak-topic dashboard, mistake analysis, error log
formulas.html     Searchable formula sheet
css/styles.css    Light-theme stylesheet
js/data.js        Generated question bank (window.MODULES, window.MASTER_TEST)
js/app.js         Engine: progress, gating, spaced repetition, scoring, rendering
js/src/*.json     Source content (one file per module + the master test)
js/src/build.py   Validates all JSON and regenerates js/data.js
```

## Editing content

Edit the JSON in `js/src/`, then regenerate and validate the bundle:

```bash
cd js/src && python3 build.py
```

The build script checks every question (answer-index ranges, types, no duplicate IDs) and only writes `js/data.js` if all checks pass.

---

*Built as a complete study system. All progress stays on your device.*
