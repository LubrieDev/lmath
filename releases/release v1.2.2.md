# 1.2.2

## Bug fixes

Patch release bundling parsing, equation-solving, simplification, integral and
auto-framing fixes across all four blocks. Values are preserved exactly where
noted — most changes are recognition/rendering. The full test suite (320 tests)
passes.

- **Polar function notation `r(θ) = …` is now recognized as polar.** Writing a
  polar curve with an explicit angle argument — `r(\theta) = cos(3θ) + sin²(3θ) + 1`,
  or the LaTeX `r\left(\theta\right)=…` the editor emits — was being classified as
  an *implicit* relation instead of a polar curve. The parser normalized
  `r\left(\theta\right)` to the implicit product `r*(theta)`, which is no longer the
  bare `r` that the polar branch requires (`lhs === "r"`), so the curve fell through
  to `r*(theta) − rhs = 0` ("sin y que despejar") and never graphed as intended.
  This mirrors the existing named-function sugar `f(x)=rhs → rhs`: a sibling
  unwrapper now rewrites `r(θ)=rhs → r=rhs` in the single shared split point
  (`dividirEcuaciones`), so the graph engine, the formula panel, and the tracer all
  agree. The rewrite fires only when the argument is the polar **angle**
  (`\theta` / `θ` / `theta`); `r(t)=…` (parametric component) and `r(x)=…` are left
  untouched. The panel still displays your original `r(θ)=…` notation while the
  engine graphs the canonical `r=…` form.

- **A fractional exponent on `|…|` (or any function) now renders as a radical.**
  `|y|^{1/2}` was displayed as `{|y|}^{1/2}` instead of `\sqrt{|y|}`. The
  `base^{m/n} → root` rule already rewrote `x^{1/2} → \sqrt{x}` and `2^{1/2} →
  \sqrt{2}`, but it skipped a base that is a **function call** (`abs(y)`, the
  normalized form of `|y|`): its lookbehind — there to stop `x(x+1)^{1/2}` (an
  implicit product `x·(x+1)^{1/2}`) from being captured base-first — also rejected
  the parenthesis glued to `abs`, so the power fell through untouched. The rule now
  accepts a **real function call** (`abs`, `sin`, `sqrt`, …) as the whole base, so
  `|y|^{1/2} → \sqrt{|y|}` and `sin(x)^{1/2} → \sqrt{\sin x}`, while the implicit
  product `x(x+1)^{1/2}` is still left alone. Graphing and solving are unchanged:
  the solved form of `|y|^{1/2}` is still `y = ±(…)²`.

- **The simplifier no longer decimalizes irrational constants (`\sqrt 2`, `\pi`).**
  Simplifying an expression with an irrational constant printed its decimal value —
  `√2·x → 1.4142…x`, `√8 → 2.8284…` — because mathjs's `rationalize`/`simplify`
  evaluate those to a float. The symbolic-recovery pass that already closes
  `derivar`/`integrar` (`resimbolizarConstantes`) was simply never wired into the
  simplifier; it now runs there too, so `√2` stays `\sqrt 2`, `√2·x → \sqrt 2 x`,
  `√2+√2 → \sqrt 8`, and `√2·√3 → \sqrt 6`. The recovery table also gained the
  reciprocal `1/√k`, so `1/√2` and `√2/2` come back as `\frac{1}{\sqrt 2}` instead
  of `0.707…`. The value is preserved exactly — only the form changes. Two tests
  that pinned the old decimal/power output were updated to the exact forms.

- **Power-on-function notation `\sin^2 x` is now parsed (was read as a free
  variable).** `\sin^2 x` normalized to `sin^2 * x` — `sin` became a loose italic
  variable and the whole thing evaluated to NaN (nothing drawn), so the classic
  `\sin^2 x + \cos^2 x` was broken. The `func^n(arg)` rewriter only accepted a
  **grouped** argument (`\sin^2(x)`, to keep `tan^n(x)` distinct from `tan(x^n)`);
  an unbracketed `x` fell through. It now also accepts a bare single-symbol argument
  (a letter or a greek command) after the exponent — there is no `tan(x^n)` ambiguity
  once the exponent is fixed *before* the argument — so `\sin^2 x → (sin(x))^2`,
  `\cos^2\theta → (cos(theta))^2`, and `\sin^2 x + \cos^2 x` simplifies/derives
  correctly (its derivative is now `0`). Affects all four blocks (it lives in the
  shared normalizer).

- **A function glued to a greek command (`\sin\theta`, `\ln\pi`, `\sqrt\pi`) is now
  applied, not multiplied.** With no space or parenthesis between the name and the
  symbol, `\sin\theta` normalized to `sin*theta` (function name as a free variable →
  NaN), which broke **polar curves written `r=\sin\theta`** entirely. The
  unbracketed-argument rule required whitespace and an argument starting with a
  letter/digit, so a directly-attached `\theta` never matched. A new rule maps
  `\func\greek → func(greek)` for the whitelisted angles (`\theta`, `\pi`, `\tau`,
  `\phi`) — the same symbols the rest of the pipeline already treats as atoms — so
  `r=\sin\theta`, `\ln\pi`, and `\sqrt\pi` all work.

- **`obs-integral` now computes integrals whose variable isn't `x` (`\int_0^1 t^2\,dt`).**
  The block read the differential (`dt`, `du`, `dy`…) but then integrated and graphed
  the integrand as a function of `x` regardless, so `\int_0^1 t^2\,dt` (= 1/3) was
  evaluated with `t` left free → NaN over the whole interval → the panel reported
  **"Fuera de dominio"** for a perfectly valid definite integral. The integration
  variable is now renamed to `x` for the *computation* only (area, graph, and the
  Barrow primitive), while the operator panel keeps the variable you wrote — so
  `\int_0^1 t^2\,dt` shows `\int_0^1 t^2\,dt` with primitive `[t^3/3]` and evaluates
  to `1/3`. As a side effect `\int_0^1 y^2\,dy` also works (its `y` was previously
  rejected as a free `y`, i.e. an implicit curve). One test that pinned the old
  raw-integrand field was updated and two regression tests were added.

- **Solving for `y`: a `y` under a fraction is now inverted (`1/y = x → y = 1/x`).**
  A `y` in the *denominator* was touched by no strategy (they all require `y` in the
  numerator), so it was left as a partial `1/y = x`. A reciprocal step now inverts it
  and recurses: `x/y = 2 → y = x/2`, `2/y + 3 = x → y = 2/(x−3)`, `5/(2y) = x →
  y = 5/(2x)`, `1/y² = x → y = ±√(1/x)`, `1/(x²+y²) = 3 → y = ±√(1/3 − x²)`.

- **Solving for `y`: `T(u) = 0` with `u` nesting `y` (`sin(1/(x²+y²)) = 0`).**
  A trig equal to zero whose argument contains `y` is now inverted to its family and
  solved through: `sin(1/(x²+y²)) = 0` ⇒ `1/(x²+y²) = kπ` ⇒ (reciprocal + circle)
  `y = ±√(1/(kπ) − x²)`. Because `1/(x²+y²) > 0` forces `kπ > 0`, the family parameter
  is **natural** (`k∈ℕ`), not `ℤ` — a new `famN` sentinel (sibling of `fam`) emits the
  `k∈ℕ` tag; the `ℕ`/`ℤ` choice is decided numerically from the sign of `u` over the
  plane. `sin`/`tan` (family `kπ`) and `cos`/`cot` (`π/2 + kπ`) are covered; `sec`/`csc`
  (never zero) correctly yield no solution. Bonus: `sin(x+y) = 0 → y = −x + kπ`,
  `tan(xy) = 0 → y = kπ/x`. Two regression test groups added.

- **Automatic framing now fits bounded curves that overflow the default view (astroid).**
  `x^{2/3} + y^{2/3} = 4` reaches ±8 but the default view is `[-7,7]`, so its top and
  bottom cusps were clipped: the auto-framing only ever *zoomed in* (never out, to avoid
  chasing the infinity of a line or parabola), and a curve touching the border was left
  untouched. Now, when the default-view curve touches a border, the engine re-traces once
  in a large **probe** view (8× the default, a cheap interactive pass): if the curve is
  *contained* there it is bounded, and the view is reframed to its true extent — **zooming
  out** when needed (the astroid and a radius-8 circle land at semi-range 10, filling ~80%);
  if it still touches the probe border it is unbounded (line, parabola) and the default view
  stays. Curves that already fit the default view are untouched. Three regression tests added.
