# Version 1.4.0

This release has two halves.

The first is a new block, **`obs-vector`**. Like `obs-trig`, it does not plot a function; unlike
every other block, it shows **one card per line** instead of one formula per block. It typesets
vector notation the way you would write it on paper, and it has an **ⓘ** panel for what *follows*
from what you wrote.

The second is a **math engine**, and it exists to correct a design decision that was wrong. The
solutions a system reported were taken from the **plotted curves** — the crossings of the drawn
polylines, clipped to whatever part of the plane you happened to be looking at. That is why an
intersection at the origin would read `(0, 0)` and then `(8.4e-6, 8.4e-6)` after you moved the
plane, and why a solution outside the view did not exist at all. Asking the drawing something only
the equations know was the mistake. Solutions are now computed from the equations, and for a
polynomial system they are exact and do not change when you zoom. The same defect, smaller, was in
the crosshair; that is corrected for explicit curves and described honestly below.

Around those two there is a third language, **Portuguese**; a fix to the ⓘ panels of `obs-trig` and
`obs-vector`, which closed themselves when you clicked anywhere; and a reorganisation of the source
that changes nothing you can see and is described at the end for whoever reads the code.

No existing block changes its syntax or draws a different curve. The things that do reach the five
published blocks are listed under [Compatibility](#compatibility). `minAppVersion` stays at
**1.13.0**.

---

# The new block: `obs-vector`

## One line, one card

The block has no syntax of options: what a line means comes from the shape it has, and nothing is
resolved for you. **The case of the first letter is the whole rule.**

````
```obs-vector
v = (3,2)
A = (1,2)
F(x,y) = (-y, x)
```
````

| you write | it is | typeset as | drawn as |
|---|---|---|---|
| `v = (3,2)` | a vector — lowercase | `\vec{v}`, the real filled arrow of KaTeX | an arrow from the origin |
| `A = (1,2)` | a point — UPPERCASE | `A`, bare | a dot |
| `F(x,y) = (-y,x)` | a vector field — it has arguments | `F(x,y)`, as written | nothing |
| `AB`, `A->B`, `A → B`, `\vec{AB}` | the vector between two declared points | `\overrightarrow{AB}` | an arrow from `A` to `B` |
| anything else | free notation | as written | nothing |

A name of **two or more letters takes `\overrightarrow`**, not `\vec`. `\vec` is a short mark
centred on one glyph: over `AB` it reads as the arrow of the `A`, with the `B` left outside.
Subscripts and primes decorate a single variable, so `v_1` and `u'` keep `\vec`.

Two things override the case rule, both deliberately: **arguments win**, so `f(x,y) = (-y,x)` is a
field even in lowercase; and **an arrow you wrote yourself wins**, so `\vec{A} = (1,2)` really is a
vector. Writing `\vec{v} = (3,2)` is not doubled up.

A point is **not** drawn as an arrow from the origin. It is a dot. A point is not a position vector
unless you say so, and drawing it as an arrow would state something the author did not write.

## The vector between two points

`AB` on its own line resolves to the vector from `A` to `B`, provided both are declared in the same
block — in any order, so `AB` may come first.

````
```obs-vector
A = (1,2)
B = (5,4)
AB
```
````

That block draws the two dots and the arrow that joins them, and puts the declarations and the
result on two separate views (below). If the two points are **not** both declared, `AB` is simply
the product `A·B` and is typeset as such: the block never invents coordinates you did not write.

## Anything it does not recognise is still typeset

A line the block cannot classify gets its card anyway, which is what makes it usable for notation
the engine cannot evaluate. A LaTeX command LMath does not support is handed to KaTeX untouched
instead of being reported as an unsupported symbol:

````
```obs-vector
\nabla f(x,y)
```
````

**Untouched** is literal, and it applies only to that case. Every other line goes through the
plugin's ordinary pipeline, which normalizes before typesetting and there inserts the implicit
product it thinks it sees between a name and an opening parenthesis. So an unclassified line that
looks like a function call shows a stray `∗`: `∇f(x,y)` with the Unicode symbol comes out
`∇f∗(x,y)`, and `G(x,y) = -y` comes out `G∗(x,y) = −y`. The clean forms are the LaTeX command
(`\nabla f(x,y)`) and, for a function of two variables, a pair on the right — which is exactly what
makes it a field.

Components accept everything the rest of the plugin accepts (`\frac{1}{2}`, `2\pi`, `-\sqrt{2}`,
`3`), and both `(3,2)` and `[3,2]` are read as pairs.

## The plane is always there, and says when it is empty

The view is computed once from the vectors themselves and **has no camera**: there is no panning,
no zooming and no dragging here, because a finite set of arrows is fully known in advance and there
is nothing to explore. Each card and its arrow share the colour of their line.

When no line has numbers to draw, the plane is **dimmed and tells you why** instead of sitting
there empty:

- an empty block says **No vector**, and the card still shows the shape it expects, `\vec{v} = […]`;
- a block that writes something undrawable — a field `F(x,y)`, a gradient `∇f(x,y)`, an unresolved
  `w = u + v` — says **Nothing to draw**. Those lines are typeset above; they simply are not arrows.

An empty plane that says nothing looks like a broken block, and hiding it made the same block look
like two different blocks depending on what you had written.

## The labels are the same letters as the cards

The name beside an arrow is **rendered with KaTeX over the canvas**, not drawn on it. The `\vec{v}`
on the plane is the very same LaTeX as the `\vec{v}` on its card — the same filled arrow, the same
italic — and `\overrightarrow{AB}` keeps the long arrow that stretches over both letters. A canvas
`fillText` can only put the system's italic there, and next to a real formula it shows.

What is not drawn is not labelled either: a field and a free line have no mark on the plane.

## ⓘ — what follows from what you wrote

When there is a plane there is an ⓘ on it. It reports what can be **deduced** from the arrows and
dots already drawn — properties of what is there, not new objects. There is no `u+v` in it, because
you did not write one. That is the same line the cards do not cross, applied to the panel.

- **One collapsible section per vector**, headed by the name you gave it: its `x` and `y`, its
  magnitude, its direction, the quadrant or semiaxis it falls in, and its unit vector. For `AB` the
  components are the difference `B − A`, which is not the pair of any card.
- **With exactly two vectors**, one further section: dot product, angle between them, determinant,
  the area of the parallelogram they span and that of the triangle — and, when it holds,
  *Perpendicular* or *Parallel*. With exactly two points: distance and midpoint.
- **Two and only two.** Five vectors make ten pairs, and the panel would become a matrix nobody
  reads; the block will not choose a pair for you.
- Values are **exact when they were earned**: with integer components the magnitude of `(3,2)` is
  `√13 ≈ 3.606`, with the largest square taken out of the radicand (`√12` is written `2√3`).
  `(0.5, 1.3)` gets the decimal alone. It is the discipline of `obs-trig`, applied to the only
  provenance this block can check.
- Angles are written by the **same function that labels `obs-trig`**, so they follow the *Angle
  unit* setting and come with their exact form when they have one. The angle between two vectors is
  computed as `atan2(|det|, dot)` and not with the arccosine of the textbook formula, which loses
  its precision exactly at 0 and π — the two cases a reader would check first.

## Two views when the block deduces something

A line like `AB` is not of the same order as `A = (1,2)`: the second declares, the first asks for a
result. When both are present, the panel separates them behind the button bar `obs-derivate` and
`obs-integral` already use — the main button shows **what the block declares**, one card each, and
the menu (☰) leads to **`\overrightarrow{AB}` alone**.

It also fixes a matter of room. Stacked, three cards split the column equally and
`\overrightarrow{AB}` — taller than a bare name — was the only one left with a scrollbar. Alone in
its view, a card grows with its content instead of shrinking. The panel is sized for the fullest
view, so switching never changes the height of the block.

A block without a difference has no bar in its panel, which is still the common case.

## How the cards are laid out

Up to four lines, the block grows to fit them. From the fifth on, the cards share the panel height
instead of making the block taller, so a long block gets small cards, each with its own scrollbar.
On a narrow block the whole panel moves behind an `f(x)` button over the plane, as in the other
blocks; it and the ⓘ are mutually exclusive, since they open over the same plane.

---

# What this version deliberately does not do

`obs-vector` writes, draws and reports. It does not **operate**: nothing in it combines two of your
vectors into a third. None of the following is implemented, and nothing in the block hints that it
might be:

- **No operations between vectors.** `w = u + v` is typeset, not resolved — not in the cards and
  not in the ⓘ.
- **No relation between three or more.** The pair sections need exactly two vectors, or exactly two
  points; the block does not pick a pair out of five.
- **No arrow field for `F(x,y)`.** It is not one vector, it is infinitely many, and drawing a single
  one would misreport it.
- **No camera.** No panning, no zooming, no dragging a tip; the ⓘ and the `f(x)` are the only
  buttons on the plane.
- **Two dimensions, Cartesian.** A line with three components — `(1,2,3)` — is not a pair, so it is
  typeset as free notation rather than drawn.

---

# The math engine, and the decision it corrects

## What was wrong

The solutions listed by `obs-system` were not computed from your equations. They were the points
where the **drawn curves** crossed — the intersections of the plotted polylines — and the segments
were clipped to the part of the plane you were looking at before being intersected.

That has two consequences, and neither is a rounding detail:

- **The number depended on the drawing.** `y = x` against `y = x²` meet at the origin. The panel
  said `(0, 0)`, and after moving the plane it said `(8.4e-6, 8.4e-6)` — the same intersection,
  a different answer, because the polyline's corner had landed somewhere else.
- **Which solutions existed depended on the window.** A solution off-screen was not listed, because
  it had been cropped away before anything looked for it.

This was a bad design decision, not a bug that slipped in. Asking the picture something only the
equations know cannot be made accurate by drawing more carefully.

## What it does now

Solutions come from the equations. For a **polynomial system** — lines, conics, parabolas, the
ordinary school cases — they are exact and complete:

- `y = Ax` against `y = x²` gives `(0, 0)` and `(A, A²)`. With `A = -1.5`, the panel reads
  `(-3/2, 9/4)`: the fraction, not a decimal that nearly is one.
- The answer is the **same at any zoom and any pan**, because nothing about the view enters the
  computation.
- Roots are counted with a method that cannot skip one: a double root, two roots almost on top of
  each other, or a solution far from the origin are all found. Reading them off a drawing could
  miss any of the three.

The **ⓘ panel no longer says "In the current view."** for a polynomial system, because the list is
complete over the whole real line and the caveat would be false.

## The same mistake, in the crosshair

The `f(x)` the crosshair showed was interpolated between the vertices of the drawn curve, so it
moved with the zoom: on `y = exp(x)` at `x = 2.1` it read `8.16617` at one zoom and `8.17678` at
another — visible in the third digit. On **explicit** curves (`y = f(x)`) it is now evaluated from
the function and does not move. On implicit, parametric and polar curves it is still interpolated;
see the limitations below.

If the `x` still changes when you zoom with the `+`/`−` buttons, that is not this bug: those zoom
around the centre of the view, so the cursor genuinely ends up over a different point. The mouse
wheel anchors at the cursor and leaves `x` where it was.

## Where it stops

This is a real boundary, not a caveat added for form:

- A system that is **not polynomial** (`y = sin x` against `y = x/2`) is solved numerically over a
  **fixed** interval, `−100 ≤ x ≤ 100`, and the panel says so. Complete inside it; nothing claimed
  outside. Two solutions closer than the sampling step, or a tangency that touches without crossing,
  can be missed. No algorithm enumerates the solutions of an arbitrary system over all of ℝ.
- A system pairing a **non-polynomial implicit curve** with anything (`x²+y²=9` against `y = sin x`)
  says it cannot be solved rather than guessing.
- With three or more equations, what is listed are the crossings **between pairs**, as before. This
  changed where the numbers come from, not what they mean.
- The **markers on the plane** still come from the drawn curves. The difference is millionths of a
  pixel, so you will not see it, but the panel and the marker are no longer computed the same way.
- The crosshair on **implicit, parametric and polar** curves is unchanged, and so is `y = ±√(…)`,
  which is two curves and has no single `y` per `x`.

---

# Domain restrictions, and parameters with sliders

These two answer [issue #1](https://github.com/LubrieDev/lmath/issues/1), which asked for both.

## Where a curve lives

Write the interval in **braces at the end** of the expression. What tells it apart from an ordinary
LaTeX group is the comparator inside, so `x^{2}`, `\frac{1}{2}` and `\sqrt{x}` go on meaning what
they always meant.

| you write | you get |
|---|---|
| `\sin x {0 \leq x \leq 2\pi}` | one period, and nothing outside it |
| `\sqrt{x} {x \geq 4}` | bounded on one side; the other end stays where it was |
| `x^2+y^2=9 {0 \leq y \leq 3}` | the upper half of the circle — an implicit curve takes `x` **or** `y` |
| `(\cos t, \sin t) {0 \leq t \leq \pi}` | half a circle: here the interval *is* the parameter's range |
| `r = 2\cos(3\theta) {0 \leq \theta \leq 1}` | one petal; `θ`, `\theta` and `theta` are the same |

`\leq`, `\le`, `<=` and `≤` all work, mirrored forms included, and the endpoints accept everything
the rest of the plugin accepts — `2\pi`, `\frac{\pi}{2}`, `e`. `\infty` bounds nothing, so
`{x \geq 4}` and `{-\infty \leq x \leq 4}` say the same thing. The clause survives simplifying and
solving: `x^2+y^2=9 {0 \leq x \leq 3}` solved for `y` reads `y = ±√(9−x²), 0 ≤ x ≤ 3`.

**`<` draws exactly what `≤` draws.** The difference is one point, and a point does not occupy a
pixel; claiming otherwise would be pretending to a precision the picture does not have.

Three things it refuses rather than guess: a restriction naming a variable the block does not have
says *Restriction on another variable* and names both; an interval it cannot read says so and
**quotes what you wrote**; and inequalities on their own are still not regions — `y \le x` is
reported as an unsupported symbol. The comparator is accepted inside the braces and nowhere else,
which is what lets the plugin take intervals without promising shaded regions it cannot draw.

## Parameters you can drag

Declare a value on its own line — a name, an `=`, and a constant — and use its name in the formula:

````
```obs-graph
A = 1
\alpha = 1
\phi = 0
B = 2
f(x) = A\sin (\alpha x + \phi) + B
```
````

A **sliders button** joins the bar above the formula panel and switches it to one slider per
parameter. The panel keeps the letters, the plane draws the numbers, and **your zoom and pan stay
where you left them** while you drag — re-framing on every tick would be the view chasing the
curve, and then nothing would appear to move.

`y = 2` is still the horizontal line: `x`, `y`, `r`, `t` and `\theta` are the coordinates the plane
is drawn in, not parameters. `B = 2A` is **not** a declaration — a parameter defined from another
needs a dependency graph — and the line goes on to be whatever it was. A declared name shadows a
constant of the same name, which is what makes the `\phi` of the issue a phase and not the golden
ratio; the rule is general, so declaring `e` costs you the exponential in that block.

Sliders run **−10 to 10** in steps of 0.01, stretching if the value you declared falls outside.
Arrows move one step, Shift+arrow ten, Home and End go to the ends. The drag traces at interactive
quality and refines 150 ms after you let go — the two passes that already govern panning.

**What neither of them does yet.** No syntax for the slider range; no dependency between
parameters; no animation; one interval per equation and one variable per interval; no open
endpoints and nothing marking the boundary on the plane. `obs-derivate` and `obs-integral` take
**neither** restrictions nor parameters — in the first the function is classified before being
derived, so a free `A` would veil the block; in the second the value would be computed from an
expression that still holds the name. Both are fixable and both are a separate job. And moving a
slider does not rewrite your note: re-rendering brings back what you typed, the same invariant as
the angle of `obs-trig`.

---

# Portuguese

The interface is now available in **Portuguese**, alongside English and Spanish. It is the whole
interface — the 252 strings of the tab, the buttons, the tooltips, the ⓘ panels of all six blocks
and the veils that appear when an expression cannot be drawn — not a partial translation that falls
back to English halfway through.

The labels the *engine* produces (`Indefinida`, `Integral divergente`…) are written in Spanish
inside the core, where the tests pin them, and translated at the boundary. That was already true
for English; Portuguese uses the same table, so no test changed.

Two defects were found and fixed while wiring it up, both of them in the settings tab and neither
visible in English or Spanish:

- **Choosing Português left the whole tab in English.** The language was validated against a list
  written by hand (`value === "es" ? "es" : "en"`), so anything that was not Spanish fell to
  English. It now validates against the list of languages itself, which cannot go stale when a
  fourth one is added.
- **The description under the language selector stayed in the previous language.** Obsidian reuses
  a settings row when its *name* has not changed, and the row is called `Idioma` in **both** Spanish
  and Portuguese — byte for byte the same string — so switching between those two reused the row
  along with its stale description. English↔Spanish worked, which is why it took a while to see.
  That row is now written imperatively and its text rewritten on the spot, so it does not depend on
  Obsidian deciding to rebuild it.

---

# The ⓘ panels stay open

In `obs-trig` and `obs-vector`, opening the ⓘ panel and then clicking **anywhere** closed it: on
the plane, on the margin, or on the ⓘ of another block in the same note. With two blocks open, the
first click closed both.

The cause was a listener on `document` that those two blocks registered and the other four never
had. It was copied from the drop-down menu, where closing on an outside click is right — a menu is
in the way until you choose something. A panel of readings is not: you consult it *while* working
with the plane. In `obs-trig` this was worst of all, because dragging the angle closed the very
panel that shows the values the drag changes.

The chip is now the only thing that opens and closes these panels, which is what the ⓘ of
`obs-graph`, `obs-integral` and `obs-derivate` always did. The one remaining exception is
deliberate and unchanged: on a narrow block, opening the floating formula closes the ⓘ, because
they cover the same plane.

---

# Compatibility

No syntax changes, no existing block draws a different curve, and `minAppVersion` stays at
**1.13.0**. These things do reach the published blocks:

- **The plugin now builds for ES2020** instead of ES2018/ES2019, because the exact arithmetic uses
  `bigint`. Obsidian 1.13 is well past that, so nothing should change; but it is a change to how
  the whole plugin is compiled, and it is listed here for that reason.
- **A symbol the engine cannot read is now reported when it is typed as Unicode**, not only when
  written as a LaTeX command. `\nabla` was already flagged; `∇` slipped through and came out
  deformed. This also means `x ∈ R` in an `obs-graph` now gets an *Unsupported symbol* veil where
  before it went quietly blank. Symbols that *are* translated — `·`, `×`, `÷`, `°`, `√`, `∞`, `±`,
  the Greek letters — are untouched, and the `→` of `obs-vector` is exempt like its ASCII twin.

- **Tooltips now appear above the control they describe**, everywhere. Two of them came out below
  and covered what they were labelling — worst on a parameter slider, where the tooltip sat on the
  handle you were dragging. Those two came from a bare `aria-label`: Obsidian builds a tooltip from
  it through a path that does not go through `setTooltip`, and that path defaults to the bottom.
- **Settings apply immediately.** Changing anything on the tab rebuilds the blocks that are on
  screen, instead of waiting for the note to be re-rendered. The cost is stated in the tab itself:
  a rebuilt block goes back to its starting zoom, view and angle. Before, a language change left
  half the interface in the old language until you reopened the note.
- **The slider of `obs-trig` was redrawn** as a pill with a disc running inside it, replacing the
  thin line. It is 8px taller, so the controls strip of a narrow block grew from 78px to 86px —
  without that, the new control was clipped exactly where it matters most, on the phone.
- **The panel toggle shared by `obs-derivate` and `obs-integral` was generalised** to accept a
  *list* of formulas per view, which is what `obs-vector` needs (one card per declared line). Those
  two blocks pass a list of one and behave exactly as before.

Everything else is the mechanical refactor of the previous draft: the panel's layout constants
moved up to module level so the new block can read the same numbers, and the internal split gained
one optional field that only `obs-vector` sets — an explicit height. Left unset, the panel box is
exactly the one of always (`width: 50%`, `height: 261px`). If an existing block does look different
after updating, that is a defect — please report it.

---

# The source was reorganised

Nothing here changes what the plugin does. It is written down because it changes where things are,
and anyone reading the code after this version will find a different tree.

Three files had grown past a thousand lines and were doing several jobs at once:

| | before | after |
|---|---|---|
| `src/host-obsidian/MotorExperimental.ts` | 4045 | **987** |
| `src/despejar.ts` | 1606 | **978** |
| `src/i18n/index.ts` | 1476 | **59** |

`MotorExperimental` turned out not to be a class so much as a namespace: its entire state is three
things — the plugin, which block it is, and a getter for the live settings — and almost none of its
methods touched any of them. So they left, as plain functions:

- `src/host-obsidian/ui/` — the chrome (`estilos`), the small controls (`controles`), the parameter
  slider (`deslizador`), the toggle bar (`menu`), the formula panel (`scrollerLatex`) and the four
  panel mounts (`paneles`).
- `src/host-obsidian/info/` — the ⓘ chips: the ones that describe a formula (`botones`) and the two
  that read the plane as it is now (`plano`).
- `src/host-obsidian/blocks/` — `obs-trig` and `obs-vector` whole, which between them were a third
  of the file and shared nothing with the rest but the frame.
- `src/host-obsidian/contexto.ts` — the six members a block actually needs from the adapter. The
  extracted modules depend on that contract rather than on the class, so there is no import cycle.

`despejar.ts` split into `src/despeje/`: the per-term strategies (`estrategias`), the integer
fractions everyone shares (`aritmetica`), and the final tidying of an already-correct equation
(`presentacion`). Two strategies recurse back into the solver; instead of leaving an import cycle
between the two files, that recursion now enters **through the signature** — the caller passes the
solver in — so it is visible where it happens.

`i18n/index.ts` became one file per language plus the contract they implement, which is what makes
adding a fourth language a new file instead of a longer one.

`GraphEngine.ts` was not touched, moved or renamed, and its SHA-256 is unchanged.

**How it was checked.** The project has no DOM tests — all 658 are pure logic — so a green suite
proves nothing about code that mounts a panel. What was used instead is the **bundle**: after every
stage `main.js` was rebuilt and compared to the previous one, token by token, with the mechanical
substitutions normalised (`this.x` → `motor.x`, esbuild's identifier renumbering). Every stage came
out the same way — **not one token disappeared**; the only additions were the `function` keywords of
the methods that became free functions and the parameters made explicit. That, plus the four
suites, is the strongest evidence available here, and it is worth saying plainly that it is evidence
about the *emitted code*, not about anything rendering correctly on screen.

---

# Validation

- Main suite: **646 passed, 0 failed** — 46 for `obs-vector`, 48 for the math engine, 10 for the
  crosshair reading.
- Zoom suite: **12 passed, 0 failed**.
- CAS battery: **220 towers, 0 failures** — soundness, completeness, domain, representation.
- Differential fuzzer: **0 unsound** across its 13 families.
- Typecheck: clean. Build: clean at the new ES2020 target.
- Review audit: **0 findings**. CSS audit: clean.

> **Not covered by any of it:** the settings tab and everything that draws. The Portuguese fix, the
> ⓘ fix and the reorganisation of the host all live in code no test reaches. They were checked by
> reading, by the bundle comparison above, and on screen.

> That count covers everything in the tree, the domain restrictions and the parameter sliders
> included: their draft notes were merged into this file rather than quoting three different
> totals.

The tests cover the parser, the deductions and the framing. Among them: that the case of the first
letter decides the genre, and that arguments and a hand-written arrow override it; that `AB`
resolves only when both points are declared, and is a product otherwise; that `(3,2)` and `[3,2]`
are the same pair; that a three-component line falls back to free notation instead of being drawn;
that a name of two letters is labelled `\overrightarrow` and one of a single letter `\vec`; that
the magnitude of an integer pair comes out exact and simplified, that the null vector reports no
direction, that two parallel vectors give an angle of exactly 0 and two perpendicular ones π/2, and
that the pair and point sections appear only with exactly two of each; and that the view zooms out
for a vector that does not fit, zooms in for one too small to see, corrects the horizontal extent
by the aspect ratio, and is left alone when there is nothing to frame.

For the math engine, the tests fix the properties that justify it rather than a list of answers:
that the origin comes out as an exact `0`; that a **double root** is found (no sign-change sweep
can see one); that two roots `0.002` apart are both found where a `0.02` step would see neither;
that a solution at `x = 12345` is found although it lies outside any fixed range; that a candidate
the elimination produces but the real plane does not contain is **rejected**; and that a system
carrying a domain restriction is solved and then clipped. For the crosshair, that zoom and pan do
not change the value, that it equals the direct evaluation exactly — and, so the test is not
vacuous, a measurement confirming the old interpolated reading *did* vary with the zoom.

**What the tests do not cover.** The block host has no automated tests in this project — the suite
covers the engine, not the adapter — so the split of the block, the card heights, the floating card
on narrow blocks, the position of the KaTeX labels, the ⓘ popover, the view toggle, **the veil over
an empty plane** and **every pixel the renderer draws** are checked by eye and by reading the code,
not by a suite. That includes the solutions panel itself: what is proven is that the engine returns
the right numbers, not that the popover prints them. The changes that reach the published blocks
are likewise verified by eye. No performance figure is claimed for this release.

---

# Known limitations

- **The view cannot be moved.** It is computed once from the vectors, so whatever the framing leaves
  tight stays tight: with several arrows in a small block, the labels have no camera to escape to.
- **From the fifth card on, the cards shrink** rather than the block growing. Each keeps its own
  scrollbar, but a block with many lines gets small cards. The two-view toggle only relieves the
  case that mixes declarations with an `AB`: four declared vectors still share one column.
- **The pair sections need exactly two.** With three vectors the ⓘ describes each one and says
  nothing about the relations, which is a deliberate refusal, not a missing feature.
- **Exactness requires integer components.** `(0.5, 1.3)` gets the decimal alone even where a closed
  form exists: the block only claims exactness for the one provenance it can check.
- **`AB` needs both points in the same block.** There is no memory between blocks, so a point
  declared in a different block is not in scope, and `AB` degrades to the product `A·B`.
- **A point is drawn as a dot, never as an arrow.** This is deliberate, and it is worth stating
  because a reader used to position vectors may expect the arrow.
- **Two-dimensional only.** `(1,2,3)` is not a pair; it gets a card and no drawing.
- **An unclassified line can still pick up a stray product sign.** The passthrough covers only lines
  carrying a symbol the engine cannot read; everything else is normalized first, and a name followed
  by `(` gains a `∗`. It shows in `G(x,y) = -y` — a function call whose right-hand side is not a
  pair, so not a field — typeset `G∗(x,y) = −y`. (`∇f(x,y)` had the same problem and no longer does:
  Unicode symbols are now recognised as unsupported, like their backslash twins.) This is a wart of
  the shared pipeline, not of the block, and it is why the field genre exists at all: it is what
  keeps `F(x,y) = (-y,x)` from being read as a product.
- **Rebuilding on a settings change resets the block.** Zoom, pan and the angle of an `obs-trig` go
  back to their starting values; the tab says so.
- **The math engine's boundary is real**, and it is described in full above: a non-polynomial system
  is searched over a fixed interval and says so; a non-polynomial implicit curve is declined rather
  than guessed at; above degree 8 the exact path steps aside; with three or more equations the list
  is still pairwise; and the markers on the plane still come from the drawn curves.
- **The crosshair is only half fixed.** Explicit curves now read an evaluated `f(x)`. Implicit,
  parametric and polar curves — and `y = ±√(…)`, which is two curves — still read the drawn
  polyline, so their last digits still move with the view. Refining those onto the curve is not
  implemented.
