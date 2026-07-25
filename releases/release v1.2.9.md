# 1.2.9

## A block that froze Obsidian past restarting it, and a plugin that finally has a light theme

One serious bug fix, one long-standing design gap, and two smaller fixes. The
serious one is a graph that could lock the app hard enough to survive quitting
it: reopening the note re-rendered the block and froze it again, so the only way
out was to delete the block with an external editor. The design gap is the light
theme: until now the block was a dark island on a white page, with a formula that
was nearly invisible in it.

- **A block containing `tan(e^x)` froze Obsidian, and reopening the app froze it
  again.** This bug was found during testing on a Redmagic 11S Pro and later
  reproduced on Windows. The cause is arithmetic, not hardware: the plane's very
  first paint runs the *final*, highest-quality pass, and on this function that
  pass generated pathological amounts of work and memory, making the issue
  algorithmic rather than hardware-dependent, regardless of the device's
  performance. Two independent defects met on this one expression. First, the
  explicit sampler had no bound on how much geometry it could produce:
  `tan(e^x)` oscillates at a local frequency of `e^x/π` — about **1.5·10⁷
  oscillations per pixel** at the right edge of the default view — and the
  sampler kept subdividing, ending with **1,084,444 branches and 21,460,279
  vertices after 30.3 seconds and 1.14 GB of heap**. That case is deliberately
  not covered by the high-frequency envelope added in 1.2.6, whose
  **boundedness** test rejects it on purpose: an unbounded function has no band
  to draw, it has asymptotes, and it was handed back to the sampler with no
  limit at all. Second, the deduplication of notable points was quadratic, so on
  that geometry it never finished: over **9 minutes** and still running when it
  was killed, all of it wasted, since a category with more than 30 points is
  discarded whole.

  The sampler now **enforces** a refinement budget tied to *resolution* —
  **2048 vertices per pixel column**, so a phone screen protects itself
  proportionally — and when it runs out the trace does not stop: it stops
  *subdividing* and continues at the base sampling density, which is already
  bounded, so the curve is still drawn end to end without the sub-pixel detail
  that resolves nothing at that scale. The deduplication now indexes points in a
  grid whose cell equals the tolerance, making it linear while returning exactly
  what the exhaustive scan returned. The first render of `tan(e^x)` goes from
  **30 s, 1.14 GB and a pass that never finished** to **705 ms and 112 MB**
  (**378 ms** on a phone-sized canvas).

  Nothing else changes: the budget was calibrated against the existing
  repertoire. The most expensive legitimate case, `tan(x²)` at ±300, uses
  **699 vertices per pixel column**, leaving roughly a threefold safety margin,
  and **240 of 240 traced cases** (20 expressions × 6 zoom levels × both
  passes) come out **bit-identical** to 1.2.8, vertex for vertex, with
  identical notable points. Where the drawing does change is inside the
  pathological stretch itself: past **x ≈ 10.3** the old picture was a saturated
  black rectangle, every pixel of every column painted, and it is now a lighter
  haze over the same region, without a single pixel drawn that was not drawn
  before. **What is lost there is the density of an aliasing smear, not the
  curve itself.**

- **The plugin follows your theme, and the formula is legible in a light one.**
  The block painted itself `#1e1e1e` and never set a text colour, so the formula
  inherited `--text-normal` from the theme: in a dark theme that happens to be
  light text on a dark panel and it worked by accident, and in a light theme it
  was near-black text on a near-black panel — around **2:1** of contrast, where
  4.5:1 is the minimum for legible text. That part was a defect, not a
  preference.

  The fix splits colour in two along the line that matters. The **frame** —
  container, formula panel, buttons, menus, borders — no longer has a colour of
  its own: it derives from Obsidian's own variables (`--background-primary`,
  `--background-secondary`, `--text-normal`, `--background-modifier-border`,
  `--shadow-s`), so the block is made of the same material as the note and works
  with any theme, including community ones, with nothing for us to maintain. The
  **plot's ink** — grid, axes, labels, curves, markers — keeps a palette of its
  own in two hand-tuned versions, because a graph needs *guaranteed* contrast
  between its layers and no theme variable promises that. The only thing the
  theme is asked is whether it is light or dark.

  The light palette is not the dark one inverted. On white the blue `#4f9eff`
  washes out and drops to `#2f6df6`; the grid goes from light grey at 12 % to
  black at 10 %; the axes gain weight, because a faint grey disappears against
  white; and the white halo behind each marker — which separates it from the
  curve on a dark ground — turns dark, since on white a white halo separates
  nothing. Every layer was measured against its own background: axis labels sit
  at 5.03:1 in dark and 5.67:1 in light, and the six curve colours at 5.50–9.30
  and 4.38–5.78 respectively. The six hues are the same in both themes — they are
  the plugin's identity — only darkened for a light ground.

  Switching theme now recolours an open block in place. Curve colours are
  declared by *role* (which equation they belong to) and resolved against the
  active palette when painting rather than when the scene is built, so a theme
  change is a repaint: your zoom and panning survive it.

- **The same function no longer renders two different ways depending on how you
  typed it.** Fractional powers were already drawn as radicals — `x^{1/2}` as
  `√x`, `x^{2/3}` as `∛(x²)` — but that rewrite only recognised an exponent
  written as a quotient of literal integers, so `x^{0.5}` came out as
  `x^{1/2}` in fraction form and `x^{0.5φ}` as `x^{φ/2}`. The decimal becomes a
  fraction *after* the step that does the rewriting, and `φ` is not a digit.
  The decision now happens in the LaTeX writer, where every form passes through:
  `x^{0.5}` and `x^{1/2}` both render `√x`, `x^{1.5}` matches `x^{3/2}`, and
  `x^{0.5φ}` renders `√(x^φ)`. Exponents with a free variable keep their
  exponential form (`e^{x/2}` is not a root), and so do negative ones.

- **The options button now closes the menu it opens.** The ☰ icon stayed the
  same whether the transformations menu was open or closed, so the button gave
  no sign of what pressing it would do. It now turns into ✕ while the menu is
  open, with its tooltip changing to match, and back to ☰ when it closes,
  including when the menu closes by clicking outside it or by applying one of
  its options. The three blocks that have this menu (`obs-graph` /
  `obs-system`, `obs-derivate` and `obs-integral`) all follow the same rule,
  each keeping its own description of what the menu contains.

Both suites pass unchanged: **345 tests** in the main suite and **12 tests** in
the zoom suite.