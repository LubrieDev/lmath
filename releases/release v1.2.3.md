# 1.2.3

## Features

Minor release that makes **solving for `y`** general: any single occurrence of
`y`, however deeply nested, is now isolated by inverting the surrounding
operations one layer at a time, and the result states its domain and its full set
of branches. Values and domains are preserved exactly — a solved form never
claims a point the curve doesn't have, and no longer silently drops points it
does have. Two verification harnesses back the change and ship with it
(`npm run fuzz`, `npm run bateria`): a **differential fuzzer** for soundness
(every solved form must satisfy its original equation) and a **graduated battery**
for completeness (every real root of the original must be claimed by the solved
form). The full test suite (333 tests) passes.

- **Solving for `y` now inverts any single, nested occurrence (`\ln(y)=x`,
  `e^y=x`, `\sin(2y)=x`, `(y+1)^3=x`).** Previously each strategy peeled exactly
  one layer around `y` (`yⁿ`, `ⁿ√y`, a bare `T(y)`, `1/y`…), so an equation with
  `y` wrapped in a function that had no dedicated strategy — or nested more than
  one level — was left partial. A general **structural inverter** now isolates `y`
  by peeling the outermost operation and applying its exact inverse to the other
  side, recursing on the child that contains `y`: `\ln(y)=x → y=e^x`,
  `e^y=x → y=\ln x`, `2^y=x → y=\ln x/\ln 2`,
  `\sinh(y)=x → y=\operatorname{arcsinh} x`, trig of a **compound argument**
  `\sin(2y)=x → y=(π/2 ± \arccos x + 2kπ)/2`, a **compound base**
  `(y+1)^3=x → y=∛x−1`, and nesting `e^{y^3}=x → y=∛{\ln x}`.

- **Inversions that are only valid on part of the plane now carry their domain
  condition (`, R ≥ 0`) — at any depth.** Undoing an even root, an absolute value
  or an even power isn't valid everywhere (`x−√y=27 ⇒ y=(x−27)²` holds only for
  `x≥27`), and the solved form now states it. The inverter no longer gives up when
  it meets one of these layers mid-tower: it emits the guard and keeps peeling —
  `\sqrt{\tan y+1}=x → y=\arctan(x²−1)+kπ,\ x≥0,\ k∈ℤ`;
  `|2y+1|=x → y=(±x−1)/2,\ x≥0`; `e^{y^2}=x → y=±\sqrt{\ln x},\ \ln x≥0`;
  `\sqrt[4]{\ln y}=x → y=e^{x^4},\ x≥0`. A recursive **sign analysis** decides
  whether a guard is needed at all, so composed non-negative expressions (`x²+1`,
  `|x|+3`, `x⁴+x²`, `√x+|x|`) collect no redundant condition; several conditions
  from different layers are listed once each; and a condition that is constantly
  negative leaves the equation partial instead of inventing a curve.

- **Curves that become a function of `x` after solving now graph in full (no
  truncated tail).** `\ln(y)=x` graphs `y=e^x`, but it was drawn by the generic
  implicit tracer, which only follows the curve to ~2× the view before stopping —
  so the left tail (`y→0`) was cut around `x≈−8` while the explicit `e^x` reached
  the border. Any implicit that solves to a **single-valued** function of `x` (the
  invertible cases above, plus `x³+y³=9 → y=∛(9−x³)`) is now graphed with the
  **explicit sampler**, which traces the whole curve to the view edge. Multi-valued
  relations (a circle, `2|y|=x`, the periodic `\sin(2y)=x`) stay on the implicit
  path. The domain guard is honored while sampling, so `x−√y=2` draws only its
  half-parabola (`x≥2`), not the mirror branch.

- **Where it stops.** The solver isolates `y` whenever `y` occurs **once** (any
  nesting), and when the equation is quadratic in `y`, in `yᵍ` or in `\cos y`.
  Beyond that it now stops **honestly**, leaving the equation in its most reduced
  form instead of guessing: a cubic or quartic in `y` (`y²+3y+x²−3y^{-2}=8−e`
  becomes `y⁴+3y³+(x²+e−8)y²−3=0` once the denominator is cleared — Cardano and
  Ferrari are out of scope), degree ≥5 (no solution by radicals exists), mixed
  transcendentals (`\sin y + y = x`), and `a\sin y + b\cos y`. Graphing is
  unaffected: those curves are still drawn in full by the implicit engine.

## Bug fixes

- **Two independent `±` in one solution no longer collapse into one (lost
  branches).** All `±`/`∓` sentinels in an expression were resolved with the *same*
  sign, which is the right convention for a **single** `±` written by hand but
  wrong when a solution has two *independent* ones: only 2 of the 4 curves were
  drawn, silently. Measured: `|y| = ±x` drew only `y=x` (the `y=−x` half was
  missing), and the quadratic-in-`\cos y` solver lost an entire family. Sentinels
  now carry an **axis** and the expansion is the cartesian product of the axes
  present — 1, 2 or 4 branches, bounded. A solution needing a third independent
  axis is reported as partial rather than emitted incomplete. Both axes still
  print as plain `\pm`/`\mp`: the axis is internal bookkeeping.

- **Nested periodic inversions no longer share one family parameter (lost
  solutions).** The periodic family was always emitted with the fixed name `k`, so
  two nested periodic inversions collapsed onto the diagonal `k₁=k₂`. Measured:
  `\sin(\cos y)=0.5` has 8 roots in `[−12,12]` and the formula covered **2**. Each
  inversion now takes the first free parameter (`k`, `m`, `n`) and the trailing
  clause declares one per parameter (`, k∈ℤ,\ m∈ℤ`); if none is free the result is
  left partial. A single inversion still prints `k`, unchanged.

- **`\sqrt{y^4}=-3` no longer produces an invented curve.** The equation has no
  real solution (`\sqrt{y^4}=y²≥0`) but was "solved" to `y=±\sqrt[4]{9}`: raising
  both sides to an even index erases the sign of the other side, so the guard that
  was supposed to make it NaN never fired. Even-index inversions now carry the
  `R ≥ 0` condition, and a constantly-negative one leaves the equation partial.

- **The simplifier is idempotent again.** `1/(y/3)` simplified to `(3) / (y)` and
  simplifying *that* gave `3 / y`; `(1/(y/2))^2` behaved the same way. Explicit
  parentheses left over from how a node was *built* were being preserved, so two
  identical expressions serialized differently depending on their provenance —
  which matters because the engine compares strings to decide whether a
  transformation changed anything. Redundant parentheses are now dropped before
  serializing (mathjs re-adds the ones the notation needs).

- **Functions whose name contains a digit (`atan2`) are parsed again.** The
  implicit-product tokenizer used the previous *character* as a proxy for "the
  previous token is an operand", so a digit ending a function name looked like a
  number and `atan2(y,x)` became the product `atan2*(y,x)`. The tokenizer now
  tracks that fact at token level.

- **Typography of solved forms.** `\ln(y)=x` displays its solution as `e^{x}`
  (was `\exp(x)`); a function applied to a single atom prints as `\ln x` rather
  than `\ln\left(x\right)` (the parentheses were an artifact of how the solver
  composes its strings, not something you wrote); the inverse hyperbolics now
  follow the same `arc…` convention as the circular ones
  (`\operatorname{arcsinh} x`, not `\sinh^{-1}x`, which reads as a reciprocal);
  and a solution and its trailing clause are now separated by a proper `\quad`,
  so `y=(x−27)²,\ x−27≥0` no longer reads as one run-on expression.
