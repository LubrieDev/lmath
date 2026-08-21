# LMath 2.0.0 — The block on a phone

`minAppVersion` stays at **1.13.0**.

Two things make this a major version. **The old `obs-*` block names stop being accepted**, which
1.5.0 announced as this release's job — a note still written ` ```obs-graph ` no longer renders.
And on a phone the block **changes shape**: what used to be the plane with the formula on a card
floating over it is now two faces with a button between them, so anyone who had learnt where
things were has to learn it once more.

## ⚠️ `obs-*` no longer renders

The six blocks were renamed in 1.5.0 (` ```obs-graph ` → ` ```_graph `, and the same for
`_system`, `_derivate`, `_integral`, `_trig` and `_vector`). That release registered both
spellings so nothing broke while people converted their notes, and said plainly that this one
would stop accepting the old ones. It does: only the new names are registered now, and a block
still written the old way shows up as the plain code block it is.

**There is no in-app converter any more**, so this is a rename you do yourself. It is a search
and replace over your vault, and only the fence line changes — nothing inside a block is touched.

The scanner and the rewriter that did it are still in the repository, behind a switch, together
with their 19 tests; what left the interface is the button that called them and the startup
notice that advertised it, which appeared on **every** load for 15 seconds.

---

## A narrow block now has two modes

The plane fills the block, edge to edge. Pressing the **f(x)** button in the bottom-left corner
replaces it with the formula panel, filling **exactly the same rectangle** — same edges, same
size, no margins and nothing of the plane showing around it. Pressing the button again brings the
plane back.

While the formula is showing, everything belonging to the plane is off: the canvas, the 🏠 / **+**
/ **−** column, the ⓘ, the veil of a degenerate block and the vector labels. Two things stay: the
button that returns to the plane, and the **✎** that opens the block's source. The ✎ used to hide
itself when the formula opened; it now stays, because reading what you wrote is exactly when you
may want to correct it.

The button shows where it takes you, not what it closes: **f(x)** while the plane is up, and a
drawn **cartesian plane** while the formula is. The ✕ is gone from these five blocks — a cross
says there is something on top to remove, and there no longer is.

Two details that are not cosmetic:

- **The block does not change height between modes.** The plane keeps setting it, so switching
  never moves the rest of the note.
- **The plane is hidden with `visibility`, not `display`.** Removing it from the layout would
  collapse the canvas to 0×0, the resize observer would react and the camera would recompute its
  framing from the new aspect ratio — coming back would give you a *different* view. As it is,
  going to the formula and back leaves your zoom and pan exactly where they were.

Applies to `_graph`, `_system`, `_derivate`, `_integral` and `_vector`. **`_trig` is not part of
this**: its panel carries a strip of controls at the foot of the plane that a full-block panel
would cover, and that needs its own answer. On a phone it still behaves as it did in 1.5.0.

## When a block decides it is narrow

Until now the only trigger was the container being under 520 px wide. That number was calibrated
on the shape of the **plane** — below it, in two columns, the graph drops under 4:3 and stops
reading as a graph — and it turns out to be the wrong question for a phone: there are phones whose
portrait container is *wider* than 520 px, where the plane passes the check while the formula is
squeezed into a 200 px strip that cannot hold an integral. On those phones none of the above ever
switched on.

There are now two independent triggers: the container being under 520 px (a narrow side panel on
the desktop suffers the same), **or a phone held in portrait**, whatever it measures. In landscape
nothing changes — the same phone gives ~700 px and the desktop layout reads fine there, which was
verified on a real device and asked to be left alone.

## `_vector` could not be panned or zoomed with a finger

`_vector` got a camera in 1.4.0 — one-finger panning, two-finger pinch — and none of it ever
worked on a phone. Its canvas was missing `touch-action: none`, so the browser kept every touch
that started there to scroll the note, and no gesture ever reached the camera. It is set now, so
the block behaves like every other plane.

The same block also gained the **✎** chip (it had none, which on a phone means there is no way to
reach a block's source at all, since Obsidian's `</>` needs a mouse hover), and its **f(x)** is
now the shared one: same corner, same KaTeX glyph, same behaviour as `_graph`. It used to be its
own button in the opposite corner, in plain text, that never changed glyph.

## Dragging a slider no longer drags Obsidian

`touch-action: none` takes the gesture away from the **browser**, and that was enough on the
desktop. Obsidian on mobile has gestures of its **own**, written in JavaScript, and CSS says
nothing to an event listener: dragging a slider moved the handle *and* pulled the sidebar open
behind it.

Touch and pointer events now stop at the slider itself, so a finger that starts on the pill
belongs to the slider and to nobody else; one that starts anywhere else still opens Obsidian's
sidebar as always. This covers **every** slider in the plugin — the parameter sliders and the
angle slider of `_trig` — because they are all the same component.

## The combined view steps aside on a narrow block

In `_derivate` and `_integral` the ☰ menu offers the operator, the result, and both stacked. The
combined view leaves the menu while the block is narrow: the panel is 180 px shorter there and two
formulas would land at ~72 px each, which for an integral with its limits and a Barrow bracket is
not a small formula but an unreadable one. The two single views stay, and switching between them
is one tap.

It is tied to the **width**, like every other layout decision, so a tablet in landscape keeps it.
If you rotate to portrait while the combined view is showing, the panel falls back to the
operator; rotating back returns the option to the menu but does not restore the view, because
recovering a view you are no longer looking at is guesswork.

## `_vector` no longer draws itself under its own buttons

With the zoom fitted to the drawing, `v = (2,1)` put its arrowhead exactly under the zoom-in
button. The automatic framing now answers two separate questions: *what zoom shows this drawing
well* (the rule of before, untouched, including "do not change the zoom over nothing") and *is the
chrome covering it* — and only then pulls back **just enough** to clear the chips.

Keeping them separate matters: folded into one calculation, the chip allowance pushed some
drawings over an internal threshold and the block jumped to the default `[-7, 7]` view, leaving
the vector tiny. This only applies on touch, where the chips are 30 px; with a mouse they are 22
and the framing is unchanged down to the decimal.

---

## Two bugs

**Declaring a parameter left a `_graph` block without a summary.** With a parameter present, the
analytic ⓘ was deliberately stepped aside — it was built once, so moving a slider would have left
it describing a curve that was no longer on the plane. The block fell back to the geometric ⓘ,
which reads the curve through `notablesDeImplicita`, and that requires an equation with **two
sides**. An explicit block has none, so the box said only *"there are notable points the engine
could not determine"* — for every value of the parameter. `(3x-1)/(x²-1) - Ax` reported it, but
so did `x^2 + A`.

The analytic summary now rebuilds itself from the live expression on each final pass, so there is
no longer any reason to step it aside: the block gets the same summary it would get without the
parameter, following the slider. It compares the substituted expression before recomputing, so a
pass that changed nothing costs nothing.

**A vector drawn at deep zoom lost its angle or vanished.** Zoomed in far enough, the endpoints of
a vector land millions of pixels away — the vector still measures (2,1), but a pixel is worth a
millionth of a unit. The canvas rasteriser works in fixed point and stops being reliable there:
the trace came out at a *different inclination*, or did not come out at all. With a 400 px canvas
and a vector of length 2 that starts happening once the view spans less than ~10⁻⁴ units, which a
pinch reaches easily.

The trace is now clipped to the canvas in JavaScript, in double precision, before the canvas sees
it. Only coordinates the size of the block get through, and **the angle is preserved exactly**:
the direction is never rounded, the ends are shortened along the same line. The arrowhead is drawn
only when its tip is on screen, and the same guard covers point marks and the null vector's disc.

---

## `_trig` joins the two-mode layout

The unit circle was the one block left on the old shape: a formula card **posed over** the circle
rather than a second face of the block. On a phone it did not fit. It opened taller than the space
it had and the block clipped it — the first row of the ratio table was cut in half and there was no
way to reach it, because a panel that does not exceed its own maximum never scrolls: it was the
container cutting it, not the panel overflowing.

Two things were wrong, and they had different fixes.

**The ⓘ box now knows how much room it has.** Its height budget was computed once, when it was
created, for a position it no longer occupies: on a narrow block the whole chrome rises above the
controls strip, which leaves 123 px where the budget still said 209. The ceiling now moves with the
panel, so the box fits inside the plane and **scrolls** when its content does not — nothing is
unreachable any more.

**The f(x) panel does not float; it takes the plane's place.** Press it and the block shows the
formula in exactly the rectangle the circle occupied; press again and the circle comes back. This
is the same two-face mode the other five blocks got earlier in this release, with one difference
that `_trig` needed: the panel stops at the **controls strip**. The sin/cos/tan boxes, the θ reading
and the slider are the block's *controls*, not its content, so they stay visible in both modes — a
panel covering the slider on the very device where dragging on a 300 px circle is imprecise would
have traded one problem for another.

Everything else stays too. Only the **ⓘ** steps aside while the formula is up, and it comes back
with the circle; the angle-unit chip and play/pause remain usable. And the button that swaps the
faces shows **where it takes you**, not what is on screen: `f(x)` to reach the formula, and a new
**unit-circle** glyph to go back — the trigonometric counterpart of the cartesian-plane icon the
other blocks use. A ✕ would have been wrong: nothing is posed on top of anything to be dismissed.

**And it finally has a ✎ chip.** On a touch device every block now shows one in the top-left corner
that takes you to the block's source. `_trig` was the last without it: Obsidian's own `</>` needs a
hover that a phone does not have, and the canvas keeps the touches that start on it — which is what
lets you drag the angle — so a `_trig` block rendered on a phone could be read but not corrected.
It arrives as one line because that chip stopped being a private method and became a module; the
two blocks written after that method was born had missed it for exactly the opposite reason.

---

## Numbers now say how much of themselves is real

The crosshair readout and the ⓘ panels print numbers, and every one of them went through the
formatter written for **axis tick marks** — four significant figures, falling to `1.2e+3` above a
thousand. That is the right formatter for a tick, whose job is to be legible. It was the wrong one
everywhere else, in two separate ways.

**The readout collapsed values that differ.** Moving the cursor across a curve, `1.4905` and
`1.4899` both printed `1.49`: two different heights, one reading. A hair over a thousand and the
label gave up entirely — `1234.5` printed `1.2e+3`, which is two significant figures where the
engine holds sixteen.

**A calculated number was printed as if it had been measured.** The Y intercept is `f(0)`: it is
evaluated, not searched for, and arrives with all the precision of a double. It was being rounded
to four decimals like a root found by bisection — `2.99888…` printed `2.9989` — and, worse, the
closed-form recogniser was allowed to snap it from as far as 1e-4 away, so a value that was not 3
could be announced as `3`.

The fix is not a digit count. **A number now carries where it came from**, because "how many of
these figures mean anything" is not a property of the format — it is a property of how the number
was obtained, and only whoever computed it knows:

| Provenance | Figures | Snap tolerance | Examples |
|---|---|---|---|
| **evaluated** | 6 significant | 1e-12 | `f(0)`, the slope at the origin, the limits you wrote on an integral |
| **measured** | 4 | 1e-4 | roots (bisection), vertices and critical points (parabolic fit), areas (quadrature), periods (harmonic fit) |

Axis ticks keep their own formatter, untouched. Three formats, three jobs.

Deciding this one number at a time turned up **six** places where the value is not estimated:
`f(0)`, the slope at the origin (computed on the *symbolic* derivative), the limits of an integral
and the singularities of an improper one (both of them what you typed, compiled), the parameter
interval of a curve, and the analysis window. The one that showed worst: `\int_{0}^{0.00001234}`
used to label its interval **`0 ≤ x ≤ 0`**.

The other thirty-two stay at four figures, and that is the point rather than the leftovers. A root
comes out of a bisection and its fifth figure is noise from the method; showing six would be
showing noise. The two policies now live side by side in the same box — `Slope at x = 0: 0.333333`
above `Critical point: x = 1.4142` — and each is honest about itself.

One last split, between the two places a number is read. The **readout keeps its padding zeros**
(`1.49050`, `1234.50`): the number changes as you move the cursor, and a fixed width is what keeps
`1.49050` and `1.48990` apart and stops the decimal count from jumping. A **panel trims them**
(`0.05`, not `0.0500000`): there the number is static and the zeros only got in the way. Trimming
costs no significant figure — `1.4905` and `1.4899` still read apart.

---

## Under the hood

The chrome the blocks share stopped being copied. The ✎ chip and the jump to the block's source
were a private method of the adapter, which is why the two blocks written after it were born
without them; the f(x) button existed in two versions that had drifted apart. Both now live in one
module each and every block mounts the same one — including the rule that hides the plane's chrome
in formula mode, which is a stylesheet rule rather than a hand-kept list, so a chip added tomorrow
is off by default instead of floating over the formula.

The sampler and the tracer are untouched: no curve is discovered or drawn differently than in
1.5.0. What did change on the analysis side is the formatting of numbers described above, plus the
scene now reporting *how* it obtained the height under the cursor rather than only the height.

**A new symbolic core exists in the repository and does not ship.** `src/CAS/` is a rewrite of the
algebra layer around a real expression type — immutable, hashed, with no strings between stages —
together with an exact numeric tower, a function registry, a structural canonical form, general
algebraic numbers (`x³ = 2` answers `∛2`, not `1.2599210498948732`) and a reader that turns written
notation into an expression directly instead of through 49 regular expressions and a second parser.
It is built, tested and **deliberately not in the production path**: the block you render still
goes through the old engine, and none of these files appear in `main.js` — verified by symbol, not
assumed. It is listed here so the growth in the repository is not a mystery, and because the
boundary tests that keep it separate are part of what this release ships.

## Tests

**974 + 12 + 19 passing**, plus the 220-case CAS battery, a soundness fuzzer with no findings, a
clean typecheck and a clean run of the review audit (no new findings).

Six of those tests cover the deep-zoom clipping directly, including the failing case: a segment
running from (−12M, −6M) to (23M, 11M) must come back inside the canvas **and** with both ends
still on the original line. Another twenty-four cover the number provenance above — the values that
used to collapse, the large and small ones, `f(0)`, the integral limits, and the guarantee that
roots and vertices did **not** move. The rest of the growth is the symbolic core, which brings its
own kind of test: a shared corpus, a golden dump regenerated on demand, a three-valued semantic
oracle that can answer "undecidable" instead of guessing, and boundary tests that fail if anything
outside `src/CAS/` reaches past its façade.

What that does **not** cover, and it is most of this release: the block host has no automated tests
at all. Every mobile behaviour here — the two modes, the buttons, the sliders against Obsidian's
gestures, the framing — was checked by hand on a phone. And the clipping tests prove the geometry,
not the pixels: they run without a canvas, so they show the rasteriser is no longer being handed
coordinates it cannot take, not that your screen looks right.

## Known limitations

- **The angle-unit chip and ▶ keep working while the formula is up in `_trig`**, acting on a circle
  that is not on screen. The animation runs and the unit changes without showing until you go back.
  Deliberate — they are controls, and hiding them would have been the larger surprise — but worth
  knowing before you press play and see nothing happen.
- **`_derivate` and `_integral` with parameters** still hand their ⓘ to the geometric summary,
  which cannot read an expression without an `=`. On an explicit block they will show the same
  "could not determine" line the `_graph` fix removed.
- **The deep-zoom fix is verified as geometry, not on screen.** If a vector still misbehaves at
  extreme zoom, the cause is elsewhere.
- **A vault still written `obs-*` has no in-app way out.** The names are gone and so is the
  converter, so those blocks stop rendering until you rename the fences yourself. 1.5.0 was the
  release that could do it for you.
- **The readout's height still varies with the zoom on curves that have no exact reader.** An
  implicit, parametric or polar curve — and any block holding more than one curve — has no `f(x)`
  to evaluate, so the height is interpolated from the traced polyline, whose density depends on
  the framing. Those readings are marked as measured, so at least they no longer claim six figures
  they do not have, but the number itself still moves. The horizontal reading moving with the zoom
  is *not* this: the crosshair follows a pixel, and a pixel is a different x at every zoom.
- **A measured value smaller than 0.0001 still prints as `0` in a panel.** Four decimals cannot
  show it. Unchanged from before, and it only affects estimated values: the evaluated ones now
  print `1.234e-5`.
- **Writing the same power three ways still draws three curves.** `x^{2/3}` gives the full cusp,
  `x^(2/3)` only its right half, and `x^\frac{2}{3}` is `x²/3` — a different function. The rewrite
  that reads a fractional exponent as a real root only fires when the exponent is in **braces**.
  The new reader reads all three as the root, which is why this is listed rather than fixed: it
  changes what already-written notes draw, and that is a decision, not a patch.
- **`\sin^{-1}x` without parentheses draws nothing.** It is read as the *symbol* `asin` multiplied
  by `x`, which evaluates to NaN everywhere. With parentheses it is correct, which is why it went
  unnoticed. Same reason as above for not fixing it here.
- Nothing in `_trig`, the analysis engine or the tracer changed, so the limitations listed in
  1.5.0 that concern them still stand.
