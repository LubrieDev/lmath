# 1.2.6

## Graphing engine: speed, and fewer curves that change while you move the view

This release is about the graphing engine. It makes evaluation 2.3× to 18×
faster, addresses three visual defects reported while panning and zooming, and
bounds the curvature of the parametric and implicit tracers, which were drawing
smooth curves as visible polygons. It also unlocks the explicit sampler, which a
test had frozen against a dead copy of itself.

Two of those three defects are fixed outright; the third, the flicker on
`sin(1/x)`, is greatly reduced rather than removed. A fourth — the moving
stripes on `tan(x²)` — is diagnosed but not fixed, and is described at the end.

- **Expressions are compiled to native JavaScript: 2.3×–18× faster tracing.**
  mathjs remains the parser — its AST is still the source of truth for the
  syntax — but it is no longer the evaluator. `mathjs.compile().evaluate(scope)`
  pays typed-function dispatch and scope construction on *every sample*, and a
  trace takes between 2,500 and 220,000 evaluations, so that wrapper was the
  bulk of the frame rather than the mathematics. `src/compiladorNativo.ts` walks
  the AST and generates the equivalent JS, compiled once with `new Function`.
  Measured over the complete tracer: `√(9−x²)` 12.5 ms → 1.0 ms, `ln|x|`
  12.6 → 1.0, `sin x` 13.2 → 1.3, `tan x` at zoom-out 333.7 → 52.5,
  `sin(1/x)` deep-zoomed 585.8 → 85.6. Geometry came out bit-identical — same
  branches, same vertices — in all 160 comparisons made (8 curves × 10 zoom
  levels × both passes); that is a broad check, not a proof for every possible
  expression, which is what the safeguards below are for. Three of them keep an
  acceleration from ever becoming a change of drawing: a whitelist that refuses
  to generate code for
  any node whose semantics have not been verified against mathjs; a differential
  validation of the generated function against mathjs over ~40 probe points
  before it is used; and a fallback to the old path when either fails. Note that
  mathjs 12 does *not* use `eval` or `new Function`, so this is a genuinely new
  capability the plugin exercises where the environment allows it. Degradation
  is clean by construction: the call sits inside a `try`, so a Content Security
  Policy that blocks it returns `null`, every expression falls back to mathjs,
  and the engine behaves exactly as before — verified by sabotaging the
  `Function` constructor and re-rendering the curves in the test repertoire.

- **`tan(y) = x` drew short spurious strokes across its branches.** The
  separable-implicit provider rescues thin slivers next to each pole, because
  regular sampling can miss a branch that only exists within a fraction of a
  pixel. That rescue ran unconditionally, so where the ordinary sampling had
  *already* covered a pole it added a second, much coarser trace of the same
  place: 8 extra branches of 6 or 7 points each, which is what showed up as
  marks over the curve. The rescue now consults what was already traced and
  skips poles that are covered, using a sorted index of the visible x-values and
  a binary search rather than a scan per pole. Real slivers are still rescued —
  there is a regression test for a pole where sampling genuinely misses the
  branch.

- **`sin(1/x)` flickers far less when zooming — reduced, not eliminated.**
  Where a curve oscillates faster than one pixel, no sampling density resolves
  it: several whole cycles
  fall between consecutive samples, so what gets drawn is an *arbitrary* subset
  of a dense band — and which subset depends on the number of samples. Since the
  interactive pass and the final pass use different densities, each picked
  different threads and the curve changed when the gesture ended: measured, 122
  branches interactive against 38 final, with 31% of pixels differing. Those
  stretches are now detected and drawn as the min/max envelope per pixel column,
  on a grid pinned to the pixels and with a fixed number of samples per column,
  so both passes compute exactly the same thing. Flicker went from 30.9% to 0.5%
  on average, with a 6.6% peak — a large reduction, but not zero: some change
  between passes remains, and the surrounding curve is still sampled the usual
  way. For scale, `x²` measures 14.3% on the same metric purely from rasterising
  a curve that legitimately moves, so the residue sits below that floor. The
  deep-zoom case also got 6.8× faster (586 ms → 86 ms) because the sampler stops
  trying to resolve the unresolvable. These bands are marked
  `CalidadRama: "incierta"` — the contract value that had never been emitted —
  and carry no `parametro`, since a band is not a curve you can walk along.
  Telling a *pole* from an *oscillation* is what made this hard: inside the
  column holding a pole, the function rises, jumps and rises again, which reads
  as the same signature as a cycle. Neither a threshold on turning points nor
  the shape of the sign change is reliable; what works is the combination of
  four or more turning points with the local *and* global max/median ratio,
  since unboundedness is a property of the function rather than of the sampling.

- **Smooth parametric and polar curves were drawn as polygons.** Reported on
  `r = sin(θ/10)`: faceted while zooming, smooth once stopped. Refinement used
  only a deviation test — the distance from the midpoint to the chord — and
  deviation is a *sagitta*, which scales with the square of the chord: on an arc
  of screen radius R a turn of θ leaves a sagitta of only R(1−cos(θ/2)), so with
  the curve small on screen a vertex can turn 36° and still pass a 1-pixel
  threshold. Measured, the turn angles came out quantised at 36/18/9/4.5° —
  exact powers of two, that is, the uniform-sampling polyline never refined once
  — with a mean turn per vertex of 19.7° interactive and 9.9° final. A curvature
  criterion now bounds the turn itself, and the worst facet measured is 3.93°
  across the curves tested — a polar rose, a cardioid, a circle, a Lissajous
  figure, a spiral and a parabola, each at six zoom levels in both passes — at a
  cost of at most 2.5 ms. Two details matter: the measured angle is doubled
  before comparison, because an accepted segment
  discards its midpoint and emits the whole chord, so the angle actually drawn
  at the joint is about twice the one measured; and the criterion switches off
  below a 1.5-pixel chord, where a kink fits inside the stroke width and where
  chasing curvature would never terminate at a genuine cusp such as the r=0 of a
  rose.

- **The same blind spot in implicit curves.** The continuation tracer advanced
  with a *fixed* arc-length step — 4.5 px interactive, 2.5 px final — and its
  existing turn test is a validity check at ~45°, which bounds nothing visible.
  Measured turn per vertex during a gesture: 17.7° on the folium `x³+y³=3xy`,
  7.8° on an ellipse, 6.5° on a circle. A smoothness criterion now reuses the
  step-halving loop that was already there, bringing those to 3.9°, 3.7° and
  3.8°, with no vertex above 5° on those three. It does not bound every curve:
  `x²y²=1` zoomed out still leaves 6.9° at two vertices during a gesture, where
  the shorter steps are rejected by the chord test and the fallback below is
  what gets used. It cannot make things worse: the first *valid* step is kept as
  a fallback and returned when no scale manages to be smooth, so
  the function never returns `null` where it previously returned a step, which
  would have triggered spurious straight-line crossings or cut branches short.
  Explicit curves were checked too and needed nothing — they sample per pixel
  column, so their turns were already under 2°.

- **Parametric curves were drawn as a single straight line where they left the
  view.** On crossing the visibility boundary the tracer bisected to find the
  edge and emitted *only* that point, so the whole visible arc leading up to it
  became one chord. It bites as soon as zoom leaves the visible portion inside a
  single step of the initial sampling in `t`. Measured on `r = sin(θ/10)` at
  semiY=0.005: 7 points and 37.6 px of deviation interactive, against 519 points
  and 0.07 px final. The visible arc is now refined with the normal logic:
  515 points and 0.07 px in *both* passes, and the deeper zooms where both
  passes were broken are fixed as well.

- **The explicit sampler was frozen by a parity test against a dead copy of
  itself.** `tests/modulos/trazado.test.ts` required vertex-by-vertex equality
  with `src/render/muestreoExplicito.ts` — the legacy GraphEngine sampler, which
  no longer draws anything and which the two copies had already outgrown. That
  made the legacy code the definition of correct, and broke any improvement to
  sampling or refinement by construction, even one that did not move a single
  pixel: capping refinement below the pixel failed with "expected 4146 points,
  got 4090", a 1.4% difference in vertices all of them sub-pixel. The test now
  compares what is observable — same branch count, same vertical asymptotes
  *measured in pixels*, and the two curves within 0.25 px of each other on
  screen, as a two-way Hausdorff distance against the segments rather than the
  vertices. It still catches genuine regressions, verified by sabotage: nearly
  disabling refinement produces 6 failures and cutting the sample count by 8×
  produces 22.

Existing behavior is unchanged elsewhere: the full suite is now 345 tests, the
zoom suite 12, and both pass. Every performance figure above was measured with
medians over repeated runs on jittered viewports, so caching is not being timed.

### Known and not fixed

Functions whose local frequency grows, such as `tan(x²)`, still show regularly
spaced dark stripes when zoomed out, and the pattern changes between the
interactive and the final pass. The cause is now understood and measured: it is
a beat (moiré) between the uniform sampling grid and the local frequency of the
curve. Between consecutive samples the phase of `tan` advances by about
`2·x·s/π`, with `s` the spacing between samples, and where that advance lands on
a whole number two consecutive samples fall at the same phase, the sampled
signal looks flat and the column goes dark. The stripes therefore sit at
`x = n·π/(2s)`, evenly spaced with step `π/(2s)` — predicted 31.42 against 31.54
measured at x=±200, 52.36 against 52.15 at x=±120. Because `s` depends on the
number of samples, and the two passes use 2,000 and 8,000, the pattern is
exactly four times denser during a gesture than after it (measured ratios 4.04,
3.99 and 4.10), which is what makes the gaps appear to move. No sampling density
removes this — it is below the Nyquist limit, and raising the count only shifts
the stripes. The fix requires range-based evaluation instead of point sampling,
plus coverage-based rendering so that a dense region darkens gradually rather
than snapping to a solid block; that is engine work for a later release.
