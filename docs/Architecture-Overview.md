# LMath — Architecture Overview

**Technical guide for version 2.0.0.** This map describes one version and is meant to be
edited along with the code; treat anything it says as true *of 2.0.0* and check it against the
paths it names. Companion to the
[Technical Reference](https://github.com/LubrieDev/lmath/blob/main/docs/TECHNICAL-REFERENCE.md),
which has the detail.

Six Obsidian code blocks, one symbolic layer, one geometry engine, one math engine — and two
blocks that use neither the geometry engine nor the pipeline. Since 2.0.0 there is also a seventh
thing in the tree, `src/CAS/`, which is a replacement for the symbolic layer and **does not run**.

---

## Pipeline

The four **graphing** blocks (`_graph`, `_system`, `_derivate`, `_integral`):

```
block source
    │
    ├─ split into equations ─→ parse & normalize ─→ ObjetoMatematico
    │                                                    │
    │                                    ┌───────────────┴───────────────┐
    │                                    ▼                               ▼
    │                          LEFT: formula panel              RIGHT: canvas
    │                          simplify · solve for y           oracle → provider
    │                          derivative · integral            → tracer → Rama[]
    │                                    │                               │
    │                                    └──────→ LaTeX          renderer + overlay
```

`_trig` and `_vector` branch off at the first step and share none of it — no equation
split, no `ObjetoMatematico`, no oracle, no provider, no camera. A unit circle is an `arc()` and
a vector is a segment; a sampled polyline would draw either one worse:

```
block source
    │
    ├─ one line = one angle ─→ normalize & compile ─→ AnguloTrig[]
    │                                                    │
    │                                    ┌───────────────┴───────────────┐
    │                                    ▼                               ▼
    │                          LEFT: control panel            RIGHT: fixed canvas
    │                          reading · components           analytic figure,
    │                          angle slider                   no camera, no zoom
```

`_vector` takes the same shortcut, with two differences of its own: the block is a **list**
(one line, one card — not one formula per block), and its plane, while always present, only has
something on it when a line has numbers to draw:

```
block source
    │
    ├─ one line = one entry ─→ genus by letter case ─→ Entrada[]
    │                                                    │
    │                                    ┌───────────────┴───────────────┐
    │                                    ▼                               ▼
    │                          LEFT: one card per line       RIGHT: always a plane
    │                          \vec{v} · A · F(x,y)          arrows and dots,
    │                                                        KaTeX names, ⓘ panel,
    │                          declared / deduced views       framed once, no camera
    │                                                        (dimmed + reason if empty)
```

---

## Rings

Dependencies point inward. Enforced by import discipline.

| Ring | Content | mathjs | DOM |
|---|---|---|---|
| **0** | Contracts — pure types, zero logic, zero deps | no | no |
| **1** | Numeric geometry — tracing, discovery, analysis, scene, rendering | no | canvas only |
| **1b** | Math engine (`src/math/`) — exact arithmetic, real roots, systems | only to read an equation | no |
| **2** | Symbolic layer — parsing, algebra, LaTeX | yes | no |
| **2′** | `src/CAS/` — the replacement symbolic core. **Not in the production path**; nothing in Rings 0–3 depends on it | only through one bridge | no |
| **3** | Host — Obsidian plugin, settings, panels | indirect | yes |

Ring 2′ is the only one whose boundary is enforced by tests rather than by discipline
(`tests/modules/frontera.test.ts`), and it is enforced in **both** directions: nothing outside
`src/CAS/` may reach past its two façades, and nothing inside may depend on the interface.

---

## Symbolic layer — Ring 2

| Module | Role |
|---|---|
| `parser.ts` | LaTeX/Unicode → mathjs. The single normalization route every consumer shares. |
| `formatoExpr.ts`<br>`expr/` | Shared algebra toolkit: the flat node view (`expr/nodo`), sign interpretation, expansion guard, fractions, radicals. `formatoExpr` keeps serialization and canonical order and re-exports the rest, so every consumer still has one import. |
| `simplificar.ts` | Simplify, gated by a numeric equivalence check including non-finiteness. |
| `despejar.ts`<br>`despeje/`<br>`despejeInverso.ts` | Solve for `y`: layer inversion, denominator clearing, affine-by-evaluation, radical rationalization. Every non-equivalence carries a guard or is rejected. `despejar.ts` keeps the algorithm — everything to `D = lhs − rhs`, choose a strategy, validate; `despeje/estrategias` holds the per-term strategies, `despeje/verificacion` the numeric check, `despeje/presentacion` the final tidying that only the panel sees. Two strategies recurse into the solver and receive it as an argument, so the cycle is in the signature instead of in the imports. |
| `condiciones.ts` | Resolves the domain guards as one system of inequalities (sign table + intersection), so a domain reads `x ≥ √3`. |
| `derivar.ts` · `integrar.ts`<br>`integral.ts` | Symbolic derivative and antiderivative; definite-integral notation and area. |
| `latex.ts` | The one typographic pipeline. Panel and plot never disagree because both start from the same normalized string. |
| `core/parsing/restriccionDominio.ts` | The `{0 ≤ x ≤ 2π}` written next to the formula. What tells it from a LaTeX group is the comparator inside; it is split off before anything else reads the equation, and clipping is just NaN outside the interval (the parameter's domain, in parametric and polar curves). An interval it cannot read is never half-repaired: the equation comes back untouched and the group is flagged so the block says so out loud instead of coming up blank. |
| `core/parsing/parametros.ts` | The `A = 1` declared above the formula. Split off before equations are, or it becomes the curve; the value is substituted into the text rather than passed in a scope, so the engine keeps seeing a one-variable function and keeps the fast compiler. Moving a slider replaces the scene and leaves the camera alone. |
| `core/fields/` | The mathjs boundary: expressions compiled into numeric oracles. Nothing below this imports mathjs. |

---

## Math engine — `src/math/`

Added in 1.4.0. It answers questions **from the equations**, never from the drawing, and it exists
because that distinction had been got wrong twice in the same way.

The solutions of a system used to be the crossings of the traced polylines, clipped to the visible
view (`core/analysis/interseccionesRamas.ts`, which still does that job for the plane's markers).
That made a displayed value depend on where the polyline's vertices happened to fall — an
intersection at the origin read `(8.4e-6, 8.4e-6)` after a pan — and made *which* solutions existed
depend on the window. The `f(x)` of the crosshair had the same shape of defect, interpolated
between vertices. Both are now answered here.

| Module | Role |
|---|---|
| `racional.ts` | Exact rationals over `bigint`. `aNumero` is the single place where exactness is lost, and it is named so it can be found. |
| `polinomio.ts` | Polynomials in one variable over ℚ: gcd, square-free part, **Sturm sequences**, Cauchy bound, real-root isolation and refinement, exact rational roots. Sturm is what makes "all the real roots" a claim with a theorem behind it rather than an estimate — a sampling sweep cannot see a double root at all. |
| `polinomio2.ts` | Two variables, and elimination: substitution when a curve is explicit, **resultant** (Sylvester + fraction-free Bareiss) when neither is. |
| `extraer.ts` | Written equation → exact polynomial, or `null`. Carries fractions of polynomials, so `y = 1/x` stays on the exact path. Returning `null` is an answer: it sends the pair to the numeric route rather than approximating in silence. |
| `numerico.ts` | The non-polynomial route: deterministic sweep over a **constant** interval (±100), bisection, Newton, root/pole discrimination. Handles the three explicit shapes — `y = f(x)` against `y = g(x)` (sweep x), `x = f(y)` against `x = g(y)` (sweep y), and the mixed pair by **composition** (`f(g(y)) = y`) — so a vertical line is no longer out of reach. The last two are opt-in (`simetrico`) because they would otherwise pre-empt the exact answers the branch stage produces. Not complete over ℝ — no algorithm is — and the panel states the interval and the variable it searched. |
| `ramas.ts` | Written equation → the N equations it really represents. Reuses the solver for `y` (transposing x↔y when the unknown is the other one), expands the ± through `expandirDobleSigno`, and separates the `dom` domain guards so the caller can apply them as a predicate. This is the seam that was missing: the tracer already consumed equations in this form, the solver did not, and that asymmetry made the answer depend on how the user wrote the equation. |
| `simbolico/` | Exact values beyond ℚ. `valorExacto.ts` is the quadratic field `a + b√d` (canonical, so `√8` becomes `2√2` and `1/√2` becomes `√2/2` by construction); `raicesSimbolicas.ts` recovers the closed form of a polynomial's real roots by pairing conjugates and **verifying the candidate quadratic by exact division**; `polinomioExacto.ts` evaluates ℚ[x] inside that field; `constanteExacta.ts` recognises constants that are rational however they are written (`nthRoot(64,3)` is 4). |
| `resolverSistema.ts` | Classify, eliminate, solve, **verify**. Verification is not a formality: elimination genuinely produces false candidates (a resultant works over ℂ; clearing denominators invents solutions where the curve does not exist). Also applies the domain restriction, which is separated before solving and re-applied after. |
| `ordenada.ts` | The exact ordinate reader for the crosshair. Only for explicit `y = f(x)`; returns `null` otherwise, and the caller keeps reading the polyline. |

**Where the boundary is.** Exact and complete over ℝ for polynomial and rational systems, and the
coordinates keep their **closed form** when they have one of degree ≤ 2 — `(7−√13)/2`, not
`1.6972243622680054`. Degree ≥ 3 (∛2), two different radicals (√2+√3) and transcendentals (π, e) have
no representation here and come out as decimals, marked as such. Viewport-independent but
interval-bounded for the rest. Silent about a non-polynomial implicit curve rather than guessing.
Parametric and polar curves do not reach it at all.

**The four rungs**, in the order `resolverBloque` tries them: exact direct → numeric direct → branches
→ symmetric numeric. The order is a contract, not a preference: each rung can solve things the next
one solves *worse*, so promoting any of them turns exact answers into approximate ones. That is not a
hypothesis — widening the second rung did exactly that, and the tests now pin it.

**Above the ladder, the `±` is expanded** (1.5.0). `y = ±⁴√(1−x⁴)` is not an equation but the family
of two, and the tracing side always knew that — it is why the plot draws both halves. The solver did
not, so a system whose two curves are odd listed one of its two symmetric crossings while the plot
drew the other: two halves of one engine disagreeing about how many curves are written. Branches stay
**grouped** by the equation they came from and pairing is group against group, never a branch against
its own sibling: where the two halves meet, the curve is closing on itself, not crossing another one.

---

## Geometry engine — Ring 1

| Module | Role |
|---|---|
| `core/providers/` | One strategy per curve kind behind a single seam `geometria(viewport, tolerancia)`: explicit, implicit, rasterized, separable, periodic, parametric/polar, plus cache and union decorators. |
| `core/tracing/` | Oracles → polylines: adaptive sampler, parametric sampler, continuation, marching squares. |
| `core/discovery/` | Where is the curve? Sign-change seeds on a grid. |
| `core/analysis/` | Reads the produced geometry: roots, vertices, intersections, rail progression, signed area. Since 1.4.0 this is what it is *for* — the drawing's own properties — and no longer the source of numbers the user reads: the intersections it computes still place the markers on the plane, but the solutions listed in the panel come from the math engine. |
| `core/scene/`<br>`core/rendering/`<br>`core/interaction/` | Scene orchestration and auto-framing; Canvas-2D renderer and overlay; camera and gestures. |

---

## Unit circle — `src/trig/` (Rings 1–2)

Its own path, parallel to the engine. Three pure modules, a parser and a renderer.

| Module | Role |
|---|---|
| `bloqueTrig.ts` | Block source → angles. One line, one angle; no options syntax, so the block cannot grow one. The only module here that compiles expressions (Ring 2). |
| `modeloTrig.ts` | Everything derivable from an angle, once: point, quadrant or half-axis, reference angle, turns, the six ratios. Undefined ratios are `null`, never a huge number. |
| `exactosTrig.ts` | The 7 first-quadrant notables tabulated; the other 17 derived by reduction and sign. Exactness is granted by the *text* of the angle, never by proximity to a nice value. |
| `interaccionTrig.ts` | Drag, magnet, slider range and animation step — all DOM-free, so the rules are testable and only the event wiring lives in the host. |
| `renderTrig.ts` | Canvas-2D figure with a fixed framing, and the single function that writes an angle in degrees. |

---

## Vector notation — `src/vector/` (Rings 1–2)

Its own path too, and the smallest in the plugin: four modules, no state, no camera.

| Module | Role |
|---|---|
| `bloqueVector.ts` | Block source → entries, and entries → what the plane can draw. The genus of a line is the **case of its first letter** (lowercase a vector, uppercase a point), overridden by arguments (a field) or by an explicitly written arrow. Two passes, so `AB` may precede the points it names. Ring 2: the only module here that compiles expressions. |
| `latexVector.ts` | Entry → LaTeX, both for its card and for its name on the plane, delegating every expression to `latex.ts` so a component is typeset as it would be in any other block. Notation the normalizer cannot read (`\nabla`) is passed to KaTeX verbatim instead of being degraded. |
| `renderVector.ts` | Canvas-2D arrows with filled heads and dots for points; the *positions* of the names (which the host sets in KaTeX over the canvas, so they are the same letters as the cards); and a framing computed once from the drawing — which may zoom out as well as in, because a finite set of arrows is fully known. The plane is always drawn; when there is nothing to put on it the host dims it and says why. |
| `analisisVector.ts` | What follows from the drawing, for the ⓘ panel: magnitude, direction, unit vector; for exactly two arrows the dot product, angle, determinant and areas; for exactly two dots the distance and midpoint. No new vector is created here — that is the block's line, not a limitation. |

---

## Host — Ring 3

| Module | Role |
|---|---|
| `main.ts` | Registers the six block languages and the settings tab. One string discriminant per block selects the mode. |
| `host-obsidian/MotorExperimental.ts` | The adapter proper: `process(source, el, ctx)` for the four blocks that plot a curve, plus the class the plugin instantiates. Everything it owns is three things — the plugin, the mode, a getter for the live settings — declared as the `Motor` contract in `contexto.ts`. |
| `host-obsidian/contexto.ts` | What a block needs from the adapter, and nothing more. The modules below depend on this interface rather than on the class, which is what keeps the graph acyclic. |
| `host-obsidian/blocks/` | `_trig` and `_vector` end to end. Neither uses the geometry engine — a unit circle is closed-form and a vector is a segment — so they share only the frame. |
| `host-obsidian/ui/` | Chrome (`estilos`), small controls (`controles`), the parameter slider (`deslizador`), the toggle bar (`menu`), the formula panel (`scrollerLatex`), the door to it on a narrow block (`botonFormula`), the door to the block's source (`edicionBloque`), the panel mounts (`paneles`) and the layout arithmetic (`reparto`). Free functions: none of them read adapter state. |
| `host-obsidian/info/` | The ⓘ chips. `botones` describes a formula and is written once; `plano` reads the plane as it is now — the system's solutions with each parameter's live value, the notable points of the current view — and hands back a refresher. |
| `host-obsidian/analysis/` | The pure half of the adapter: block classification, the wording of the ⓘ panels, the automatic transformations. No DOM, so it is testable without mounting a block. |
| `host-obsidian/{ajustes,fuentes,plataforma}.ts` | Settings tab, embedded fonts, touch detection. |
| `i18n/` | One file per language (`en`, `es`, `pt`) implementing the contract in `textos.ts`; `index.ts` is the runtime and the only door. Adding a language is adding a file. |
| `engines/obs-graph/` | Legacy WebGL engine, kept behind a compile-time flag as a fallback. |
| `src/host-obsidian/nombresBloque.ts` | The six block identifiers and the one function that answers which names a block responds to. It used to live in a `migracion/` folder at the repo root, alongside the scanner and rewriter that converted notes from `obs-*` to `_*`; **that campaign was retired from the published tree in 2.0.0** and its code is kept out of the repo, in `.dev/migracion/`. The reason was not tidiness: its vault walk called `getMarkdownFiles()`, which Obsidian's review flags as *Vault Enumeration*, and that check is **static** — hiding the button behind a flag did not silence it, only cutting the import did. This table was never migration, so it stayed. |
| `CAS/` | **Built and not in the production path.** The replacement symbolic core: a real expression type with hashes, an exact numeric tower, a function registry, a structural canonical form, general algebraic numbers, and its own reader. None of it appears in `main.js` — verified by symbol. Two doors out (`api.ts`, `api-legado.ts`) and boundary tests that enforce them. Its seven invariants and the whole staged plan are in §19 of the Technical Reference. |

**Colour has one rule**: the frame is the theme's (`--lmath-*` tokens on `.lmath-container`, each
resolving to an Obsidian variable), the plot is ours (`paleta.ts`, two hand-tuned palettes, because
six curve hues must stay distinguishable and no theme variable promises that). No colour literal
outside those two places. Since 1.5.0 the chrome is three layers deep and all three are defined
against the *note* — surface = `--background-primary`, panel = that lifted toward the ink, card and
ⓘ popover = that sunk toward black — and never against `--background-secondary`, whose relation to
the primary flips from theme to theme. The card is measured against the note rather than against
the panel on purpose: chained, raising one would raise the other and the layers would never
separate.

> **Why the host is split this way.** Not to make files shorter. `MotorExperimental` was a class
> with three fields and forty methods, and the methods did not touch the fields — so they were
> functions wearing a class. Making that explicit is what let `_trig` and `_vector` become
> modules of their own instead of a third of somebody else's file.

---

## Invariants

- **One normalization route.** Panel, engine, solver, derivative and tools agree byte for byte
  on what an expression means.
- **Formal algebra never overrides numerics.** Every symbolic rewrite is validated by
  sampling, with domain fidelity, before being shown or plotted.
- **A transformation that is not an equivalence states its condition or is rejected.** Never a
  formula laxer than the curve.
- **Non-finite means no curve.** Every oracle coerces to NaN; every geometric stage reads that
  as a hole. It is also how a written domain restriction is enforced — clipping needed no new
  machinery, only a function that stops answering outside its interval.
- **The strategy is invisible.** Nothing above a provider knows which algorithm drew a branch.
- **Determinism over timeouts.** Budgets are counts, never wall-clock, so caches and tests stay
  stable.
- **Fail visibly, fail flat.** A labelled veil instead of a wrong or partial answer.
- **Exactness comes from provenance, not proximity.** A closed form is shown only when the
  text asked for one; a decimal stays a decimal however close it passes to π/6. *Widened in
  2.0.0:* provenance now also decides **how many figures may be shown** and **how far a value may
  be snapped to a closed form** — 6 figures and 1e-12 for a number that was evaluated, 4 and 1e-4
  for one that was estimated by a numeric method. How many of a number's figures mean anything is
  not a property of the format; it is a property of how it was obtained, and only whoever computed
  it knows.
- **One number, one rounding — presentation may still differ.** *Amended in 2.0.0, because the
  original wording ("the same quantity may not read differently on two surfaces") is no longer
  literally true.* The same quantity may not be **rounded** differently on two surfaces at the same
  time: that would be two answers. It may be **presented** differently where the surface's job
  differs — the crosshair readout keeps its padding zeros because the number changes as the cursor
  moves and a fixed width is what keeps two nearby heights apart, while a panel trims them because
  a static number competes with nothing. `3.00000` and `3` are the same answer; `2.9989` and
  `2.99888` would not be.
- **Looking is not editing.** No interaction in any block rewrites the note.
- **A narrow block has two faces, not a stack.** *All six since 2.0.0.* The formula panel is the
  block's other side, not a card posed over the plane, so the button that swaps them names its
  **destination** (`f(x)` / the plane / the unit circle) and never a ✕ — a ✕ would claim there is
  something on top to dismiss. What survives the swap is a stylesheet rule and not a list of
  elements: a chip added tomorrow is born hidden in formula mode, and surviving is an explicit
  decision where it is created. The block's **controls** are not its content — `_trig`'s strip of
  ratio boxes, θ reading and slider stays usable in both faces, and the panel stops above it.
- **Say only what was written.** A block never invents what the author left out: `AB` without
  both points declared stays a product, and a point is drawn as a dot, not as a position vector.
  What is *deduced* from a drawing (the ⓘ of `_vector`) is a property of what is already
  there — a magnitude, an angle — never a new object: there is no `u+v` in it.
- **The drawing is not the source of truth.** *Added in 1.4.0, after breaking it twice.* The
  viewport, the polyline and the sampling exist to visualize; when a question can be answered
  from the expression, it is answered from the expression. A number the user reads must not
  change because they zoomed. The two breaches — the solutions of a system, and the crosshair's
  `f(x)` — both came from the same reasonable-sounding rule, *the interaction reads the
  geometry*, which is right for implicit and parametric curves and wrong wherever the expression
  can simply be evaluated.

  *Where it still holds in 2.0.0:* on a curve with no exact reader — implicit, parametric, polar,
  or any block with more than one curve — the height under the cursor is still interpolated from
  the polyline and still moves with the zoom. What changed is that the scene now **says so**
  (`lecturaEnCurva` returns the provenance alongside the value), so at least such a reading no
  longer claims six figures it does not have. Making it exact needs the solver of E5.

---

## Tests

| Command | Covers |
|---|---|
| `npm run test` | Engine, symbolic, `_trig`, `_vector` and math-engine units. Run on every change. |
| `npm run test:zoom` | Zoom-out sweep: the curve must not vanish or flicker. |
| `npm run fuzz` | Differential fuzzer for solver soundness. The `UNSOUND` column must stay at zero. |
| `npm run bateria` | Graduated battery for solver completeness and domain. |
| `npm run oro` | Regenerates the symbolic core's golden dumps and reports what changed, classified as cosmetic / mathematical / scope / exactness / undecidable. Deliberate, never automatic: a golden file that regenerates itself proves nothing. |
| `.dev/sondas/` (no script) | Probes, not tests: they measure and print rather than assert. The vault sweep (hand-written blocks from a real vault, hunting exceptions, empty curves, mute panels and non-finite coordinates); `medirFronteras.ts` (the layer graph — edges, inversions, cycles, transitive closures); `sondaLecturas.ts` and `sondaPaneles.ts` (what each formatter actually prints, so documentation quotes measured strings instead of remembered ones); `auditarDocs.cjs` (every identifier and path the docs cite, checked against the source). None has a `package.json` entry — they are run on demand with `esbuild --bundle` + `node`. |

> A green suite is not a proof. The corpus sweep found defects in modules the suite already
> covered, with the suite green: it checked the answers the engine had been asked for, and the
> sweep asked different questions of the same code.
