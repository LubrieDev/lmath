# 1.2.1

## Bug fixes

Patch release fixing two rendering glitches. No graphing math, equation-solving,
derivative, integral, or parsing behavior was changed.

- **Formula panel: no more native scrollbar leaking through.** In Live Preview,
  a redundant native scrollbar (the one with arrows) could appear at the bottom
  of the formula card for wide formulas — most visibly on parametric curves such
  as `(x(t), y(t)) = (5cos t − cos 5t, 5sin t − sin 5t)`. The plugin already
  routes horizontal scrolling through its own thin, faded scroller, and a CSS
  rule was meant to suppress Obsidian's native math-block overflow. That rule was
  losing a specificity tie: Obsidian scrolls the equation with
  `.markdown-source-view.mod-cm6 .math-block > mjx-container` (specificity
  `(0,3,1)`), which edged out the plugin's `.lmath-latex .MathJax` (`(0,3,0)`).
  The neutralization now targets `.math-block .MathJax` (`(0,3,0)` → `(0,4,0)`),
  winning by class count without resorting to `!important` or an unknown
  `mjx-container` type selector.

- **Step functions: no more phantom vertical risers when zoomed far out.** Step
  functions such as `floor(x^2)` and `ceil(x^2)` draw as horizontal treads with
  no vertical connectors. Past a certain zoom-out (roughly when a single unit
  step shrinks below 8 px on screen) the tracer started joining the steps into
  one connected polyline, painting the vertical risers the function does not
  have. The discontinuity cut that removes those risers was gated behind the
  adaptive refinement, which only fires for on-screen jumps taller than 8 px; a
  shrunk step never triggered it. The cut is now decoupled from refinement — a
  jump inside an already-subpixel interval is cut on the strength of the
  two-plateau probe alone — so floor/ceil (and any finite-jump step function)
  stay clean at every zoom level. Smooth curves are unaffected: the probe still
  distinguishes a genuine jump from a steep continuous slope.

Existing behavior is unchanged: the full test suite (314 tests) passes exactly
as before.
