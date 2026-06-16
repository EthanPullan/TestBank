# Building & printing tests

How a saved test becomes a printable document and answer key. All of this lives
in `src/QuestionBankApp.jsx` (build UI in `BuildTab`, assembly in `buildDoc`,
rendering in `PrintView`). Test record fields are tabulated in
[DATA-MODEL.md](./DATA-MODEL.md).

## Flow

```
BuildTab (pick questions + set options)
   └─ onFinalize → finalizeTest(test)
        ├─ stamps lastUsed=today on the chosen questions
        ├─ saves the test record (bank:tests, + tests table if signed in)
        └─ setPrintJob({ test }) → PrintView takes over the screen
PrintView
   ├─ buildDoc(test, questionsById, groups, version)   // "A" and, if twoVersions, "B"
   ├─ optional optimize pass (reflow to fewer pages)
   └─ window.print()  or  download standalone .html
```

## The test record

`finalizeTest` composes the record from `BuildTab`'s `meta` (title, courseLabel,
teacher, dateLabel, instructions, twoVersions, shuffleMC, shuffleOrder, paper,
and `layoutMode`), `carry` (id/seed/createdAt when editing), and `selected`
(the ordered `questionIds`). `layoutMode` (`standard`/`ab`/`opt-a`/`opt-ab`) is
decomposed into the persisted `twoVersions` + `optimize` booleans. A `seed` is
generated once and stored so shuffles are reproducible forever. Full field table:
[DATA-MODEL.md → Entity: Test](./DATA-MODEL.md#entity-test-saved-test).

## `buildDoc(test, questionsById, groups, version)`

Assembles the document for one version (`"A"` or `"B"`):

1. **Resolve** `test.questionIds` through `questionsById`; missing ones are
   filtered and counted (`missing`) — never an error.
2. **Keep stimulus groups together:** consecutive questions sharing a `groupId`
   are merged into one unit so a shared passage/figure/table stays with its
   questions.
3. **Section by type** in `TYPE_ORDER` (`mc → numeric → tf → matching →
   written`); each section gets a letter and the matching `SECTION_TEXT`
   instructions.
4. **Number** questions sequentially and attach per-item shuffle info.

Returns `{ sections, missing, count }`, where each item carries `{ num, q,
mcOrder, rightOrder, stim }`.

## Deterministic shuffling

- **`mulberry32(seed)`** → a small, fast, seeded PRNG; **`shuffleSeeded(arr,
  rng)`** is a Fisher-Yates shuffle over a copy. Same seed ⇒ same order, always —
  so a test reprints identically and an answer key always matches its test.
- The base seed for a render is `test.seed` (≥1). **Version B adds `7919`** so B
  is a different-but-reproducible permutation of A.
- Per-item seeds are derived by offsetting: section order uses `rngBase + typeIdx
  * 101`, MC options `rngBase + num * 31`, matching right-column `rngBase + num *
  53`.
- **`shuffleMC`** shuffles MC option order (both versions). **`shuffleOrder`**
  reorders questions *within each section* — applied to **version B only**, so A
  stays in your chosen order and B is the scrambled twin.

## Two versions (A/B)

When `twoVersions` is set, `PrintView` builds both A and B. They contain the same
questions but (per the seeds above) different option order and, with
`shuffleOrder`, different question order. The **version-B answer key** shows a
mapping back to A's numbering (a "keymap") so a teacher can grade B against A.

## Optimize (tighter layout)

`optimize` (UI `opt-a`/`opt-ab`) reflows questions **within each section** to
minimize page count: a bin-packing pass (`optimizeDoc`/`packPages`) places
question blocks using measured or `estimateHeights` heights against the page's
content height, keeping stimulus groups intact, and reports the pages saved vs the
un-optimized baseline. For A/B, each version is optimized independently.

## `PrintView`

The full-screen print/preview surface.

- **`docMode`** selects what's shown: `A-test`, `A-key`, and (if `twoVersions`)
  `B-test`, `B-key`.
- **Controls:** `margin` (0.5 / 0.75 / 1.0 in), `fontPt` (11 / 12 / 13),
  `spacing` (8 / 12 / 18 px between questions), and `paper`.
- **`PAPER_SIZES`:** `letter` (8.5×11"), `legal` (8.5×14"), `a4` (210×297mm) —
  each with width/height used to compute the printable area.
- **Output:** **Print** calls `window.print()`; **Download** writes a standalone
  `.html` (filename slugged from the title) with `PRINT_CSS` inlined so it renders
  the same offline.

## `PRINT_CSS` / `.exam-doc`

The shared stylesheet (`PRINT_CSS`, also injected into downloaded HTML) styles the
exam under the `.exam-doc` class: Times New Roman serif body, per-question blocks
(`.ex-q`, with `page-break-inside: avoid`), indented MC options, two-column
matching, written-response answer lines, bordered stimulus boxes, and answer-key
styling. A `@media print` block hides the app chrome and applies page margins.
