# Version 1.3.1

This release touches three areas: the **explicit tracer's geometry budget**, the **algebra and
notation of the panels**, and the **ⓘ information panel**, which now describes polar curves,
parametric curves, integrals and derivatives on their own terms instead of with categories
borrowed from `y = f(x)`.

The common problem behind all three is the same: results that were *correct* but not *usable*.
The tracer spent a correct budget in an order that made two passes disagree; the panel printed
values that were exactly right and unreadable (`7.0710678118654755` for `√50`, `1.5708` for
`π/2`); and the ⓘ panel answered cartesian questions about objects that are not cartesian curves
— it told you where the integrand of `∫₀² 2x dx` crossed the y axis, which is a fact about a line,
not about the integral the block is there to compute.

What a user notices: less flicker when releasing a drag on dense curves, expressions written the
way a person writes them, and an information panel that describes the object in front of them.
Two changes affect existing notes — one alters what a block draws, the other raises the minimum
Obsidian version. See **Breaking changes**.

---

# What changed?

## Graphics engine and tracer

**Before.** 1.2.9 capped how much geometry the explicit tracer may emit, so `tan(e^x)` could no
longer take Obsidian down. The ceiling was right; its distribution was not. It was a single
global bag of `anchoPx × 2048` vertices, spent in sweep order, left to right.

**Now.** Each pixel column carries its own quota. The bar per column is the same 2048, so the
total ceiling does not rise — density in one place can no longer borrow from another.

**Why the old scheme was visible.** The point at which the bag ran dry depended on how many base
samples a pass had, and the interactive pass and the final pass do not have the same number. They
exhausted it at different values of x and truncated different branches, which is flicker arriving
exactly when you release the mouse. Measured over the canvas:

| view | pixels changed between gesture and final image |
|---|---:|
| `tan(x²)` at ±300 | 14.2 % |
| `tan(x²)` at ±200 | 3.5 % |
| `tan(e^x)` default | 9.9 % |

(Those three are measurements of the **old** code, taken while the defect existed. They are not
reproducible from this build for the obvious reason, and are quoted as the reason the change was
made, not as evidence of its result — for that, see the pixel maps under **Validation**.)

In the last one the gesture pass drew *more* than the final one — detail appeared while dragging
and vanished on release, the opposite of what a final pass is for. Views where the budget never
bites, which is the whole ordinary repertoire, were unaffected then and are unaffected now.

**A fairer split of the same ceiling also does less work**, which is not obvious. The old bag
was genuinely being spent to the last vertex: in `tan(e^x)`'s default view, 768 px × 2048 is
1 572 864 and the tracer emitted **1 573 289**. With a per-column quota only the dense columns
hit the bar and the sparse ones never spend what they do not need: **521 914** vertices, 67 %
fewer, for a nearly identical drawing. It also bites locally where a global bag noticed nothing:
`tan(x²)` at ±120 was nowhere near the old ceiling and still emits **9 % fewer** vertices while
painting **exactly the same pixels** — that refinement was sub-pixel work inside crowded columns.

**Two of the thirty-four bench cases draw differently**, both in the pathological zone.
Everywhere else the pixel map is identical, hash for hash, for less work.

| case | pixels | branches | asymptotes |
|---|---|---|---|
| `tan(x²)` ±300 | 129 861 → 136 300 (+5 %) | 11 914 → 10 770 | — |
| `tan(e^x)` default | 72 313 → 91 908 (+27 %) | 23 740 → 18 228 | 23 734 → 6 385 |

The asymptote drop deserves stating plainly: `agotado` decides not only how much geometry is
emitted but also whether a pole is recorded as an asymptote and whether a continuous crossing is
joined instead of split, so stopping earlier in a column registers fewer. In that view they were
31 per pixel of width and are now 8 — still denser than the screen can separate, but **whether
this is visible has not been verified**, and the asymptote overlay draws outside the saturated
band as well as inside it. This is the one open question in the release.

## Algebra and symbolic simplification

### Exact constants recovered from decimals

**Before.** Recovering an exact constant scanned a **table of `√k` for k = 2…40**. Inside the
table it worked; one step outside, the decimal went to the screen. `√50`, `√72`, `√300`, `√20+√5`
(which is `√45`) and every cube root that has ever existed were outside it.

**Now.** Arithmetic instead of a catalogue: square the number and see whether an integer comes
back. That covers all k rather than the first forty, extends to cube roots for free, and costs
one multiplication.

### Rationalisation limited to fractions people write

**Before.** `simplify` turns every decimal into an exact fraction with a factory denominator
limit of **10 000**. A four-digit denominator is the decimal expansion wearing a hat.

**Now.** Lowered to **64**. Everything genuinely written by hand survives — `0.5`→`1/2`,
`2.5`→`5/2`, `0.125`→`1/8`, `1.75`→`7/4`, `0.0625`→`1/16` — and `0.5637` is left as typed.

| you write | before | now |
|---|---|---|
| `√20` | `√20` | `2√5` |
| `√50` | `7.0710678118654755` | `5√2` |
| `√20+√5` | `6.708203932499369` | `3√5` |
| `∛54` | `3.7797631496846193` | `3∛2` |
| `√(20x)` | `√(20x)` | `2√(5x)` |
| `x^{0.5637}` | `\sqrt[10000]{x^{5637}}` | `x^{0.5637}` |
| `(x^{0.5637})²` | `\sqrt[5000]{x^{5637}}` | `x^{1.1274}` |
| `√2/2` | `1/√2` | `√2/2` |

That last row ran backwards: the reciprocal was returned **unrationalised**, so writing the
correct form produced the incorrect one and Simplify stopped being a no-op on its own output.

Pulling a square factor out of a radical is exact and does not move the domain (`20x ≥ 0` and
`5x ≥ 0` are the same condition), so no curve changes. `√(2)^√2` correctly stays a decimal — it
is not `a·ⁿ√b` in any form, and the recogniser says so instead of guessing.

### Radicals are drawn only when they read better than the power

**Before.** The emitter's rule was "a rational exponent becomes a radical", with **no ceiling on
the index**; the rationalisation limit above was doing all the work. Writing the fraction
yourself still produced `x^{5/64}` → `\sqrt[64]{x^{5}}` and `x^{7/32}` → `\sqrt[32]{x^{7}}`.

**Now.** Two ceilings, applied to the radical that would actually be painted:

- index **≤ 5** with a power inside;
- index **≤ 8** for a *pure* root, which has no exponent to read on top — `\sqrt[8]{x}` is fine,
  `\sqrt[8]{x^{7}}` is worse than `x^{7/8}` and is exactly the trade being avoided.

The 5 rather than a rounder 4 is a deliberate trade-off: `y^{2.5} = x ⇒ ⁵√(x²)` is a case this
same release adds, and a ceiling of 4 silently removed it. Where the readability argument cannot
separate two options, not regressing an existing decision wins.

The purpose of a ceiling is **stability**: under the old rule an expression's appearance depended
on whether the rationaliser happened to find a fraction, which is an internal detail.

Irrational exponents are also left alone now. `x^{π/2}` used to be painted `\sqrt{x^{π}}`, which
is true and not what anyone writes: the radical is the canonical notation for a *rational*
exponent, where `p/q` means "q-th root of the p-th power", and the `/2` in `π/2` is ordinary
division, not an index. Same for `φ/2`, `e/3` and `τ/4`. Consistency is preserved in the other
direction: `x^{0.5φ}` and `x^{φ/2}` still render identically.

### Radicals finish the job

**Before.** Converting a rational power to a radical was the only rewrite. `\sqrt[4]{x^{11}}` is
correct and nobody writes it.

**Now.** The Euclidean division `m = q·k + r` pulls every perfect power out of the radicand, and
a negative rational exponent becomes the reciprocal of the radical.

| you write | before | now |
|---|---|---|
| `x^{3/2}` | `\sqrt{x^{3}}` | `x\sqrt{x}` |
| `x^{7/2}` | `\sqrt{x^{7}}` | `x^{3}\sqrt{x}` |
| `x^{11/4}` | `\sqrt[4]{x^{11}}` | `x^{2}\sqrt[4]{x^{3}}` |
| `x^{5/4}` | `\sqrt[4]{x^{5}}` | `x\sqrt[4]{x}` |
| `(2*x)^(5/2)` † | `4\sqrt{2}x^{2}\sqrt{x}` | `4x^{2}\sqrt{2x}` |
| `(3*x)^(7/2)` † | `27\sqrt{3}x^{3}\sqrt{x}` | `27x^{3}\sqrt{3x}` |
| `x^{-1/2}` | `x^{\frac{-1}{2}}` | `\frac{1}{\sqrt{x}}` |
| `x^{-5/2}` | `x^{\frac{-5}{2}}` | `\frac{1}{x^{2}\sqrt{x}}` |

† The two composite-base rows hold for that spelling only; written `(2x)^{5/2}` with braces the
panel shows `4\sqrt{2x^{5}}`. The reason, and what it would take to close it, are at the end of
this section.

Written as a decimal the result is identical: `x^{1.5}` and `x^{3/2}` are the same function and
now look it. A negative **integer** exponent stays a power, because `x^{-2}` is already how that
is written.

**Composite bases stay composite.** `simplify` distributes a power over a product, turning
`(2x)^{5/2}` into `4·2^{1/2}·x^{5/2}`, and the panel painted `4√2·x²√x` — two loose radicals
where one is written by hand. It also contradicted the plugin's own convention, since `√(20x)`
is left as `2√(5x)`. Reaching `4x²√(2x)` needed no new machinery, only the right order: the
Euclidean extraction moved **from the emitted LaTeX to the tree**, so splitting `x^{5/2}` into
`x²·x^{1/2}` as nodes leaves that `x^{1/2}` visible to a second pass, which merges radicals of
equal exponent and finds `2^{1/2}` beside it. On the finished string that `√x` was text and
could not be touched.

**Merging radicands is guarded, not free.** `√a·√b = √(ab)` fails when both are negative
(`√(−1)·√(−1)` is NaN while `√1` is 1). One radicand being provably non-negative is enough: then
`ab < 0` can only come from the other, which was already NaN, and both sides agree. So `√2·√x`
merges and `√x·√(x−1)` does not.

**The same rule had to be taught the other spelling.** A braced exponent never reaches these
passes as a power: the parser turns `x^{3/2}` into `sqrt(x^3)` first, and deliberately — a root
returns the real value for a negative base where one exists (`x^{2/3}` at x < 0) while the power
returns NaN. The consequence was that the rules above, which look at `^` nodes, never saw the
form most people type: `x^{3/2}` printed `√(x³)` while `x^{1.5}`, the same function, printed
`x√x`. The extraction now recognises a root of a power as the rational exponent it is, with two
guards where the identity stops holding:

- **An even index with an even exponent is left alone.** `⁴√(x⁶)` is defined on all of ℝ and is
  positive; the extracted `x·⁴√(x²)` is negative for x < 0. The absolute value an even root
  carries would be lost. With an odd exponent there is no case (the radicand already forces
  u ≥ 0) and with an odd index there is none either (the root keeps the sign).
- **Above the index ceilings the form changes to a power only for an even index**, which is where
  root and power share the domain u ≥ 0. With an odd index the root exists on the negatives and
  the power does not, so `x^{5/9}` keeps its radical while `x^{5/64}` becomes a power.

One case stays spelling-dependent: `(2x)^{5/2}` written with braces arrives as `√((2x)⁵)`, and
`simplify` pulls the constant out to `4√(2x⁵)` — the perfect power now sits *inside a product*
under the radical. Extracting from a product radicand is a further step this release does not
take, so that row of the table above holds for `(2*x)^(5/2)` and not for the braced spelling.

### Trigonometric identities

Five rules were added — the Pythagorean identity and three parities — under the bar this list has
always had: **true on all of ℝ**. `tan(-x)` and `-tan(x)` have the same poles, so the domain is
preserved exactly. Deliberately left out: anything true only on an interval (`arcsin(sin x) = x`
is false outside `[-π/2, π/2]`) and anything that changes shape without reducing (`2 sin x cos x
= sin 2x`).

## Solver

- **`y^{0.5} = x−3` was not solved while `√y = x−3` was.** The solver only recognised **integer**
  exponents ≥ 2, so the answer depended on how the question was typed. A non-integer power is
  defined only for `y ≥ 0` (`Math.pow(-8, 1/3)` is `NaN`) and is strictly increasing there, hence
  injective, so the inverse `y = R^{1/e}` is unique with no second branch, under the guard
  `R ≥ 0` that `√y = R` already carried. Both spellings now produce identical output, character
  for character. Examples: `y^{3/2} = x+1` → `∛((x+1)²)` with `x ≥ -1`; `y^{2.5} = x` → `⁵√(x²)`;
  `y^{0.5637} = x` → `x^{1/0.5637}`, keeping the exponent as typed.

- **`(y−1)² = x` came out as `(2 ± 2√x)/2`.** A shifted parabola is the most common exercise there
  is, and the panel showed the quadratic formula's raw output. Cause: `(y−1)²` is expanded to
  `y²−2y+1` before solving, so the perfect square is gone, and no formatting pass reduced the
  fraction afterwards because they all treat the `±` sentinel as opaque. The new pass reaches
  inside it. Now `(y−1)² = x` → `1 ± √x`, `(y−3)² = x` → `3 ± √x`. Only **positive** common
  factors are cancelled: dividing by a negative one would swap `±` and `∓` and break their
  pairing.

- **`√20·y = x` came out as `y = 0.22360679774997896x`.** Of the panels that finish by recovering
  exact constants, the solver was the only one that did not. It now gives `y = (√5/10)x`. This
  runs on the **panel path only** — `despejeExplicito`, which feeds the tracer, calls the solver
  directly and bypasses it, so no typography change can move a pixel. When re-symbolisation finds
  nothing, the string is returned untouched rather than re-serialised (mathjs would respace `^2`
  to `^ 2`, and that string is the canonical form the project chains and compares).

## Parsing and notation

### One internal spelling for every logarithm

Natural log was represented internally as mathjs's `log(u)`, a form that **does not survive a
second trip through the parser** — and the project's strings do make that trip, since
`bloqueALatex` re-normalises whatever Simplify, Solve and Integrate hand it. With the old
representation `ln x / ln 10` was painted `\log_{10} x / \ln 10`: half the expression changed
meaning on the way to the screen. Every producer of a natural logarithm now writes its base
(`log(u, base)`): the solve of `e^y=x`, the integral of `1/x`, the re-symbolisation of `0.693…`,
the exact-area catalogue. The solver learned the general inverse `log(u,b) = t ⇒ u = b^t`,
without which `ln(y)=x` stopped being solvable at all. The LaTeX emitter renders base `e` as
`\ln`, never `\log_{e}`, because that base is an internal detail.

### Logarithms kept exact

`log(2)` showed `0.3010299956639812`. Writing the base is not enough: mathjs **folds**
`log(2, 10)` because both arguments are constants, while leaving `log(u, e)` alone because `e` is
a symbol — which is exactly why `\ln 2` was already exact and `\log 2` was not. The exact form is
now recovered from the decimal the same way `√2` is: raise the base to the value and see whether
an integer comes back.

A second defect was chained to it: `fraccionExacta` accepted denominators up to **a million**, so
`log(2)+1` (that is, `1.30102999…`) became `423026/325147` *before* re-symbolisation saw it, and
the panel showed `\frac{4.23026\cdot 10^{+5}}{3.25147\cdot 10^{+5}}`. Lowered to 64, the same bar
used elsewhere in this release. `log(2)+1` now reads `\log_{10} 20`.

### Unicode surface checked by value

The input surface was checked by **evaluating** it, not by confirming it does not crash — a
notation that is accepted and quietly computes something else is worse than one that fails.
Greek letters, operators (`× · ÷ − – —`, including the typographic dashes that arrive from a
copy-paste), roots and superscripts (`√ ∛ ∜ ² ³ ⁴ ⁻¹ ⁻²`), vulgar fractions (`½ ¼`), delimiters
(`|x| ⌊ ⌋ ⌈ ⌉`) and nineteen standard functions (`sqrt cbrt nthRoot exp abs sign floor ceil round
max min mod gcd hypot sinh atan2 asin sec x!`): **69 correct, zero computing a different number**
once the logarithms were fixed.

Two gaps closed: **`τ` and `φ`** were left as free symbols, so `τ` evaluated to `NaN` rather than
6.283 and the plane came out empty in silence — the same failure `π` and `θ` had before they were
translated.

## Visualization: the ⓘ panel

### Numbers

The panel printed `v.toFixed(4)` directly, which produced three different problems that are easy
to conflate and should not be, because only one is about formatting:

| what appeared | what it should read | what was actually wrong |
|---|---|---|
| `1.0000` | `1` | padding: an exact value dressed in dead zeros |
| `2.9999` | `3` | **not formatting** — the value itself arrived with error |
| `1.5708` | `π/2` | the number is right and the answer is useless |

The middle row matters most. Notable points come from *numeric* work — bisection for roots, a
parabolic fit for vertices — so a vertex whose true position is 3 lands at 2.99994 and
`toFixed(4)` prints that faithfully; no amount of trimming digits fixes a value that was already
off. The third row is not a precision problem at all.

All three now go through one recogniser that looks for the simplest closed form explaining the
value: integer, then rational multiple of π, then a plain decimal without padding. The tolerance
is **1e-4**, chosen to match the actual error of those estimators and the last digit the panel
can show — below that scale the panel cannot distinguish 3 from 2.99994 in the first place, so
the snap asserts nothing the number did not already say. The recogniser declines when there is
nothing to find: `1.1` stays `1.1`, `1/3` stays `0.3333`, `3.2` is not mistaken for π. A value
landing within 1e-4 of `p·π/q` with `q ≤ 16` by accident is roughly a one-in-a-thousand event,
and the error introduced when it happens is below what is displayed.

This applies to the existing cartesian panel too, which is where it was noticed.

### Polar curves

**Before.** A polar block fell into the cartesian summary: Y-intercept, roots in x, vertices, all
qualified "in the current view". On a rose that is not merely thin but misleading — "crosses the
Y axis at 1.1" says nothing about `r = 1 + 0.1·sin(8θ)`.

**Now.** A panel built from r(θ) rather than from the plotted polyline:

```
Polar curve
Repeats every π/4 · 8-fold rotational symmetry
Symmetry: about the pole
Radius: 0.9 ≤ r ≤ 1.1
Max at θ = π/16, min at θ = 3π/16 (+ k·π/4)
Does not pass through the pole
Swept area over 2π: 3.1573
```

Four design decisions, each a place where the obvious implementation would have been wrong:

- **The period shown is not the period the tracer uses.** They answer different questions.
  `dominioPolar` computes the period of the *curve* — when the stroke closes, `LCM(P_r, 2π)`,
  here 2π — because that is what the tracer needs. The panel shows the period of r as a *scalar
  function*, π/4, because that describes the **shape**. Both come from the same symbolic scan,
  now factored out rather than duplicated, so they cannot drift apart. A period of exactly 2π
  with no internal repetition is not printed: every polar curve closes on a full turn, so the
  line would distinguish nothing.

- **The area is the SWEPT area and is labelled as such.** `½∫r²dθ` equals the enclosed area only
  when the curve neither retraces nor overlaps. The rose `r = cos(3θ)` traces its three petals
  **twice** over [0, 2π], so the integral returns π/2 where the petals enclose π/4 — off by
  exactly the retrace factor. Roses are the most typical content of a polar block, so "enclosed
  area" would have been wrong in the common case. Where nothing is retraced the two coincide:
  the cardioid `r = 1 + cos θ` reports 3π/2, its exact area.

- **Families are recognised from the harmonics of r, not from how the expression is typed.**
  `1 + cos θ`, `cos θ + 1` and `2cos²(θ/2)` are the same cardioid. r is projected onto a Fourier
  basis and classified by its coefficients: a constant term alone is a circle centred on the
  pole; a single harmonic *n* with no constant is a rose with *n* petals for odd *n* and 2*n* for
  even; a constant plus the first harmonic is the limaçon family, with `|a₀| = A` the cardioid
  and `|a₀| < A` the inner loop. When a measurable residue remains, the answer is **no family** —
  which is correct for the example above, since a rippled circle has no classical name.

- **Symmetries found are stated; symmetries not found are not denied.** The classical tests are
  *sufficient*, not necessary — a curve can be symmetric and fail its test, because (r, θ) and
  (−r, θ+π) are the same point. The panel lists what it verifies and stays silent otherwise; it
  never writes "no symmetry". They are also checked **on the interval that is drawn**, not on ℝ.
  The Archimedean spiral forces that distinction: `r = θ` satisfies the textbook test for θ = π/2
  since `r(−θ) = −r(θ)`, and the *complete* spiral over θ ∈ ℝ genuinely is symmetric about the y
  axis — the mirror of the point at θ = π/4 sits at θ = −π/4 with a negative radius. But the
  block draws [0, 2π], where that mirror does not exist. A reflected angle falling outside the
  drawn domain is now a **failed** test rather than an evaluation of r out there. Where the curve
  does repeat over its interval the angle is reduced instead, and that repetition is measured
  numerically rather than read from the symbolic period, because a constant `r = 2` has no
  symbolic period and would otherwise lose all three of its symmetries.

Two smaller points. `r` is allowed to be **negative** — the engine plots `(r·cosθ, r·sinθ)` with
no absolute value, so a negative r reflects the point through the origin — and when r changes
sign the panel says so, because `-1 ≤ r ≤ 3` otherwise reads as a range of distances. And the
cartesian "roots" have a genuine polar counterpart that is kept: `r(θ) = 0` means the curve
**passes through the pole**, and those angles are what tell a rose from an annulus.

The popover is 260 × 200 px, so compactness is a constraint: the extrema occupy one line carrying
only their *angles*, since the radius range above already gives both values, and every line is
omitted when there is nothing to say. Values are refined before display — extrema by ternary
search, pole crossings by bisection — so the θ printed is the real one and not the sampling
grid's nearest neighbour, which is also what makes it recognisable as π/16 rather than 0.19635.

### Parametric curves

**Before.** The same cartesian summary, where none of the three categories has a meaning:
"Y-intercept" is ambiguous when a Lissajous crosses the axis a dozen times, "root" does not say
whether it means `x(t)=0` or `y(t)=0`, and "vertex" is undefined outside a few families.

**Now.**

```
Parametric curve · Lissajous 3:4, phase π/2
0 ≤ t ≤ 2π · closed · period 2π
-1 ≤ x ≤ 1,  -1 ≤ y ≤ 1
Passes through the origin
Symmetry: about the origin, about the x axis, about the y axis
Self-intersections: 17
Length: 21.2371 · Algebraic area: 0
```

The family is read from the **harmonics of each component**: two pure harmonics make a Lissajous,
and the frequency ratio and phase fall out of the fit. The phase is reported after shifting the
parameter origin so that `y` has phase zero — the canonical `x = A·sin(at+δ), y = B·sin(bt)` —
because otherwise δ would depend on where the block's interval starts, which is a property of the
block and not of the curve.

Three rules carried over from the polar work:

- **Symmetries are verified against the drawn points**, not deduced from the formula: samples are
  indexed in a spatial grid and each reflected point is looked up in it. So `(t, t²)` reports
  **no** symmetry, correctly — the full parabola is symmetric about the y axis, but the block
  draws `t ∈ [0, 2π]`, which is half of it.
- **The period is compared against the interval that is drawn.** `(cos t, sin(t/3))` closes at 6π
  while the block draws 2π, so the panel states that the period exceeds the interval and what is
  visible is a piece of the curve.
- **The area is ALGEBRAIC**, ½∮(x dy − y dx), and labelled as such. It counts winding direction,
  so a symmetric Lissajous returns 0 — lobes traced in opposite senses cancel. That is what the
  contour integral measures; "enclosed area" would be the wrong name. It is shown only for a
  closed curve.

The self-intersection count is the one number that had to earn its place, since a count that
moves when the sampling is refined is not worth printing. It is **stable from 500 to 8000
samples** on every case tried, and it agrees with the closed form for Lissajous curves of coprime
frequencies, `2ab − a − b`: 17 for 3:4, 7 for 2:3, 1 for 1:2, 0 for the circle. That formula is
an oracle independent of the algorithm, which counts segment crossings and knows nothing about
Lissajous curves.

### Definite integrals

**Before.** `obs-integral` graphs the *integrand*, so the panel described that curve: for
`∫₀² 2x dx` it reported the y-intercept, the roots and the absence of vertices of `2x`. All true,
and none of it about the integral.

**Now.**

```
∫₀² 2x dx                       ∫₋₁¹ x dx
─────────────────────────       ────────────────────────────────
Definite integral               Definite integral
0 ≤ x ≤ 2                       -1 ≤ x ≤ 1
Value: 4 · the area under       Value: 0 · signed area: the parts
  the curve                       below the axis subtract
Average value: 2                Crosses the axis at x = 0
                                Positive area: 0.5
                                Negative area: -0.5
                                Average value: 0
```

**Value and area are one line, not two.** They are the same number whenever the integrand keeps
its sign, so the value is labelled with what it *is*: the area under the curve, or `the curve
stays below the axis` when the sign is negative, or `signed area` when it crosses. Only in the
last case do the two areas appear separately — there they are what the value hides.

The decomposition is published **only if the pieces add up to the total**. The crossings come
from a sampled scan; one that escapes splits the interval wrongly and produces two numbers that
are plausible and false at once. When the check fails, or when the integrand crosses more times
than fit in the box, the panel says nothing.

The value reuses the block's existing exact recogniser — `8/3`, `π/2`, `ln 3` — so the two places
where the block states its result cannot disagree. Everything else (interval, crossings, average)
goes through the same plain-text number formatter as the other panels. The integration variable is
the one that was written: `∫₀¹ t² dt` reports `0 ≤ t ≤ 1`.

Improper integrals are marked in the header with the endpoint that is singular and the fact that
they converge. Divergent ones never reach this panel: the block already veils the plane for them,
and the veil is the single place for that diagnosis.

### Derivatives

**Before.** `obs-derivate` graphs f′, so the panel described f′ as a loose curve. The *numbers*
were the right ones — they just carried another function's names:

| the panel said, of f′ | it is, of f |
|---|---|
| Y-intercept | slope at x = 0 |
| Roots | **critical points** |
| Vertices | **inflection points** |

**Now.**

```
x³ − 3x                          |x|
─────────────────────────        ───────────────────────
Derivative                       Derivative
Slope at x = 0: -3               Critical point:
Critical points:                   x = 0 (corner)
  x = -1 (local maximum)         Decreasing on (-∞, 0)
  x = 1 (local minimum)          Increasing on (0, ∞)
Increasing on (-∞, -1)           Not differentiable at x = 0
Decreasing on (-1, 1)
Increasing on (1, ∞)
Inflection point: x = 0
```

Renaming costs nothing; what is new is the classification of each critical point from the **sign
change of f′** (maximum, minimum, or a stationary point that is neither — `x³` at 0), the
monotonicity intervals, and the detection of points where f exists but f′ does not.

Three rules hold the panel up:

- **Everything is masked by the domain of f, not of f′.** The derivative of `ln x` is `1/x`, which
  evaluates happily at x = −2, where `ln x` does not exist. Without the mask the panel announced
  "decreasing on (−∞,0)" of a function that is not there.
- **Non-differentiable means an isolated point, never a region.** A corner is confirmed by
  comparing the one-sided jump of f′ at **two distances** (1e−3 and 1e−5): at a corner the jump is
  the same at both, and on a merely steep stretch it shrinks as you approach. Without that test,
  `1/x` reported two corners flanking its pole, where f′ moves from −2500 to −2497 between
  neighbouring samples. The same comparison, asking instead whether the one-sided slopes *grow*,
  separates the cusp of `√|x|` from the corner of `|x|`.
- **What lies outside the sampled range is announced, not assumed.** The analysis window is
  [−10, 10], the same one the panel has always used. `x³ − 1000x` has its extrema at ±18.3, so its
  interval dies at the window edge without reaching ∞ — which is exactly the signal that critical
  points went unseen. The panel then adds `Analysed on -10 ≤ x ≤ 10`. Functions whose intervals do
  extend to ±∞ (verified by probing magnitudes up to 1e16) carry no such note.

Groups that are too numerous are summarised with the policy the cartesian panel already uses: a
trigonometric function has infinitely many critical points, and half a list of them is not
information.

## Audit, quality and internal tools

Two long-standing review warnings are gone.

**`display()` is deprecated since Obsidian 1.13.** The settings tab declared itself twice: once
declaratively through `getSettingDefinitions()` (1.13+, which is what Obsidian actually renders)
and once imperatively through `display()`, the fallback that 1.5–1.12 requires. With Obsidian
1.13.4 published, `minAppVersion` moves to **1.13.0** and the imperative path becomes unreachable
code: it is deleted, and with it the last deprecated API in the plugin. Two consequences beyond
the warning — the two declarations can no longer drift apart, since there is only one left; and
changing the interface language now repaints the tab immediately (`update()`, API of 1.13.0,
which referencing under the old floor would have been `no-unsupported-api`) instead of waiting
for Settings to be reopened.

The other was an unsafe call on `document.fonts.add`. The finer diagnosis: `forEach` on that same
property resolves and `add` does not, in the `lib.dom` version the audit runs against. The one
operation needed is now declared explicitly.

**Four terminal-only tools**, none of which ship in the bundle:

- `npm run huella` records a fingerprint of the whole repertoire — the pixel map the renderer
  actually paints at the real 2 px pen, plus branch, asymptote and notable-point counts — so an
  engine change can be checked against "the image does not change", which a green suite has been
  shown not to prove. It passes data through stdin and stdout rather than files, because
  Obsidian's review forbids Node APIs and the rule is not silenced even in a tool that never
  reaches a device.
- `npm run medir` reports geometry produced per canvas pixel, how much lands on already-painted
  pixels, and where time goes between evaluating and emitting.
- `npm run sonda` interrogates the simplifier and solver over ten levels of difficulty: numeric
  radicals, non-integer exponents, radicals with variables, nesting, logarithms, trigonometry,
  rational cancellation, degenerate cases, and the solver with `y` in awkward places.
- `npm run notacion` checks the input surface over six groups **by value**: each case carries the
  number it must produce, so a notation that is accepted but computes something else is reported
  as a failure rather than a pass.

The last two assert nothing; they print, so a person can look. Every notation and algebra fix
above started as a line of their output.

---

# Why it matters

**Mathematical correctness.** `log(100)` evaluated to 4.605 instead of 2, so a curve drawn from
`log(x)` was silently the wrong logarithm — this is a corrected wrong answer, not a typographic
change. `τ` and `φ` evaluated to `NaN`, producing a silently empty plane. `y^{0.5} = x−3` was
simply not solved. The Gerono lemniscate was reported as having no self-intersections when it has
one.

**Visual and readability improvements.** Exact quantities no longer arrive as decimal expansions
(`√50` as `7.0710678118654755`), rational exponents no longer become unreadable radicals
(`\sqrt[10000]{x^{5637}}`), and the ⓘ panel prints `π/2` rather than `1.5708` and `3` rather than
`2.9999`. None of these change a plotted curve.

**Panels that answer the block's own question.** Four block types had an information panel
describing something other than what the block is about: a rose reported its y-intercept, an
integral reported the roots of its integrand, a derivative reported the vertices of f′. The
categories now match the object — swept area and symmetries for a polar curve, value and average
for an integral, critical points and monotonicity for a derivative — and where a property is not
well defined, or cannot be computed reliably, the line is omitted rather than guessed.

**Optimization.** Tracing produces 67 % fewer vertices in `tan(e^x)`'s default view and 9 % fewer
in `tan(x²)` at ±120 while painting exactly the same pixels there. Flicker between the
interactive and final passes is removed wherever both saturate, because the result no longer
depends on where the sweep began. Less geometry for the same image is the claim; a wall-clock
figure is not, and **Validation** explains why the bench cannot support one.

**Internal changes with no user-visible effect.** The unified `log(u, base)` representation across
six modules; the Euclidean extraction moving from emitted LaTeX to the syntax tree; the period
machinery factored out so polar and parametric share one implementation.

**Stability.** Several rules exist so that appearance stops depending on internal accidents: the
radical index ceilings mean a formula's look no longer depends on whether the rationaliser found
a fraction, and the self-intersection count is reported only because it survives refinement.

---

# Breaking changes

## `log(x)` now means base 10

**Before.** `log(x)` was the natural logarithm, inherited from mathjs, for every spelling a
person might use: `log(2)`, `\log{2}`, `\log(2)`, `\log 2`.

**Now.** All four spellings mean **base 10**, and the base is written in the output:
`\log_{10} 100 = 2`.

**Why.** That convention comes from programming languages. In the notation that is taught, and on
every calculator, a logarithm without a written base is decimal. The problem was not only the
printed name: `log(100)` **evaluated to 4.605 instead of 2**, so the plotted curve was the wrong
logarithm.

**Who is affected.** Any existing note that wrote `log(x)` meaning the natural logarithm. That
block now plots a different curve.

**How to migrate.** Write **`ln`** instead — that spelling has always worked and is unchanged, in
all four of its forms. An explicit base (`log(8,2)`, `\log_2{8}`, `log2(8)`) was already correct
and is untouched.

## `minAppVersion` is now 1.13.0

**Before.** 1.12.7.

**Now.** 1.13.0, published by Obsidian as 1.13.4 at the time of writing.

**Why.** The settings tab was carrying two implementations of itself so that Obsidian 1.5–1.12
could render it imperatively — the `display()` path, deprecated since 1.13 and the last
deprecation warning in the review. Raising the floor deletes that path instead of maintaining a
second copy of every setting.

**Who is affected.** Anyone on Obsidian older than 1.13.0: they keep the version they have
installed, and the plugin will not offer them this update. Nothing breaks; the update simply is
not offered until they update Obsidian.

## Behaviour changes that are not incompatible, but are visible

These do not change any value, only what is displayed. They are listed because output that
scripts or notes quote verbatim will differ:

- The ⓘ panel for **polar**, **parametric**, **integral** and **derivative** blocks no longer
  shows Y-intercept, roots or vertices; it shows the properties listed above instead. For
  derivatives the numbers are largely the same ones under their proper names, so a note quoting
  "Roots: -1, 1" now reads "Critical points: x = -1 (local maximum), x = 1 (local minimum)".
- Panel formatting of rational exponents, radicals and numbers changed as described — for example
  `x^{-1/2}` is now `\frac{1}{\sqrt{x}}` and `x^{π/2}` is no longer `\sqrt{x^{π}}`.
- The same typography now reaches expressions written with **LaTeX braces** and expressions the
  solver builds internally, which is what makes both spellings agree. Two derived formulas
  therefore print differently: the astroid solves to `±(1−∛(x²))√(1−∛(x²))` rather than
  `±√((1−∛(x²))³)`, and the heart curve's discriminant shows `x∛x` rather than `∛(x⁴)`. Same
  values, same domains, checked point by point.
- Two of thirty-four tracer bench cases draw slightly differently (both pathological; the pixel
  map is identical elsewhere).

---

# What it fixes

## Mathematical bugs

- **`log(x)` computed the natural logarithm.** Symptom: `log(100)` = 4.605. Cause: mathjs names
  the natural log `log` and the plugin inherited it. Fix: all base-less spellings normalise to
  base 10, with one internal representation `log(u, base)`.
- **`ln x / ln 10` changed meaning when re-parsed.** Symptom: painted as `\log_{10} x / \ln 10`.
  Cause: the internal `log(u)` form did not survive a second trip through the parser. Fix: every
  producer writes its base.
- **`τ` and `φ` were free symbols.** Symptom: empty plane, no error. Fix: translated like `π`
  and `θ`.
- **`\phi` was reported as an unsupported symbol** even though it evaluated correctly. Symptom:
  a block written `\phi` showed the "Unsupported symbol" veil while the same letter typed as
  Unicode `φ` plotted normally. Cause: the whitelist that decides which LaTeX commands the
  pipeline can translate lists `pi`, `tau` and `theta` but was never given `phi` when the
  translation was added. Fix: one entry, plus a test that walks all four so the list cannot
  fall out of step with the parser again.
- **A rational exponent written with LaTeX braces missed the radical typography** — see
  *Radicals finish the job*. Symptom: `x^{3/2}` printed `√(x³)` and `x^{1.5}` printed `x√x`,
  two spellings of one function looking different, which is the failure this whole family of
  fixes exists to prevent. Also `x^{5/64}` kept its 64th root despite the new index ceilings.
- **`y^{0.5} = x−3` was not solved.** Cause: the solver recognised only integer exponents ≥ 2.
  Fix: non-integer powers inverted on `y ≥ 0`, where they are injective.
- **`ln(y)=x` became unsolvable** during the logarithm work. Fix: the solver learned the general
  inverse `log(u,b) = t ⇒ u = b^t`.
- **The Gerono lemniscate `(cos t, sin 2t)` reported zero self-intersections.** Symptom: a curve
  that visibly crosses itself once reported none. Cause: the crossing sits exactly on two samples
  (t = π/2 and 3π/2), and requiring the intersection strictly inside both segments — the natural
  way to avoid counting the vertex two consecutive segments share — discarded it. Not rare: a
  symmetric curve puts its crossings at round parameter values, which is where the grid falls.
  Fix: closed intervals for non-adjacent segment pairs.
- **`sin(θ/10)` was reported as symmetric about the pole.** Cause: the "alternative" pole test
  was in fact the θ = π/2 test duplicated. Fix: the pole has a single valid test, `r(θ+π) = r(θ)`.
- **The Archimedean spiral inherited a symmetry from its unplotted continuation.** Cause: the
  test evaluated r outside the drawn domain. Fix: reflected angles outside the drawn interval
  fail the test.

## Visual and formatting bugs

- **Exact constants printed as decimals**: `√50` → `7.0710678118654755`. Cause: a lookup table
  covering only `√k`, k = 2…40. Fix: arithmetic recognition.
- **Decimal exponents became enormous radicals**: `x^{0.5637}` → `\sqrt[10000]{x^{5637}}`. Cause:
  the rationaliser's 10 000 denominator limit plus an emitter with no index ceiling. Fix: limit
  lowered to 64, plus explicit readability ceilings.
- **`√2/2` was returned as `1/√2`.** Symptom: Simplify moved the expression backwards and was no
  longer a no-op on its own output. Fix: reciprocals are rationalised.
- **`ln x / ln 10` printed a stray `1`** (`\frac{1\ln x}{\ln 10}`). Cause: the reciprocal was
  recovered as the node `1/ln 10` and multiplying by it left the numerator visible. Fix: a
  product by a reciprocal is collapsed into a division.
- **`(y−1)² = x` displayed as `(2 ± 2√x)/2`.** Cause: expansion destroyed the perfect square, and
  no formatting pass reaches inside the `±` sentinel. Fix: a pass that does, cancelling positive
  common factors only.
- **`√20·y = x` displayed as `y = 0.22360679774997896x`.** Fix: the solver now re-symbolises on
  the panel path (`y = (√5/10)x`), leaving the tracer path untouched.
- **`log(2)` displayed as `0.3010299956639812`**, and `log(2)+1` as
  `\frac{4.23026\cdot 10^{+5}}{3.25147\cdot 10^{+5}}`. Causes: mathjs folds `log(2,10)` because
  both arguments are constants; and `fraccionExacta` accepted denominators up to a million. Fix:
  exact recovery from the decimal, and the denominator limit lowered to 64.
- **Logarithm typography** did not match the rest of the panel: mathjs always parenthesises and
  leaves a space inside (`\log_{10}\left( x\right)`). Now atomic arguments go bare and compound
  ones get brackets. Also fixes `\log_{2}\left(8\right)` → `\log_{2} 8`.
- **Panel numbers**: `1.0000` instead of `1`, `2.9999` instead of `3`, `1.5708` instead of `π/2`.
- **An improper integral rejected its own exact value.** Symptom: `∫₀¹ x^{-1/2} dx`, which is
  exactly 2, was announced as `≈ 1.9998`. Cause: the consistency check that decides whether
  Barrow applies demanded agreement to 1e−5, but an improper integral is not computed, it is
  approximated — the endpoint ε stops shrinking once the change falls below 1e−4 — so the correct
  antiderivative was rejected every time. Fix: the tolerance is relaxed for improper integrals
  only. It remains a strong guard: what it exists to catch, an interior pole, moves the value by
  orders of magnitude, not in the fourth digit.
- **An improper integral without an antiderivative printed noise.** Symptom: `∫₀⁴ dx/√x`, which
  is 4, read `≈ 3.9996`. Cause: four decimals shown of a number the method only knows to 1e−4.
  Fix: in that branch the value is rounded to the simplest closed form that explains it within
  that precision, keeping the `≈`. Ordinary quadrature does not pass through this path — its
  error is ~1e−11, and rounding there would be inventing.

## Performance bugs

- **Flicker between the interactive and final passes.** Symptom: up to 14.2 % of canvas pixels
  changed on release. Cause: a single global vertex budget spent in sweep order, exhausted at
  different points by passes with different sample counts. Fix: a per-column quota.
- **Geometry spent with no visible return.** Symptom: `tan(x²)` at ±120 emitted 9 % more vertices
  than needed for an identical image. Cause: sub-pixel refinement inside crowded columns, which a
  global budget never noticed. Fix: same per-column quota.
- **A quadratic de-duplication inside a quadratic loop** in the new self-intersection counter —
  the exact shape of the bug that froze Obsidian in 1.2.9. Fixed before shipping: a spatial grid
  with a bounding-box rejection ahead of it. The analysis is still the heaviest of the four
  panels by a wide margin — **five to twelve times the polar one**, measured in the same run,
  where the polar analysis is the only one cheap enough to run at mount, and the integral and
  derivative analyses land below it. That ordering (integral < derivative < polar ≪ parametric)
  held in every run measured, and it is why the parametric, integral and derivative panels are
  computed **lazily on first open**: a click absorbs the cost, a note full of blocks would not.

---

# Validation

## Automated tests

- Main suite: **411 passed, 0 failed** (51 added in this release).
- Zoom suite: **12 passed, 0 failed**.

The new tests pin the parts most likely to rot quietly: that the period of r and the period of
the curve stay distinct; that the rose's swept area is deliberately twice its enclosed area; that
the family classifier is blind to how an expression is written; that the self-intersection count
survives refinement; and that the number formatter does not invent closed forms. Several are
regressions on the symmetry detectors, which were wrong twice in different ways.

The integral and derivative panels each carry a block of tests devoted to what they must **not**
say: that `x²` touching zero on [−1,1] is not a sign change; that `sin(x)` over [0,10π] refuses
to count its crossings rather than print a number that will not fit; that a decomposition whose
parts fail to add up to the total is withheld; that `1/x` has no corners flanking its pole; that
`sin(x)` produces no corners at all despite f′ jumping between samples; and that `x^{2/3}`, whose
derivative this engine cannot evaluate on the left, yields no invented cusp.

## Mathematical validation

- **CAS battery**: no failures across six difficulty levels and 220 generated towers, identical
  to before the change.
- **Differential fuzzer**: no soundness failure over **10 500 cases** — 21 families of generated
  equation, 500 each — so every branch a solve reports as complete satisfied the equation it came
  from, in the cases evaluated.
- **Independent oracles** where one exists: the Lissajous self-intersection count was checked
  against `2ab − a − b`, a formula the counting algorithm knows nothing about. Parametric lengths
  and areas were checked against known values — circle 2π and π, ellipse `a=2,b=1` area 2π and
  perimeter 9.68845, cycloid arch 8, cardioid 8 and 3π/2. Polar areas likewise: cardioid 3π/2,
  limaçon 3π, spiral 4π³/3, circle 4π.
- **Stability under refinement**: the self-intersection count is unchanged from 500 to 8000
  samples on every case tried.

One measurement is worth recording because it looked bad for a while. Midway through the
logarithm work the battery's random phase went from 0 failures to 1, on `|1/log(y)| = cos(x)`.
It was not the solver: mathjs returns a **complex** number for the logarithm of a negative, and
`abs(1/complex)` is real, so the numeric oracle counted a root at `y = −0.000331`, where
`log₁₀(y)` does not exist in ℝ — `abs(1/log10(−0.000331))` is 0.26752 and `cos(−1.3)` is 0.26750,
a coincidence. It disappeared once the representation was unified. The oracle's willingness to
accept roots reached through a complex intermediate is a pre-existing weakness of the harness,
not of the engine.

## Performance

**Measured (reproducible).** Vertex counts are identical run to run:

- `tan(e^x)` default view: 1 573 289 → **521 914** vertices (67 % fewer).
- `tan(x²)` ±120: 9 % fewer vertices for a bit-identical pixel map.
- **Fingerprint bench**: no case draws differently apart from the two listed above, with vertex
  counts matching digit for digit — none of the algebra work moves anything on the canvas.

**No wall-clock figure is claimed**, because this bench cannot separate the change from the state
of the machine it runs on. Run the identical build twice on different days and the total moves by
a **factor of two** — while the vertex counts come back identical digit for digit, so the work
done is provably the same and the difference is entirely the machine. A busy CPU widens it
further. The recorded "before" column comes from yet another session, so setting the two totals
side by side would compare machine states, not implementations.

What survives that objection is the **share of the bench** each view takes, since every case in a
run meets the same machine on the same day. Each figure below is one view's time divided by the
total of the run it belongs to — no number crosses from one run to another. The view the change
targets went from **29.6 %** of the bench to **15.3 %**:

| view | share of the run, before | share of the run, after |
|---|---:|---:|
| `tan(e^x)` default | 29.6 % | **15.3 %** |
| `tan(x²)` ±300 | 15.6 % | 20.1 % |
| `tan(x²)` ±120 | 9.2 % | 12.2 % |

The other two rows moving the other way is the honest reading: the budget stops a runaway view
from dominating, and the views that were never near the ceiling gain nothing — they simply weigh
more once the runaway one shrinks. The reproducible statement remains the vertex count above, not
a time.

**Not verified.** Whether the asymptote reduction in `tan(e^x)`'s default view (23 734 → 6 385
recorded asymptotes, 31 per pixel of width down to 8) is visible has not been checked. They
remain denser than the screen can separate, but the asymptote overlay draws outside the saturated
band as well as inside it.

## Code quality

- Typecheck: clean.
- Build: clean.
- Review audit (ESLint, Obsidian ruleset): **0 errors, 0 warnings**. The CSS audit is clean too.

**A caveat worth keeping**: the local audit is precise but not identical to Obsidian's bot. Zero
here is a good sign, not a guarantee. The `no-deprecated` case that motivated this caveat is now
moot — `display()` no longer exists in the plugin, so there is nothing left for either tool to
disagree about.

---

# Known limitations

Stated rather than buried, since the tools above make them easy to check.

**Simplification.**

- `√(12x+27)` and `√(8x+16)` are not reduced: the square factor sits inside a **sum**, and pulling
  it out means factorising the sum — a different decision with a different risk.
- A constant added to an irrational is not recovered: `√2 + 1` shows `2.414213562373095`. This is
  not new. `π+1` and `e+1` work because they never decimalise in the first place, while a
  recovered radical has already lost the sum it belonged to. The logarithms escape it only
  because `log 2 + 1` happens to be exactly `log 20`.
- Radical merging requires one radicand to be provably non-negative, so `√x·√y` is left as two
  radicals. This is intentional: merging them would be unsound where both are negative.
- A perfect power is not extracted from a **product** radicand: `√(2x⁵)` stays as it is rather
  than becoming `x²√(2x)`. It is the one place where `(2x)^{5/2}` still looks different
  depending on whether it was written with braces or with parentheses.
- `\varphi` is not translated. It is *reported* — the block shows "Unsupported symbol" rather
  than plotting nothing in silence — but `\phi` and Unicode `φ` are the spellings that work.

**Solver.**

- `√y + y = x` solves to a fraction with a **negative denominator**, which this project treats as
  a defect elsewhere. Flipping it means swapping `±` and `∓`, which is not a casual change.
- `(y+1)^{0.5637} = x` is not solved: the base is composite, which needs nested inversion rather
  than a bare `y`.
- `y = x·y + 1` solves to `1/(-x+1)` instead of `1/(1-x)`; purely typographic.

**Notation.**

- Numeric arguments to trigonometric functions are read as **degrees** — deliberate — but the
  internal normalisation leaks into the solver panel, which shows `sin(30·π/180)`.
- `≤ ≥ ≠` are not read. Plotting an inequality is a feature this release does not add.
- A superscript *letter* (`eˣ`) is not read. Superscript digits are.
- **With an odd denominator, the two spellings of a rational exponent draw different curves.**
  `x^{1/3}` in braces becomes a real cube root and is plotted for x < 0; `x^(1/3)` in parentheses
  is a power, which is NaN there, so only the right half appears. This release makes the two agree
  *typographically* — that was the bug it fixed — and they still differ in **domain**, which is a
  deeper matter than typography: the braced form is the more useful reading and the parenthesised
  one is what mathjs computes. The same asymmetry is why the index ceilings send `x^{5/64}` to a
  power but leave `x^{5/9}` as a radical: with an odd index the power would drop the negative half
  of a curve that is being drawn.

**Panels.**

- The polar family classifier samples over [0, 2π] without checking that the curve closes there.
  For the classical families this is harmless, since all of them are periodic; a non-periodic
  curve resembling a cardioid on its first turn could be mislabelled.
- mathjs leaves a space inside its brackets for some contents (`\left( x+1\right)`) and not others
  (`\left(x^{2}+1\right)`). This is visible project-wide, `(x+1)^2` included, and is deliberately
  left alone rather than normalised in one place, which would make those expressions the odd ones
  out.
- The self-intersection count is reported only when it stays below an internal cap; above it the
  panel says nothing rather than showing a number it cannot stand behind.
- **The cusp of `x^{2/3}` is not reported.** The engine evaluates `x^{2/3}` for x < 0 but not
  `x^{-1/3}`, its derivative, so there is nothing to inspect on that side. The rule that keeps
  this honest — a non-differentiable point is always isolated, never a region — is the same one
  that stops the gap becoming one invented "corner" per sample. The same asymmetry means the
  panel says nothing about that half of the function's monotonicity either.
- **The derivative panel lives in the fixed [−10, 10] analysis window**, inherited from the
  existing notable-point analysis. It announces the window whenever it can tell information was
  left outside (see above), but a feature that is invisible inside it *and* leaves the sign of f′
  unchanged outside it — an extremum pair beyond ±10 that cancels — would go unmentioned.
- **Integrals with symbolic or infinite limits are still out of reach** of the block itself, not
  just the panel: `∫₀^∞` and `∫₀ˣ` fall into the "non-numeric limits" veil. So the fundamental
  theorem, `d/dx ∫₀ˣ f = f(x)`, has nowhere to be shown.
- The integral panel omits the positive/negative split when the crossings exceed an internal cap
  or when the pieces do not reconstruct the total, for the same reason as the count above.
