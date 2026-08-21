# LMath — Internal Technical Reference

**Technical guide for version 2.0.0.**

This document describes the source tree **as it stands at one version**, and it is expected to
go out of date: the plugin keeps growing, and a reference that claimed to be permanent would
just be a reference that lies later. Read it against the version in the heading, and when you
change the code, change the section that describes it in the same pull request — that is the
only thing that keeps this file worth reading. Sections carry the paths they describe precisely
so that a stale paragraph can be checked against the file it names.

Reverse-engineered from the source tree. Every statement in this document is backed by code;
file paths are given per section. Where something cannot be confirmed from the code, it is
stated explicitly. This is a reference manual for the internals, not onboarding material — for
how to build, test and contribute, see `CONTRIBUTING.md`.

**Coverage note.** §4.2b (domain restriction), §4.2c (declared parameters) and §18 (the math
engine) described unpublished code through several drafts; **all three shipped in 1.4.0**, together
with the sections they touch (§4.2, §4.4, §5.1, §5.2, §5.3, §5.6, §9.4, §10.2, §14, §15.1, §16.3).

There is exactly **one** "in the tree but not in a release" caveat left, and it is large: **§19,
the symbolic core (`src/CAS/`)**. That code is built, tested and deliberately kept out of the
production path — it does not appear in `main.js`. Everything else in this document describes code
that runs when you open a note. §19 says so again in its own heading, so a paragraph read out of
context cannot mislead.

The v1.4.0 pass added §14 for the new `_vector` block — including §14.4 for what its ⓘ panel
deduces — and §15.0 for the reorganised host layer, and updated the sections it touches (§1, §2,
§3, §13.5, §14.3, §15.1, §15.2, §15.3, §16.3), verifying them against the code. Three of those updates are about changes that reach the
published blocks: the settings that now rebuild a block on the spot (§15.2), the redrawn `_trig`
slider (§13.5), and the shared view toggle generalised to lists of formulas (§15.1). The v1.3.2
pass had done the same for `_trig` (§13,
§15.2, §15.3, §17). The engine-internals sections (§4–§12) were last revised for v1.2.4 and
have not been re-audited since; they describe machinery neither `_trig` nor `_vector`
uses — **except** where §18 corrects them: the numbers the panel shows for a system's solutions,
and the `f(x)` of the crosshair on an explicit curve, no longer come from the traced geometry.

**A correction, stated where it belongs.** Two things this document previously described as
features of the geometry-reading design were defects, and §18 says so plainly: deriving a
system's solutions from the crossings of the plotted polylines, and the crosshair's `f(x)` from
interpolation between plotted vertices. Both made a displayed number depend on the zoom. The
principle they came from — *the interaction reads the geometry* — remains correct for implicit,
parametric and polar curves, and is wrong wherever the expression can simply be evaluated.

Naming note: the codebase is written with Spanish identifiers and comments. This document
uses the actual identifiers (`Escena`, `ProveedorGeometria`, `despejar`…) so that text and
code can be cross-referenced directly.

---

## 1. System overview

The plugin registers six Markdown code-block languages in Obsidian — `_graph`,
`_system`, `_derivate`, `_integral`, `_trig`, `_vector` — and renders each
block as a two-pane widget: a panel on the left and a Canvas-2D plane on the right.

The first four are **graphing** blocks: a KaTeX formula panel and a plot with camera, zoom,
pan and crosshair. `_trig` (added in 1.3.2, §13) and `_vector` (added in 1.4.0, §14)
share the frame — container, panel box, column/floating split, palette, lifecycle — and
**nothing else**: neither has a `Camara`, an `Escena`, a `ProveedorGeometria` or a tracer,
because neither has a curve to sample. `_trig`'s left pane is a control surface rather than
a formula showcase; `_vector`'s is a *list* of cards, one per line, and its plane is always
present — dimmed with a reason when no line has numbers to draw (§14.5). When reading §4–§12,
assume neither is involved.

Internally the code is organized in **rings** (the term appears in
`src/core/contracts/index.ts`), enforced purely by import discipline:

| Ring | Content | mathjs? | Obsidian/DOM? |
|---|---|---|---|
| 0 | `src/core/contracts/*` — types only, zero logic, zero deps | no | no |
| 1 | Numeric geometry: `src/core/{tracing,discovery,analysis,scene,rendering,interaction}`; plus `src/trig/{modeloTrig,exactosTrig,interaccionTrig,renderTrig}.ts` (§13); plus `src/vector/{renderVector,analisisVector}.ts` (§14) | no | Canvas 2D only (rendering/interaction) |
| 1b | Math engine: `src/math/*` (§18) — exact rational arithmetic, real roots, elimination, systems. Depends on Ring 2 only to *read* an equation (`extraer.ts`); the arithmetic itself imports nothing | only in `extraer.ts` | no |
| 2 | Symbolic/parsing layer: `src/parser.ts`, `src/evaluador.ts`, `src/core/parsing/*`, `src/core/fields/*`, `src/{latex,simplificar,despejar,despejeInverso,condiciones,derivar,integral,integrar,formatoExpr,analisis,degeneradas,constantes}.ts`; plus `src/trig/bloqueTrig.ts`, which compiles the written angle, and `src/vector/{bloqueVector,latexVector}.ts` (§14) | yes (quarantined) | no |
| 3 | Host: `main.ts`, `src/host-obsidian/*`, `src/engines/obs-graph/GraphEngine.ts` | indirectly | yes |

Two hard quarantines follow from this:

- **mathjs quarantine** — the geometry engine never touches mathjs. Expressions are compiled
  into numeric *oracles* (`FuncionReal`, `CampoEscalar`, `Parametrizacion`) in
  `src/core/fields/*`, and everything below consumes only those interfaces
  (`src/core/contracts/oraculos.ts`).
- **Obsidian quarantine** — only `main.ts`, `src/host-obsidian/*` and the legacy
  `GraphEngine` import the `obsidian` package. The engine is framework-agnostic and fully
  testable in Node (`tests/motor.test.ts`, `tests/zoom.test.ts` run with esbuild + node,
  no DOM).

There are **two rendering engines** for `_graph`:

- The **new engine** (`src/core/` + host adapter `src/host-obsidian/MotorExperimental.ts`),
  active for the four graphing blocks. `_trig` and `_vector` use the same host adapter
  but not the engine.
- The **legacy `GraphEngine`** (`src/engines/obs-graph/GraphEngine.ts`, WebGL-based), kept
  intact as a fallback behind the compile-time flag `MOTOR_EXPERIMENTAL = true` in
  `main.ts`. Only `_graph` can fall back; the comment in `main.ts` records that the
  old `SystemEngine` (marching-squares) was removed with no way back.

---

## 2. Entry point and block registration — `main.ts`

`LMathPlugin.onload()` performs, in order:

1. `cargarAjustes()` — loads persisted preferences via `loadData()`, copying **only** keys
   that exist in `AJUSTES_POR_DEFECTO` and with matching types. This whitelist-merge exists
   because a retired setting (`simplificarAuto`) persisted forever under a naive spread
   merge; fossil keys found on disk trigger an immediate re-save with the filtered object
   (`cargarAjustes` in `main.ts`). It also calls `fijarIdioma()` before any UI text is produced, so the
   load notice and settings tab already appear in the stored language.
2. Registers the settings tab (`PestanaAjustesLMath`, §15.2).
3. `registrarFuenteLora(this)` without `await` — non-blocking font registration (§15.4).
4. Creates one `MotorExperimental` per block type and registers the six
   `registerMarkdownCodeBlockProcessor` callbacks. A **single string discriminant** selects
   the mode; until 1.3.2 this was three positional booleans, which a fifth block would have
   turned into `(false, false, ajustes, false, true)`:

   | Block | Construction | Meaning |
   |---|---|---|
   | `_graph` | `new MotorExperimental(this, "graph", ajustes)` | one curve |
   | `_system` | `new MotorExperimental(this, "system", ajustes)` | N equations, N colors |
   | `_derivate` | `new MotorExperimental(this, "derivate", ajustes)` | plot f′(x) |
   | `_integral` | `new MotorExperimental(this, "integral", ajustes)` | plot integrand + shade ∫ₐᵇ |
   | `_trig` | `new MotorExperimental(this, "trig", ajustes)` | unit circle, own renderer (§13) |
   | `_vector` | `new MotorExperimental(this, "vector", ajustes)` | vector notation, one card per line, own renderer (§14) |

   `ajustes` is a **live getter** (`() => this.ajustes`), not a snapshot, so a settings change
   reaches every block without reloading the plugin. Since 1.4.0 it does not even wait for a
   re-render: the tab notifies, and each mounted block tears itself down and remounts (§15.2).
There is no step 5: the dev-console global that used to be installed here was removed in
1.1.8 (§16.2).

---

## 3. Per-block execution pipeline

`MotorExperimental.process(source, el, ctx)`
(`src/host-obsidian/MotorExperimental.ts`) is the orchestration point. The complete flow
for a block render:

`_trig` and `_vector` leave this flow **before it starts**: `process` dispatches to
`procesarTrig` (§13) / `procesarVector` (§14) as its first act, so none of the stages below run
for them — no equation split, no `ObjetoMatematico`, no composition root, no camera.

```
source (raw block text)
  │
  ├─ modo === "trig"   → procesarTrig(source, el, ctx)   and return  (§13)
  ├─ modo === "vector" → procesarVector(source, el, ctx) and return  (§14)
  │
  ├─ dividirEcuaciones(source)                 structural split (§4.1)
  │     └─ visibles = all (system) | first (others)
  │        (a trailing {a ≤ x ≤ b} rides along inside each equation and is split off
  │         by construirObjeto and by the panel, each for its own use — §4.2b)
  │
  ├─ mode-specific extraction
  │     _derivate : extraerFuncion → clasificarDegenerada → derivarEcuacion (§11)
  │     _integral : extraerIntegral → integrand/limits (§12)
  │     otherwise    : graficadas = visibles
  │
  ├─ LEFT PANEL  montarPanelLatex / montarPanelDerivada / montarPanelIntegral (§15.1)
  │     └─ transformation pipeline → bloqueALatex → MarkdownRenderer.render ($$…$$, KaTeX)
  │
  └─ RIGHT PANE (canvas)
        crearMotor / crearMotorSistema (composition root, §7)
        ├─ classification veil (clasificarBloque → localizarVelo) (§4.4, §15.3)
        ├─ Camara + Navegacion wiring (§10)
        ├─ two-pass render scheduler (below)
        ├─ auto-framing (encuadreAutomatico, once) (§9.4)
        └─ UI chrome: 🏠/+/− buttons, ⌖ rail toggle,
           per-curve color selectors, ⓘ popovers
```

(The experimental ⚙ badge that used to sit in that chrome was removed in 1.2.8; the glyph
appears nowhere in `src/`.)

### 3.1 Two-pass rendering scheduler

The host implements a progressive strategy (ported from `GraphEngine`,
the two-pass budget in `MotorExperimental.ts`):

- **Interactive pass** — during any gesture (pan/zoom/rail). Coalesced through
  `requestAnimationFrame`: `programarRedibujo()` sets `pendienteRecomputar` and schedules at
  most one frame; the frame runs `escena.actualizar(vp, "interactiva")` then `pintar()`.
  Cursor-only movement calls `programarPintado()` — repaint without recompute.
- **Final pass** — `programarFinal()` (re)arms a 150 ms `setTimeout`; when the camera stops
  moving it runs `escena.actualizar(vp, "final")`, repaints, and notifies
  `alRecalcularFinal` (so an open ⓘ popover refreshes its intersection/notable lists).

The `pasada` value travels down as `Tolerancia.pasada` and every stage adapts to it:
sampler density and refinement depth, continuation step size and evaluation budgets,
discovery grid resolution, and whether "extras" (notable points, asymptotes,
intersections) are computed at all — providers only compute them on `"final"`.

### 3.2 Canvas metrics

`redimensionar()` (`MotorExperimental.ts`) measures the canvas CSS box with
`getBoundingClientRect()` on every relevant event instead of trusting the initial height
(261 px) and dpr: app-level zoom (Ctrl+wheel) changes `devicePixelRatio` and themes that
express note width in `rem` reflow the block. Both a `ResizeObserver` on the wrapper and a
window `resize` listener call it (the latter covers dpr-only changes the observer cannot
see). It sets the physical buffer (`ancho·dpr × alto·dpr`), applies `setTransform(dpr,…)`,
and re-renders.

All listeners/observers/rAF handles are released through a `MarkdownRenderChild` registered
with `ctx.addChild` — Obsidian re-renders blocks freely, and every subsystem registers its
cleanup there (`limpieza.register(...)` calls throughout `process`).

---

## 4. Structural extraction and classification

A design principle repeated in `derivar.ts`, `integral.ts`, and `dividirEcuaciones.ts`:
**block structure is classified and extracted before anything reaches the algebraic
parser**. Structural tokens (`d`, `dx`, `\int`, the `y` of an implicit relation, the
`x(t)=` header of a parametric component) would otherwise be normalized into garbage
symbols (`d*x`, `i*n*t`) that evaluate to NaN silently, or worse, get differentiated.

### 4.1 Block → equations: `src/core/parsing/dividirEcuaciones.ts`

- Unwraps LaTeX environments generically (`\begin{cases}`, nested `\begin{aligned}`,
  `array` with column specs) from the outside in — precisely the format the plugin's own
  panel emits, so displayed output round-trips as input.
- Splits on newlines and on `\\` (with optional `[1ex]` spacing arg). **Never on commas**:
  the parametric tuple `(x(t), y(t))` contains one.
- Strips `&` alignment markers.
- Desugars named function definitions `f(x) = rhs → rhs` (single-letter names only,
  excluding `x, y, e, i` — see `NO_ES_ETIQUETA`), because otherwise `f(x)` normalizes to
  the implicit product `f*x` and the block is classified as a bogus implicit curve.
- Fuses two separately-written parametric components `x(t)=…` / `y(t)=…` into the canonical
  tuple `(X, Y)` via `fusionarComponentes` (`componentesParametricas.ts`). Only a complete
  pair fuses; a lone component is handled by §4.3.

This is deliberately the single choke point through which the graph, the panel, and the
tracer all pass, so the three views can never disagree about what the block contains.

### 4.2 Equation → `ObjetoMatematico`: `src/core/parsing/construirObjeto.ts`

Classification order (order matters). Step 0 is the **domain restriction** (§4.2b): the trailing
`{…}` group is split off before anything reads the equation, and applied to the object once it is
built. `ObjetoBase.fuente` keeps the **whole** source, restriction included — it is what the
author wrote, and the panel needs it.

1. **Parametric tuple** `(X, Y)` — detected before the `=` split (a tuple has no `=`):
   enclosing parentheses + exactly one depth-0 comma.
2. **Function of the parameter** — `x(t)=…`, `y(t)=…`, or a bare expression whose free
   symbols include `t` but neither `x` nor `y` (`funcionDelParametro`,
   `componentesParametricas.ts`). Treated as an *explicit* object with the variable
   renamed `t → x` on the AST (`renombrarParametroAX` — a tree transform, not a text
   replace, so `\cot t` survives). The declared axis matters: `y(t)` keeps the classic
   orientation; `x(t)` sets `ObjetoExplicito.salida = "x"` and the curve is traced in the
   transposed world and rotated back (§8.1) — the value *is* the abscissa, so the parameter
   climbs the vertical axis.
3. **`lhs = rhs`** —
   - one side normalizes to exactly `y` → **explicit** `y=f(x)`;
   - one side normalizes to exactly `r` → **polar** `r=g(θ)` with the domain computed from
     the curve's real period (§4.5);
   - otherwise → **implicit** with `F(x,y) = (lhs)−(rhs)`.
4. **Bare expression** — implicit `expr = 0` if it contains a free `y`
   (`contieneYLibre`, `parser.ts`), else explicit `y = expr`.

The constructors compile the oracles immediately via `src/core/fields/*` (§6.2). The
contract types `ObjetoRelacion` (inequalities) and `ObjetoSistema` exist in
`contracts/modelo.ts` but **have no producer or provider**: `construirObjeto` never emits
them and `crearProveedor` does not handle them. Systems are realized instead as N
independent scene objects (§7). The same holds for `HechosSimbolicos`, `CampoEscalar.gradiente`,
`Estilo.guiones`, and `Estilo.relleno`: declared in Ring 0 and **never populated** — forward-looking
contract surface only. (`restringirCampo` (§4.2b) forwards `gradiente` when it is there, so the
restriction stays correct the day something starts emitting it; nothing produces one today, so that
branch is dead code by design.)

### 4.2b Domain restriction: `src/core/parsing/restriccionDominio.ts`

The syntax of issue #1, and Desmos's: the interval goes in **braces at the end** of the
expression — `\sin x {0 \leq x \leq 2\pi}`. `separarRestriccion` splits an equation into what is
drawn and where.

**What tells a restriction from a LaTeX group is the comparator inside it**, not its position.
Braces are the most frequent structural character of a formula (`x^{2}`, `\frac{1}{2}`,
`\sqrt{x}`) and none of those contains one, which is what keeps the rule off the notation people
already write. The group is looked for at the end only, walking back by depth — `\frac{1}{2}
{0 ≤ x ≤ 1}` has three groups and only the last is a restriction.

That reasoning held for the expression but not for the **block**: this section used to claim the
rule could not collide with existing notation, and a real block falsified it. An `_system`
written as `\begin{cases}y = x {0 ≤ x ≤ 2}\\y = x^2\end{cases}` veiled itself, because the veto
was fed a source split by newlines and a `cases` has none — the restriction survived the strip and
its `\leq` tripped the command check. Fixed with `lineasDeEcuacion`, which splits on newlines
**and** on LaTeX's `\\`, the two ways a system can be written. Worth remembering as a shape of bug
rather than as one bug: an argument about a *line* is not automatically an argument about a *block*.

It is separated **before anything else** for two reasons. The group would reach mathjs as
grouping and blow up the expression; and the comparators are not accepted by
`comandosNoSoportados`, which is what veils a block as *Unsupported symbol*. That veto is right
everywhere else — `y \le x` is a **region**, and this plugin does not draw regions — so the
comparator is accepted **inside the braces and nowhere else**, which keeps both statements true
at once. The veto covers `\le`/`\geq` (absent from `COMANDOS_SOPORTADOS`) *and* the bare
comparators `≤ ≥ ≠ < >` (`COMPARADOR_SUELTO`), so the same sentence behaves the same however it
is typed; before that, `y \le x` was veiled and `y ≤ x` came out blank. The `->` of `_vector`
is neutralised first: there the `>` is an arrowhead, not a comparison.

Accepted: `a ≤ v ≤ b`, `a ≥ v ≥ b`, and the one-sided forms with the variable on either side.
`\le`, `<=`, `≤` and `<` all read the same, and so do their mirrors — **strict and non-strict
produce the same interval**, deliberately: the difference is one point, which does not occupy a
pixel, and drawing a hollow endpoint would be a different feature. `\theta`, `θ` and `theta`
converge through `normalizarEntrada`.

**Endpoints** go through `cotaDe`: `\infty`/`∞` (with an optional sign) first, everything else
through `evaluarConstante` (§5.3), so `2\pi` and `\frac{\pi}{2}` work as anywhere else. Infinity
is read here and not in `evaluarConstante` because that function rejects non-finite results on
purpose — an infinite angle or component is an error — whereas here it means "do not bound this
side". In the one-sided form the endpoint is tried **as a constant before it is tried as a
variable name**: `\pi`, `pi` and `e` have the shape of a name and the value of a number, and
asking for the variable first made `{x ≤ \pi}` look like two variables, which the "one side and
one only" rule then discarded.

**An interval that cannot be read is reported, not swallowed.** `separarRestriccion` returns the
equation untouched (this module never half-repairs what it does not understand) and sets
`ilegible` to the group as written, which the host turns into its own veil (§4.4). Leaning on the
command veto alone was not enough: with the comparator typed in Unicode or with no comparator at
all (`{}`) there is no `\command` left to veto, so the block came out blank — and where the veto
did fire it misdirected, pointing at a `≤` that is legal inside braces. `ilegible` asks the group
to be **separated** (whitespace before it, or nothing) so that `x^{}` stays an empty exponent
rather than a half-written restriction.

**How it is applied** (in `construirObjeto`, per type):

| type | mechanism | variable it accepts |
|---|---|---|
| explicit | `f(x)` returns **NaN** outside the interval | `x` (also `t` in a `y(t)=…` component) |
| implicit | `F(x,y)` returns NaN outside, on the named axis; the gradient is wrapped the same way | `x` or `y` |
| parametric | the interval **is** `Parametrizacion.dominio` | `t` |
| polar | idem, replacing the period-derived domain (§4.5) | `theta` |

No new engine machinery: the contract already says a **non-finite value is "outside the
domain"** (§6.1), and discovery, tracing, notable points and auto-framing all read it as absence
of curve. A restricted parametric or polar also stops being `periodica` — half a circle does not
close, and saying it does would make the tracer join the last point to the first.

A restriction naming a variable the object does not have (`\sin x {0 ≤ t ≤ 3}`) is **neither
applied to whichever variable is at hand nor ignored**: the object is built empty and marked
`avisoRestriccion: "variableAjena"` (a structured warning with no text, like `AvisoTrig` §13.1),
which the host turns into its own veil (§4.4). Both alternatives would draw a curve the author
did not ask for.

Two consequences elsewhere, both about not lying:

- **Transformations must not touch it.** `simplificarEcuaciones` and `despejarEcuaciones` run
  through `transformarSinRestriccion`, which peels the restriction off and puts it back. Without
  it the pipeline degrades `\leq` through its wildcard sweep and the panel shows `*l*e*q` as if
  the author had written it. The tail survives even a solve: `x²+y²=9 {0 ≤ x ≤ 3}` becomes
  `y = ±√(9−x²), 0 ≤ x ≤ 3`.
- **The analytic ⓘ is suppressed** for a restricted block (`exprExplicita` returns `null`): that
  summary reasons over the whole f, so it would list roots that are not drawn and call periodic a
  curve that now begins and ends. The *geometric* ⓘ is unaffected — it reads the traced geometry,
  which is already clipped.

`_graph` and `_system` take restrictions; **`_derivate` and `_integral` do not**, and
there the veto still veils the block (`admiteRestriccion` in `clasificarBloque`). The panel writes
the interval as a tail, `,\quad 0 \le x \le 2\pi`, composed from the **pieces as written** (§5.6).

### 4.2c Declared parameters: `src/core/parsing/parametros.ts`

The second half of issue #1. `separarParametros(source)` splits a block into its parameters and
what is drawn; `sustituirParametros(expr, params, valores)` puts the current values in.

**Separated before equations are split**, for the same structural reason as §4.2b: a line `A = 1`
is neither a curve nor garbage, and the line splitter only knows those two. Left in, it is
classified as the implicit `A − 1 = 0` and — outside `_system`, where only the first equation
is drawn — *becomes* the block's curve.

A declaration is `name = constant`: the right-hand side must evaluate against an **empty scope**
(`evaluarConstante`, §5.3), which settles two questions at once. `B = 2A` is not a declaration, so
no dependency graph is needed (the same call as `w = u+v` in §14). And the exclusion list is just
`COORDENADAS` = {`x`, `y`, `r`, `t`, `theta`}: everything else may be declared, and **declaring a
name shadows any constant of that name** — the issue declares `\phi` as a phase, and `phi` is also
mathjs's golden ratio.

**Substitution, not scope.** The native compiler takes `MAX_VARIABLES = 2` (§5.7), so parameters
in scope would push every parameterised `f(x)` onto the mathjs path — 2.3× to 18× slower, in the
one case that recompiles most. Substituted, the engine still sees a one-variable function. The
value is wrapped in parentheses: without them `A = -2` breaks `x^A`, and `A\sin x` stops being a
product of two factors. Names are matched with lookarounds so `A` cannot bite inside `\Alpha` or
`BA`, and are replaced longest-first.

**Greek names are atoms** (`GRIEGAS` in §5.2). Without that, `alpha` splits into `a*l*p*h*a` and
the panel typesets `al{p}h{a}`. The short ones (`xi`, `mu`, `nu`, `chi`, `eta`, `rho`, `psi`) are
in too: split letter by letter they all contain a free variable or the imaginary unit, so they
already evaluated to NaN — the change moves what is *typeset*, not what is drawn, and the
fingerprint bank (§16.1) confirms it. Being an atom is **not** being supported: `\alpha` is still
outside `COMANDOS_SOPORTADOS`, so writing it undeclared still veils the block.

**In the host** (`process`): `escrito` (names) feeds the panel and the symbolic derivative;
`paraMotor()` (substituted) feeds `crearMotor`/`crearMotorSistema` and the command veto. A live
`Map` holds the current values, so re-running `paraMotor` is all it takes for the plane to agree
with the slider. Moving a slider **replaces `escena`** and leaves the camera alone — that is the
point, since rebuilding the block (what a settings change does) would reset the view on every
tick — then calls `programarRedibujo` + `programarFinal`, so the drag runs at interactive quality
and refines 150 ms after release: the two-pass contract that already governs panning (§8.1), not a
new one. Auto-framing is **not** repeated, or the view would chase the curve and nothing would
appear to move.

`recorridoDe(valor)` gives the slider its range: −10..10, stretched to contain a declared value
outside it, with a step of range/1000. There is no syntax for the range yet, deliberately.

**The controls are a VIEW of the panel**, sibling to the formula, not a strip on the plane.
`montarCajaMandos` builds it once (hidden) at `inset:0` over the same box the formula cards use,
and `montarPanelLatex`'s bar gained a third button — an icon, not a maths glyph, because what it
shows is not another form of the formula — that toggles the two by `display`. The bar used to
exist only when there was a manual transformation to offer; now it also exists when there are
parameters, so a plain explicit curve with an `A` gets one. Transforming returns to the formula:
a transformation is a statement about the formula, so it is where you must be to see it.

Building the view once and hiding it, rather than rebuilding it per switch, is deliberate: the
sliders carry state (where each handle sits) and rebuilding would reset it on every round trip.
`montarDeslizador` gained an optional `alto` (18 here against the 22 of `_trig`'s angle) from
which the handle diameter and its margin are derived, and an optional `decimales` — which also
fixed an `aria-valuenow` that rounded to integers.

Scope: `_graph` and `_system` only (`admiteParametros`). In `_derivate` the written
function is classified *before* being derived, so a free `A` would veil the block first; in
`_integral` the value of the integral would come out of an expression still holding the name.
And a parameterised block shows the **geometric** ⓘ rather than the analytic one (§4.4): the
analytic summary is built once, so it would describe the previous curve, while the geometric one
reads the cached geometry and is recomputed on every final pass.

### 4.3 Double sign `±`/`∓`: `parser.ts` + `src/core/parsing/dobleSigno.ts`

`y = ±√(4−x²)` is a *family* of two functions. The pipeline handles it in three pieces:

1. `normalizarEntrada` rewrites `\pm u`/`±u` into the unary sentinel `pm(u)` (and `∓` into
   `mp(u)`), delimiting the operand by the precedence of `+` (`convertirDobleSigno`,
   `parser.ts`). The same sentinels are emitted by the even-power branch of the solver
   (§5.4).
2. The sentinels are **evaluable**: `FUNCIONES_SIGNO` in `constantes.ts` gives them the
   principal branch (`pm(u)=+u`, `mp(u)=−u`), so single-valued consumers (degeneracy
   classification, crosshair, integral value) don't collapse to NaN.
3. The composition root expands them into the two real equations
   (`expandirDobleSigno`; signs are *correlated* per the LaTeX convention: two branches,
   never 2ⁿ) and wraps both providers in `ProveedorUnion` so they remain **one** scene
   object — one color, one selector button, no spurious "intersections" between the two
   halves of the same circle (§8.4).

### 4.4 Degenerate functions and the veil

`clasificarDegenerada` (`src/degeneradas.ts`) samples a compiled f over a wide range
(−1000…1000, 501 samples) plus a fine central strip, counting real / infinite / complex
results. If **no** sample is real, the function is unplottable and classified:
some ±∞ → *Indefinida*; some complex → *No definida en ℝ*; only NaN → *Indeterminada*.

`clasificarBloque` (`host-obsidian/analysis/clasificacion.ts`) layers block-level labels
on top, in priority order. The two restriction labels come **first**, and in that order, because
each is more specific than what follows and would otherwise be masked by a truer-sounding but
less useful message:

1. **"Unreadable domain restriction"** (`restriccionIlegible`, quoting the group as written) —
   ahead of the command veto on purpose: that veto would point at the `≤`, which inside braces is
   supported, sending the author to fix the one part that was right (§4.2b).
2. **"Restriction on another variable"** (`restriccionAjena`, phrasing the `avisoRestriccion` the
   classifier raised).
3. **Unsupported LaTeX commands and bare comparators** (§5.1 — `comandosNoSoportados`, checked
   against the raw source **minus its domain restrictions**, and against the raw source itself in
   `_derivate`/`_integral`, which do not take them: §4.2b).
4. Per-mode labels ("No integral", "Invalid integrand", "No system", "Incomplete system", "No
   function"), then the per-equation degeneracy test.

Steps 1 and 2 only run where restrictions mean something (`admiteRestriccion`). A non-null result
renders the **veil**: a dark overlay with a formal label floating over a still-interactive plot.
Core labels are produced in canonical Spanish and translated at the host boundary (§15.3).

### 4.5 Polar period: `src/core/parsing/periodoPolar.ts`

The parametric tracer walks the whole parameter domain, so a polar curve is complete only
if the domain covers a full period. For r built from circular trig with θ-affine arguments,
the curve's period is `2π·m` where `m` = lcm of the numerators of `1/|aᵢ|` in reduced form
(continued fractions). The result is verified numerically (`r(θ+P) ≈ r(θ)` at ≥2 points)
and capped at `MULT_MAX = 60`; anything unverifiable falls back to `[0, 2π]`. Example:
`r = sin(θ/10)` gets `[0, 20π]` instead of the historical tenth of a curve.

---

## 5. The symbolic layer (Ring 2)

### 5.1 Input normalization: `src/parser.ts`

`normalizarEntrada(raw)` converts LaTeX/Unicode input to mathjs syntax through an ordered
sequence of passes. The order is load-bearing; the main stages:

1. Unicode: `π→pi`, `θ→theta`, Unicode radicals `√ ∛ ∜` (wrapping the following *factor*,
   including an attached exponent, so `√x²` becomes `sqrt(x^2)` = |x|), `· × ÷`, vulgar
   fractions (`½→(1/2)`), the full superscript range (`x⁴`, `x⁻¹`), `∞`, `⌊⌋ ⌈⌉`.
2. Direct symbol table `SIMBOLOS_DIRECTOS`: `\times`, `\div`, `\infty`, `°→*(pi/180)`,
   typographic minus signs (`− – —`, the pathological copy-paste case), spacing commands.
   Typographic wrappers are unwrapped (`\operatorname`, `\mathrm`…) or deleted with their
   content (`\text`…) — otherwise the residual sweep degrades them to letter soup.
3. Double sign → sentinels (§4.3), while braces are still balanced.
4. `\left/\right` removal; floor/ceil pairs → `floor()/ceil()`; absolute-value bars →
   `abs()` via a stack-based scanner (bars are ambiguous — no regex; a bar *closes* iff
   an `abs(` is open and the previous significant char ends an operand).
5. Inverse trig normalization (`arcsin`, `sin⁻¹`, `sin^{-1}` → `asin`), **before** the
   function-power rule so `^{-1}` isn't read as a power.
6. Function powers `\tan^{2}(x)` → `(tan(x))^{2}` (`convertirPotenciaFuncion`), resolving
   the ambiguity against `tan(x^2)`; argument must be grouped in `()` or `{}` (the latter
   is what KaTeX/MathLive editors emit).
7. Fractions `\frac{..}{..}` → `(..)/(..)` with balanced-brace recursion; fractional
   exponents `x^{m/n}` → `nthRoot(x^m, n)` (real root for negative bases where defined,
   and it renders back as a radical); `^{…}` → `^(…)` recursively.
8. Logarithms — every spelling normalises to the single internal form `log(u, base)`:
   `\log_{b}{u}` → `log(u, b)`, a **base-less** `log(u)` → `log(u, 10)` (decimal, as taught
   and as on a calculator), and `\ln`/bare `ln` → `log(u, e)`. Writing the base is what makes
   the form survive a second trip through the parser, which the project's strings do make —
   trig with LaTeX-style arguments,
   and functions applied to **ungrouped** arguments (`\ln x`, `\cos 5t` — the coefficient
   run rule prevents `cos(5)*t`).

   **A function's braced argument is matched by counting levels, not by a regex** — since
   1.5.0 for the trigonometric family too. `\{([^{}]+)\}` cannot match a group that contains
   another group, and the pass ran once, outward in: `\cos{\tan{x}}` had its inner `\tan`
   converted and its outer `\cos{` left broken, the residual sweep then stripped that
   backslash, and mathjs rejected `cos{…}` — the block drew nothing, silently. Repeating the
   pass would not fix it either, because `\sqrt` is converted *after* this point (stage 9), so
   `\sin{\sqrt{x}}` still carries the root's braces here. `\ln`/`\log` had already been moved
   to the balanced-brace helper for exactly this; the trig family was left behind, and the
   **hyperbolic** family had never been in the rule at all (`\sinh{x}` simply did not parse).
   Two details in `reemplazarFuncionLlaves` that a `\command` helper does not need: the name
   may come **without** a backslash (`tan{x}` is informal notation people write), which is why
   the character to its left has to be checked — otherwise the `sin` of `asin{…}` would steal
   the inverse's argument — and the name list is **not** `FUNCIONES_TRIG`, because that one
   drives the degree heuristic and a hyperbolic argument is not an angle: `\sinh{30}` is 30,
   `\sin{30}` is 30°.
9. `\sqrt[n]{…}` → `nthRoot`, `\cdot → *`, and finally the residual sweep `\cmd → cmd`.
10. Degree heuristic: pure numeric literals inside direct trig calls are converted to
    radians (`\sin(45) → sin(45*pi/180)`), including literal fractions; symbolic arguments
    are untouched (`normalizarTrigonometria`).

Everything the residual sweep would silently destroy is guarded by
`comandosNoSoportados(raw)` (`parser.ts`): a **whitelist** (`COMANDOS_SOPORTADOS`) of
commands the pipeline actually resolves. Any other `\cmd` in the raw source makes the host
show the "Unsupported symbol" veil instead of a silently empty plot (and, in
`_derivate`, instead of a *false* derivative of letter soup). `\\` is neutralized first
(it is a line separator, not the command `\y`).

The same function also reports **bare comparators** (`COMPARADOR_SUELTO`: `≤ ≥ ≠ < >`), which no
whitelist of `\commands` can catch. They are veiled for the same reason `\le` is — a loose
comparison is a region, and regions are not drawn — and adding them removed a split behaviour
where `y \le x` was veiled and `y ≤ x` came out blank. Two exemptions: `->` and `<-` are
neutralized first (in `_vector` the `>` is an arrowhead, §14.1), and a **valid domain
restriction never reaches here**, because the host strips it before asking (§4.2b).

### 5.2 Implicit multiplication: `src/core/parsing/productoImplicito.ts`

`insertarProductoImplicito` runs on the *normalized* string and inserts the `*` users omit
(`3xy → 3*x*y`, `x(x+1) → x*(x+1)`, `xsin(x) → x*sin(x)`), while preserving: known function
names as atoms (longest-first table, including the `pm`/`mp` sentinels), multi-letter
constants (`pi`, `theta`, `tau`, `phi` plus the whole Greek alphabet, `GRIEGAS` — see §4.2c for
why the two- and three-letter ones are safe), and scientific notation (`2e5`). The invariant
used everywhere: the compiled form is always
`insertarProductoImplicito(normalizarEntrada(s))` — panel, solver, derivative, integral and
engine all share the same two-step normalization, which is why they can never disagree
about what an expression means.

### 5.3 Evaluation: `src/evaluador.ts` + `src/constantes.ts`

`compilarExpresion` parses+compiles once and returns a closure that evaluates against a
scope, injecting three shims on every call:

- `FUNCIONES_INVERSAS_EXTRA` — `acsc/asec/acot` (mathjs lacks them). `acot` uses the
  continuous convention `π/2 − atan(x)` (range (0, π)) rather than `atan(1/x)`.
- `FUNCIONES_ESCALON_RAPIDAS` — plain-`Math` floor/ceil, ~12× faster than mathjs's
  typed-function dispatch, preserving the epsilon correction (values within 1e-12 relative
  of an integer round to it).
- `FUNCIONES_SIGNO` — the `pm/mp` principal branch (§4.3).

Any evaluation error returns NaN. This evaluator is shared by both engines and every
symbolic module, so all of them recognize exactly the same function set.

`evaluarConstante(expr)` is the shortcut for the places where an expression is not a curve but a
**value**: the endpoint of an interval (§4.2b), the angle of an `_trig`, the component of a
vector. It runs the full input pipeline and evaluates against an **empty scope** — the definition
of "constant" that does not fall short, since anything depending on a variable comes out NaN — and
returns `null` rather than NaN, because the caller has to *decide* what absence means.
`evaluarAngulo` (§13.1) and `evaluarComponente` (§14.1) are **aliases of it**, kept under the name
that reads right at their call site: a pair has components, not angles. They were three copies of
the same six lines until this function existed.

### 5.4 Transformations: simplify / solve-for-y / derivative

These three modules share a common architecture: they transform user text into a
**re-parseable mathjs string** (what the engine plots), derive LaTeX only through the
shared typographic pipeline (§5.6), and guard every algebraic rewrite with a **numeric
equivalence check** so a formal simplification can never change the plotted function.

**`src/formatoExpr.ts`** is the shared algebra toolkit:

- Term/factor flattening (`terminos`, `factores`) with two serialization orders:
  `renderTerminos` (positives first) and `renderCanonico` (variables before constants for
  polynomials; falls back to positives-first when transcendental functions appear). Both
  are format-idempotent, which is what makes "this transformation changed nothing"
  detectable and makes Simplify-after-Solve a no-op.
- **The `rationalize` quarantine**: `rationalize` (mathjs) is the only operation in the
  project capable of freezing Obsidian's main thread — its cost is superexponential in the
  number of monomials produced by naive expansion (measured table in the file header:
  `(x+y)^4` = 1.4 s; `(x²+y²−1)³` never terminates). `costeExpansion` computes that monomial
  count in O(tree), and `rationalizeSeguro` refuses anything above `LIMITE_EXPANSION = 16`.
  It is the *only* call site of `rationalize` in the project. The guard is deterministic
  (not a timeout), so caches and tests are stable.
- Exact-fraction recovery (`racionalizarFracciones`: `0.5·x → x/2` — rationalize
  serializes rational coefficients as floats), like-term combination with named constants
  (`combinarYordenar`: rationalize won't combine `5πx − πx`), a structural fraction
  combiner (`combinarFracciones`: common denominators + identical-factor cancellation,
  explicitly *not* domain-preserving, so callers must validate), a readability metric
  (`profundidadFraccion` — fraction nesting depth), and `resimbolizarConstantes`, which
  recovers `ln k`, `1/ln k`, `π`, `e`, `√k` from the decimals mathjs produces
  (`d/dx 3^x` = `ln 3·3^x`, not `1.0986…·3^x`) and moves log factors to the end of products
  to avoid LaTeX gluing.

**`src/simplificar.ts`** — `simplificarExpr` = `rationalizeSeguro` for polynomials, else
`simplify` with extra whole-ℝ rules. Logarithms: `log(e^n)→n` and `log(e)→1`, each in **both**
spellings — the one-argument form mathjs itself produces internally, and the explicit
`log(u, e)` the plugin's own modules emit, which is required now that a base-less `log` reads
as base 10. The converse `e^(log u)→u` is deliberately absent: it holds only for u>0 and would
change the apparent domain. Plus five trigonometric identities (Pythagorean and three
parities) held to the same bar — `tan(-x)` and `-tan(x)` have the same poles. `simplificarLado` then applies the **fidelity guardian** `formasEquivalentes`: the
result must match the original over a "bland" sample (non-integer, both signs, near and far
from 0; each free variable de-correlated by index offsetting), *including non-finiteness* —
this is what stops `0/0 → 0` from ever reaching the panel. If the result is a nested
fraction (depth ≥ 2), flatter candidates (the user's original form, the combined-fraction
form) compete by (depth, length) and only a numerically equivalent winner is adopted.
Parametric component declarations are simplified body-only (`x(t) = <simplified>`).

**`src/despejar.ts`** — solve-for-y. Additive strategy: everything to
`D = lhs − rhs`, terms without `y` move to the other side. Strategies in order for a single
y-term: pure linear (`c·y`), integer power `y^n` (odd → `nthRoot`; even → `pm(√·)`),
n-th root of y (invert by raising to n), `abs(y)^e` (two ± branches; handles `1/|y|` in both
raw and simplified shapes), multiplicative split (incomplete: `tan(y)·(x²+1)=√(x+1)` →
`tan(y) = …`). For multiple y-terms: **odd-root reduction**
(`(x²+y²−1)³ = x²y³ ⇒ x²+y²−1 = ∛(x²)·y`, valid because odd powers are bijections on ℝ;
also applied term-wise when the power is a term rather than a whole side), then the
**quadratic-in-`y^g` solver** (`despejeCuadratico`): g = gcd of y-powers, reduced quadratic
formula for biquadratics, general formula for g=1, coefficient pieces simplified
separately. Physical branches are selected *numerically* (`ramaReal`) and the final result
is validated by substitution into the **original** equation (`DVal`), so an incorrect
reduction cannot survive. Everything returns `{ecuacion, completo}` — `completo=false`
means "solved as far as possible, honestly".

Four further strategies are **rewrites of the equation** rather than inversions of one
layer, and each re-enters the solver on the result (`despejarAnidado`, depth-capped; every
rewrite strictly reduces the tree, so the recursion terminates on its own):

- **Structural inversion** (`despejePorInversion` + `pelarCapa`) peels the outermost
  operation and applies its exact inverse to the other side, recursing into the child that
  holds `y`. Because the whole layer is inverted at once, `y` need not occur only once —
  it is enough that a single child contains it. When the tower gets stuck (`y` split across
  both branches, as in `\ln\frac{y-1}{y+2}=x`), what has been peeled is an equivalent,
  simpler equation and is re-solved from scratch. Only exact inverses are used: injective
  ones pass through, periodic trig carries its `fam` family, and restricted-range layers
  (even root/power, `abs`) carry the `dom` guard plus the `±`.
- **Denominator clearing** (`despejeSinDenominadores`) multiplies by every denominator that
  contains `y` and re-solves the polynomial result.
- **Affine-in-`y` by evaluation** (`despejeLinealEnY`) recovers `A` and `B` in `A·y+B = 0`
  by *substituting* two values of `y`, which works with any coefficient — no expansion, so
  it reaches what `rationalize` cannot (`y-(y+2)e^x-1=0`). Affinity itself is verified
  numerically over a grid, on triples that straddle 0 (a `|y|` is affine on any all-positive
  triple, and a naive sample "solved" `|y|=-3`). Several sampling pairs are tried so a
  singular `y` value cannot leak an `Infinity` into the formula.
- **Radical rationalization** (`despejeRadicales`) isolates one square root and squares,
  repeatedly, until the equation is polynomial. Squaring is *not* an equivalence —
  `A=B ⟺ A²=B²` **and** `B≥0` — so every step records its guard, and the guards are
  rewritten in terms of `x` by substituting back what later steps determined.

Because the last three can gain solutions the original never had (a cleared denominator is
defined where the original is `0/0`; squaring adds a branch), their results are validated
**branch by branch** (`solucionValida` over `expandirDobleSigno`, so what is checked is
exactly what the engine will draw) against the equation *as it was before the rewrite*. A
branch emptied by its own domain guard is not a failure; a branch that contradicts the
equation drops the whole solution back to partial. This is also why a removable hole
(`\frac{y^2-4}{y+2}=x`, missing its point at `x=-4`) is left unsolved rather than stated
more loosely than it is true: the `dom` sentinel expresses `≥ 0` and has no way to say `≠`.

**`src/condiciones.ts`** — the condition simplifier. Guards are emitted one at a time (one
per restricted-range layer, one per squaring step) but they are a *system* of inequalities
over the same `x`. `simplificarCondiciones` resolves each `c(x) ≥ 0` by its **sign table**
— the zeros of numerator and denominator split the line into constant-sign runs, so
locating them and probing one point per run yields a union of intervals — and intersects
the results. Redundant conditions vanish on their own (they do not cut), adjacent runs
merge, and a contradiction appears as an empty intersection (used by `despejeRadicales` to
reject a solution whose guards are jointly unsatisfiable, which the per-guard check in
`conDominio` cannot see). Critical points are computed **symbolically**, because they are
what gets displayed: the root of `x²−3` must read `√3`, not `1.7320508`. Declared reach:
rational conditions whose roots have closed form — degree 1, degree 2 by the general formula
(square factor pulled out of the radical, `√12 = 2√3`), higher degrees only where integer
roots deflate them. Everything else returns `null` and the caller keeps the guards verbatim;
the failure mode is "I don't simplify", never "I simplify wrongly". It is **presentation
only** — the engine keeps evaluating the original `dom` guards, so nothing plotted changes.

**`src/derivar.ts`** — described in §11.

### 5.5 Numeric analysis of f(x): `src/analisis.ts`

The classic analysis used by the ⓘ summary of explicit curves (host-side) and by the
legacy engine: a fixed-range scan (x ∈ [−10, 10], 1000 steps) producing:

- **Roots** by sign change + bisection, with pole discrimination (a root collapses |f|→0
  under refinement; a pole stays huge or goes non-finite). Runs of ≥3 exact zeros are
  **root intervals** (step functions resting on the axis), with endpoints refined by
  bisection on the predicate `f(m)=0` and open/closed evaluated at the cleaned limit;
  intervals touching the scan border are probed geometrically out to ~1e16 to decide
  whether they extend to ±∞ (`tramoHastaInfinito`). `raicesALatex` renders the interval
  union (`x∈[0,1)∪{−3}`).
- **Vertices** by discrete slope sign change, rejecting asymptote spikes with a
  scale-invariant test (`cruzaPolo`: ternary search of max |f|; divergence ≫ endpoint
  scale ⇒ pole, not extremum), and refined by parabolic fit through the three samples.
- **Group states**: `estadoGrupo(count, isTrig)` → `normal | infinitas | demasiadas`.
  `tieneTrigonometria` is a lexical test for direct trig *calls* (lookbehind excludes
  `asin`/`sinh`; accepts digits before, for implicit products like `2sin(x)`). A trig
  function with ≥3 events oscillates ⇒ "infinitely many"; >20 events ⇒ "too many".
  `construirPuntosNotables` merges coincident markers within a world-space tolerance.

Note the parallel system: the *new* engine computes notable points **from geometry**
(§8.5), not from this module; `analisis.ts` remains the analytic path for explicit
`_graph` summaries (`montarBotonInfo`) and the legacy engine.

### 5.6 LaTeX presentation: `src/latex.ts`

One pipeline for everything the panel shows:
`normalizarEntrada → insertarProductoImplicito → parse → ordenarPolinomioDescendente →
toTex(OPCIONES_TEX) → limpiarTex`.

- `OPCIONES_TEX` installs `manejadorFuncionesTex`, an AST-driven typography policy:
  named functions drop parentheses for atomic arguments (`\sin x` vs
  `\sin\left(x+1\right)`); function powers render as `\sin^{n} x` (except negative
  constant exponents, which would read as inverses); the `pm/mp` sentinels render as
  `\pm`/`\mp`, with parentheses only around top-level additive arguments, and
  `a + pm(b)` renders as `a \pm b` (the quadratic-formula shape).
- `ordenarPolinomioDescendente` is purely presentational: stable descending-degree
  reordering of the top-level additive chain, only when *every* term is polynomial in x.
- `limpiarTex` fixes mathjs artifacts: `\mathrm{t}` unwrapping (mathjs typesets symbols
  that collide with unit names in upright font), `\cdot` collapse to juxtaposition (kept
  between two digits), brace protection for `\pi{x}`, stray-brace collapse, and promotion
  of all parentheses to `\left(\right)`.
- Trailing clauses carry the information that does not belong inside the expression:
  `, k∈ℤ` per family parameter (`parametrosDeFamilia`), the **written domain restriction**
  (§4.2b) and the **solved domain**. The restriction is separated before typesetting — its braces
  are not grouping and its `\leq` is not a function — and comes back as
  `,\quad 0 \le x \le 2\pi`, composed from the pieces *as written* through the same `ladoALatex`:
  with the parsed numbers it would print `6.283185307179586` where the author put `2\pi`, and a
  clause that does not look like what you wrote is not recognised as yours. The comparator is
  always printed `\le`/`\ge`, whichever of the six forms was typed, because the engine does not
  distinguish an open endpoint from a closed one. The domain clause
  is not a per-guard listing: `coletillaDominio` collects every `dom` sentinel in the RHS and
  hands the whole set to `simplificarCondiciones` (§5.4), printing the resolved range
  (`x ≥ \sqrt3`, `-\sqrt2 ≤ x ≤ \sqrt2`, `x = 0`); only when the system falls outside that
  module's reach does it fall back to listing each `cond ≥ 0` after its own `\quad`.
- `bloqueALatex` renders a block: `cases`+`aligned` for systems; per line it declares the
  dependence the engine actually uses — parametric tuples as
  `\left(x(t),\ y(t)\right)=…`, single components as `x(t)=…`, polars as `r(θ)=…`
  (same detection criterion as `construirObjeto`, so panel and plot always agree), bare
  expressions with free `y` as `expr = 0`, everything else as `f(x)=…`. Empty input
  renders the `\text{[...]}` placeholder (mathjs's `parse("")` yields the node
  `undefined`, which KaTeX would typeset as italic letters).

---

## 6. Oracles — the mathjs boundary

### 6.1 Contracts: `src/core/contracts/oraculos.ts`

- `FuncionReal.eval(x)` — non-finite return means "outside the real domain".
- `CampoEscalar.eval(x,y)` — same convention; optional `gradiente` is declared but no
  implementation provides it (consumers use finite differences).
- `Parametrizacion.eval(t)` + `dominio` + optional `periodica`.

### 6.2 Implementations: `src/core/fields/*.ts`

Thin adapters over `compilarFuncion`/`compilarExpresion` that coerce any non-number
(mathjs Complex, errors) to NaN. `crearParametrizacionPolar` performs the polar→Cartesian
conversion `(r cos θ, r sin θ)` — this is why polars need no dedicated provider or tracer.
A non-compilable expression yields a constant-NaN oracle (empty plot) instead of throwing.

---

## 7. Composition root: `src/core/app/composicion.ts`

The only module that knows concrete implementations. `crearProveedor(objeto)` is the
dispatcher; the implicit branch encodes the engine's strategy ladder:

```
implicita:
  1. tienePolos(F) && despejarRamas(F)          → ProveedorImplicitoSeparable        (y = f(x) branches)
  2. same on the transposed field F(y,x)        → ProveedorImplicitoSeparable(transpuesta)
  3. separarTrigY(F)                            → ProveedorImplicitoPeriodico        (y = T⁻¹(g(x)) + k·P)
  4. same transposed                            → ProveedorImplicitoPeriodico(transpuesta)
  5. ramasMonomioY(F) (1/|y|, 1/y, 1/y², |y|)   → ProveedorImplicitoSeparable
  6. same transposed                            → ProveedorImplicitoSeparable(transpuesta)
    7. fallback                                   → ProveedorImplicitoRasterizado (generic discovery + continuation wrapped with pixel marching squares)
parametrica | polar                             → ProveedorParametrico
explicita                                       → ProveedorExplicito
```

The rationale, recorded in the file and in `analysis/separarImplicita.ts`: whenever an
implicit curve can be *algebraically reduced to explicit branches*, the 1-D adaptive
sampler traces it more robustly than gradient continuation (clean pole cuts at any zoom;
grid discovery loses thin/asymptote-hugging/periodic families when zooming out). Smooth
conics stay on continuation, which handles vertical tangents that ±√ branches cannot.

For very dense implicit fields, the final fallback is now a viewport-aware rasterizer:
`src/core/providers/ProveedorImplicitoRasterizado.ts` probes the field frequency and,
when the curve is too oscillatory for continuation, produces `Rama`s from pixel-level
marching squares in `src/core/tracing/raster/marchingSquares.ts`.
`ProveedorConCache( ProveedorSinPuntosEje?( ProveedorUnion?( base ) ) )` — the axis-point
filter only in `_system`, the union only for double-sign families.

`crearMotor` (_graph: first equation only) and `crearMotorSistema` (all equations,
palette of 6 recycled colors) assemble the `Escena` with the three drawing layers
(`Overlay`, `RendererCanvas2D`, `Crosshair`). `construirObjetosEscena` is exported pure
(no Canvas) for tests.

---

## 8. Geometry production

### 8.1 The provider seam: `contracts/proveedor.ts`

`ProveedorGeometria.geometria(viewport, tolerancia): Geometria` is the universal seam.
The contract imposes **camera invariance**: geometry must be a deterministic function of
(world region, resolution, tolerance) — never of camera framing. That determinism is what
makes `ProveedorConCache` (§8.4) sound and tests reproducible. There is deliberately *no*
fixed discover→trace→render pipeline: discovery and continuation are private collaborators
of the implicit provider only (comment block in `proveedor.ts`).

`Geometria` = `{ramas, singularidades, puntosNotables, asintotas}`
(`contracts/geometria.ts`). A `Rama` is a connected polyline in world coordinates stored as
an interleaved `Float64Array` plus: `cerrada` (closed loop), `calidad` (all current tracers
emit `"best-effort"`; `"exacta"` is reserved for a future certified mode), and optional
`parametro` — intrinsic-parameter samples aligned 1:1 with vertices. **`parametro` is the
key interaction contract**: it is x for explicit-like branches, absent for
parametric/polar/continuation branches, and its presence is what enables the per-x
crosshair and rail (§8.5, §9.2).

`Tolerancia` (`contracts/viewport.ts`) is the quality contract: `desviacionMaxPx` (Fréchet-
style screen deviation), `pasoMaxPx`, and `pasada`. `Escena.actualizar` fixes it at
`{0.5, 2, pasada}`. Only the parametric tracer currently reads `desviacionMaxPx`
numerically; the explicit tracer and continuation encode their thresholds as internal
pixel constants (`SALTO_PX_MAX = 8`, `PASO_PX_FINAL = 2.5`, …).

### 8.2 Tracers: `src/core/tracing/`

**`TrazadorExplicitoAdaptativo`** (`explicit/`) — the _graph sampler *extracted* behind
the contract, behaviorally identical to the shared legacy sampler (§15.5; the test suite
enforces parity). Uniform coarse sampling (1000–2000 samples interactive, 2000–8000 final,
density tied to pixels: `⌊width·20⌋` and `⌊width·50⌋` clamped to those ranges) + recursive
refinement of any interval whose screen jump exceeds 8 px (skipping intervals entirely
off-screen on the same side), with depth 12 (interactive) / 18 (final). Key mechanisms:

- **Refinement budget, per pixel column** (`VERTICES_POR_COLUMNA_MAX = 2048`, an `Int32Array`
  indexed by column). `PROF_MAX` bounds depth *per interval* but not total
  geometry: with an unbounded, irresolvable oscillation the refinement fires in every base
  interval at once. `tan(e^x)` in the default view — local frequency e^x/π, ~10⁸ oscillations
  per pixel at the right border — produced 1,084,444 branches and 21,460,279 vertices in 30 s
  and 1.14 GB of heap, which is not a curve but aliasing noise the size of RAM; Obsidian ran
  out of memory and of main thread, and since the block re-renders when the note opens, the
  freeze survived restarting the app. The cap is **per pixel**, not absolute, so resolution
  decides how much geometry is worth producing and a phone protects itself. When it runs out
  the trace is **not** cut: subdivision stops and the base sampling continues, so the curve is
  still drawn whole, without sub-pixel detail that at that density distinguishes nothing.
  Calibrated against the repertoire (the most expensive legitimate case, `tan(x²)` at
  semiY=300, peaks at 699 vertices per column), which is why no repertoire curve reaches it
  and their geometry stayed bit-identical. It arrived in two steps: 1.2.9 added the cap as a
  **global** bag (`anchoPx × VERTICES_POR_COLUMNA_MAX`, one counter spent left to right), which
  stopped the freeze but let a dense left-hand region starve the right-hand one — and since the
  exhaustion point depended on the base samples, the drawing changed between the interactive and
  the final pass. 1.3.1 made the quota per column, which removed that coupling.

- **Same-branch asymptote pre-scan** (`detectarAsintotasMismaRama`): finds x where |f| has
  a *diverging* local max (1/x², ln|tan x|) via ternary search and a three-scale divergence
  signature (1e-3/1e-7/1e-11) — stable under zoom, independent of whether a sample lands on
  the singularity. Detected poles force refinement and branch cuts. The strict `<`/`>` in
  the local-max test matters: step-function plateaus previously triggered hundreds of
  ternary searches per frame (~1 s/frame).
- **Pole vs overflow**: an Infinity that never returns to finite toward the domain border
  is numeric overflow (x^1000), not a pole (`esOverflowPersistente`).
- **Pole emission**: finite endpoints are emitted *raw* (never clipped — the crosshair and
  rail read true y values; visual clipping belongs to the renderer), then a synthetic
  vertex at `yTop/yBot` = one view-height beyond the border makes the stroke climb the
  asymptote. These synthetic vertices are later recognized and pruned by interaction code
  (`podarVerticesDePolo`, §8.5).
- **Defensive cuts at exhausted refinement**: a sub-pixel interval that still jumps more
  than a view height across the visible band is a masked pole → cut; a sub-pixel jump whose
  interior probes confirm two plateaus (`esSaltoFinito`) is a step discontinuity (floor /
  ceil) → cut, so no vertical "riser" is drawn.
- Output: each polyline becomes a `Rama` with `parametro` = the x array; asymptote x's are
  returned in `ResultadoTrazadoExplicito.asintotas`.

**`TrazadorContinuacion`** (`continuation/`) — predictor–corrector continuation of
F(x,y)=0 from seeds, parametrized by arc length. Newton projection along the
finite-difference gradient (`corregir`, convergence required — no accepting garbage near
∇F≈0); tangent predictor with adaptive halving, accepted only if it converges, progresses
forward (`FWD_MIN`) and turns < ~45° (`COS_GIRO_MAX`); **straight crossing** through
singular regions (extrapolate along the previous direction and reproject; accepted < 60°)
— which continues through transversal nodes and stops cleanly at cusps. Traces forward and
backward from each seed, closes loops, stops at the expanded border.

The file documents at length the central scaling lesson: **step size and proximity
thresholds are two independent magnitudes**. The step is pixel-based (quality/cost) with a
minimum of `PASOS_MINIMOS_CURVA = 24` steps across a tiny curve; the "seed already traced"
/ "duplicate branch" / "loop closure" thresholds are fractions of the *curve size*
(diagonal of the seed cloud — `CURVA_POR_SEMILLA = 60` etc.), because thresholds tied to
the step swallowed neighboring arcs at zoom-out (mutilated, flickering curves — the
measured numbers are in the comments). Additional machinery, each fixing a measured
pathology: seeds are Newton-projected before use (unprojected seeds near tan-poles caused
85 duplicate re-tracings ≈ 470k evaluations of lag); `arranque` searches 8 directions at
scale-relative distances when the seed lands on a cusp or singular point (the astroid
disappeared entirely without this); `marcarVisitadas` and `eliminarDuplicados` measure
distance to *segments* (not vertices) through a spatial hash grid, and duplicate removal
keeps branches unless >60% covered (0.45 was tried and mutilated legitimate branches at
177 zoom levels). Deterministic work budgets (`MAX_EVALS_*`) and a memory cap
(`MAX_PUNTOS_TOTAL = 200k`) bound the worst case without clock dependence. Continuation
branches carry **no** `parametro`; `ProveedorImplicito` retrofits it for strictly
x-monotone branches (§8.3).

**`TrazadorParametricoAdaptativo`** (`parametric/`) — 1-D sampling in t with subdivision
driven by the *perpendicular deviation of the midpoint from the chord in pixels* (the
first real consumer of `Tolerancia.desviacionMaxPx`) plus a chord-length density bound.
"Utility" of a point = finite **and** within a 3×-viewport margin: a finite point running
to infinity (polar r→∞) is treated like a domain hole, so the tracer doesn't chase
infinity nor fragment into micro-branches. Domain-hole borders are bisected (24 steps).
A single un-cut branch whose endpoints coincide on screen is marked `cerrada`. Emits no
`parametro` (t ≠ x would corrupt per-x readers).

### 8.3 Providers: `src/core/providers/`

- **`ProveedorExplicito`** — direct to the explicit tracer; extras (notable points,
  asymptotes) only on the final pass. `salida:"x"` components are traced in a transposed
  viewport and rotated by `girarGeometria` (shared with the separable provider), covering
  the full *visible* height instead of a fixed parameter range.
- **`ProveedorImplicito`** — discovery → continuation. Post-processing:
  `parametrizarMonotonasEnX` attaches `parametro` to branches whose x is strictly
  monotone (reorienting to increasing x) — the only route by which an implicit
  function-of-x becomes rail-traversable; folded branches (circles) stay non-traversable
  by design. Notable points are computed **by algebraic re-solve**: if `despejarRamas`
  applies, ephemeral explicit branches are sampled and analyzed with the same
  `analizarPuntosNotables` as explicit curves, so `x³+y³=9` reports exactly the points of
  `y=∛(9−x³)`; otherwise none (direct implicit analysis is not implemented — stated in
  the file).
- **`ProveedorImplicitoSeparable`** — traces each despejada branch with the explicit
  sampler, then `partirEnPolos` cuts branches at poles of `c(x)=F(x,0)` located by
  `localizarPolos` (needed because odd roots compress poles: `∛(2−tan x)` never reaches
  |y|→∞ at coarse sampling, and the sampler would connect across), extending cut ends to
  the off-screen border so asymptotes render vertical even in the fast pass. Transposed
  variant swaps the viewport in and rotates the geometry out (asymptotes vertical ↔
  horizontal; `parametro` deliberately dropped after rotation; notable points recomputed
  on the rotated polylines).
- **`ProveedorImplicitoPeriodico`** — for `a(x)·T(y)+c(x)=0` with periodic T: traces the
  base inverse branch(es) **once** in an auxiliary viewport with the same px/world scale,
  then emits up to `MAX_COPIAS = 400` exact vertical translations per base — O(1 tracing)
  for hundreds of visible branches. The `INVERSAS` table defines per-T inverse functions,
  base ranges and periods (sec/csc invert via 1/v; out-of-range values are NaN = domain
  hole, exactly the curve's real domain).
- **`ProveedorConCache`** — one-entry memo keyed by
  `domX|domY|anchoPx|altoPx|pasada|ε|paso` (dpr excluded: sampling is in CSS px). Cursor,
  crosshair and rail never touch these inputs, so they never invalidate. The file states
  the honest scope: same-view repaints hit; every frame of a continuous gesture misses by
  design (scale-band caching is documented as future work, not implemented).
- **`ProveedorSinPuntosEje`** — presentation decorator for `_system`: strips roots and
  y-intercepts (system plots keep only vertices and inter-curve crossings).
- **`ProveedorUnion`** — compositor for the ± family (§4.3): concatenates geometries under
  one `objetoId`.

### 8.4 Discovery: `src/core/discovery/sampled/DescubrimientoMuestreado.ts`

Grid sampling of F over the viewport (coarser grid on the interactive pass), emitting a
seed on every cell edge with a sign change. `cruceReal` filters pole jumps (+∞→−∞ across a
tan asymptote): a genuine zero crossing has |F(mid)| bounded by its endpoints.

Because grid cells are pixel-tied but bounded curves have fixed world size, a curve zoomed
out enough fits inside one cell and vanishes (differently per pass ⇒ flicker). The
**adaptive refinement** fixes this: candidate cells ranked by min |F| at their corners
(distance-to-curve proxy) feed a quadtree descent (SUB=4 per side, depth ≤ 5, ≤ 240
subdivisions, ≤ 96 seeds — deterministic budget). Three recorded anti-lessons, each a
measured bug: exploration is **breadth-first by level** (pure |F| priority starves — a
neighboring cell's fixed small-|F| corner outbids the cell actually containing the curve;
the heart at semiY=27.5 returned zero seeds); cells that already produced a seed are **not
excluded** (the lemniscate seeds only its nodal point where tracing dies; excluding its
cell emptied the curve); and refinement is skipped entirely when the base-grid seed cloud
already spans > 3 cells (refining a well-resolved curve wasted ~6000 evals/frame). The
stated known limitation: a large curve hiding an additional tiny component would not be
found. `deduplicarSemillas` thins near-coincident seeds on a cloud-relative grid
(refinement re-seeds the same curve at every level).

Singularity classification is not implemented — `singularidades` is always `[]`, and the
continuation tracer ignores its `_singularidades` parameter (it detects trouble locally
instead).

### 8.5 Geometry-based analysis: `src/core/analysis/`

All interaction and reporting in the new engine reads the traced `Rama`, never the
formula ("the analysis reads the geometry" — stated in several headers):

- **`puntosNotablesDeRama.ts`** — roots (sign change interpolation; isolated exact zeros
  vs plateaus, with duplicate-sample echo skipping so the circle's tangent touch at (±3,0)
  isn't mistaken for a plateau), all y-axis crossings (`<=` on both sides catches branches
  born/dying exactly at x=0), local extrema (horizontal-tangent extrema always;
  vertical-tangent extrema only for branches *without* `parametro`, i.e. genuinely
  foldable curves, with symmetric strictness guards against synthetic pole segments;
  closed-loop seam handled explicitly), and **branch-endpoint roots** for partial domains
  (√(x+1) born on the axis) — endpoint within ½ px of y=0, not at the viewport x border
  (which would mark 1/x tails as roots). Per-category dedupe (~3 px). Drawing caps at 30
  per category (a category over the cap is omitted entirely — no misleading subset);
  `resumenPuntosNotables` returns uncapped lists for the ⓘ popover, which *summarizes*
  overflow instead.
- **`lecturaRama.ts`** — the crosshair/rail primitives: `yEnRamas` (binary search over
  `parametro`), `avanzarPorArco` (walk N *screen pixels* along the polyline — the core
  rail primitive; always returns a point on a drawn segment, jumps domain holes to the
  neighboring branch accumulating only the pure discontinuity in `hueco`, reports
  `normal|salto|tope`), `existeRamaVecina` (real-time Case A/B asymptote topology test,
  §10.2), `podarVerticesDePolo` (strip the synthetic clamp vertices — poison for arc
  walking), `recortarRamasPorPendiente` (drop near-vertical runs above screen slope 50 so
  a rail branch *ends* where the curve stops being traversable; slope is a geometric
  property, so the cut lands at the same curve point at any zoom), and
  `curvaConBlowupVertical` (detects edge-of-domain blow-ups the tracer doesn't mark as
  formal asymptotes: branch endpoint at an *interior* x, off-screen |y|, near-vertical
  approach).
- **`interseccionesRamas.ts`** — system solutions derived purely from geometry: segment ×
  segment crossings between branches of *different* objects, spatial-hashed (cell = median
  segment length — the median, because pole verticals of length ~1e15 would destroy a
  mean-sized grid), segments clipped to the view region (Liang–Barsky) first. Colinear
  overlap detection (`solapanColineales`) feeds the "infinitely many solutions (curves
  coincide)" state. Deterministic cap `MAX_PUNTOS = 200`; *reaching* the cap means the
  enumeration is incomplete and biased, so the scene discards the markers entirely and the
  panel says "too many". The header records the accepted trade-offs: trace-level precision,
  undetected tangencies, no isolated points from overlaps. (This replaced the Newton solver
  of the retired SystemEngine, which needed the formulas.)
- **`separarImplicita.ts`** — the numeric (oracle-only, no symbols) separability
  detectors used by the composition root: `despejarRamas` (F = a·yⁿ + c(x), a constant,
  verified over probe points with distinct x *and* y — mixtures like the folium fail the
  constancy test), `separarTrigY` (F = a(x)·T(y) + c(x): solve a,c from two reference y's,
  verify affinity on the rest), `ramasMonomioY` (same structure over the monomial bases
  1/|y|, 1/y, 1/y², |y| — these can't use `despejarRamas` because F(x,0) is infinite or
  the sign test breaks), `campoTranspuesto`, `tienePolos` (sign change with large
  magnitude on both sides along y=0 — the gate between continuation and separable
  routes), and `localizarPolos` (bracket + bisection of each +∞↔−∞ jump).
- **`areaBajoRama.ts`** — §12.2.

---

## 9. Scene and rendering

### 9.1 `Escena` (`src/core/scene/Escena.ts`)

The orchestrator, built on one separation: **`actualizar` (expensive — ask every provider
for geometry, cache it) vs `pintar` (cheap — draw cached geometry + overlay + crosshair)**.
Mouse movement only repaints; only viewport changes recompute.

State held per scene: cached `ItemDibujo[]` (geometry + style pairs), system intersection
points + saturation/overlap flags (final pass only; world coordinates stay valid during
gestures), the selected-curve index (crosshair/rail target), the integral region polylines,
the notable-markers visibility flag (a render preference — geometry is still computed so
the ⓘ and rail are unaffected), and per-object vertical-asymptote presence. The latter is a
**monotone latch** for formal asymptotes (having poles is a property of the function, not
the framing; without the latch, zooming past the pole disabled the rail's inertia mode)
OR'd with the per-final-pass blow-up heuristic.

Query surface consumed by host and interaction: `intersecciones()`,
`interseccionesSaturadas()`, `solucionesInfinitas()`, `yEnCurva()`, `avanzarArcoEnCurva()`
(pole-vertex pruning always; slope clipping only when requested — falling back to raw
geometry if nothing traversable remains), `hayRamaVecinaCarril()`,
`tieneAsintotasVerticales()`, `resumenNotables()`, `encuadreAutomatico()`, selection
management, and `curvaRecorrible()` — the predicate gating crosshair and rail: branches
must carry `parametro` **and** must not overlap in x (multivalued relations like
`tan(y)·(x²+1)=√(x+1)` trace as x-monotone branches stacked in the same x band; a vertical
crosshair would be ambiguous, so they are not traversable; tan(x)'s disjoint bands are).

### 9.2 Renderer: `src/core/rendering/RendererCanvas2D.ts`

A pure consumer of `Geometria` — the file states the rule that it never knows which
algorithm produced a branch. Draw order per frame (fixed in `Escena.pintar`): overlay
background → dashed asymptotes → integral region fill → branch strokes → notable-point
markers → intersection markers → math crosshair → cursor cross. Branch coordinates are
clamped to ±1e6 px (Canvas2D chokes on astronomical coordinates near poles; both axes,
because transposed curves blow up in x). The integral region renderer splits each clipped
polyline at y=0 crossings, fills to the axis with sign-coded translucent tints (cool above,
warm below), overlays a 45° hatch **anchored to world coordinates** (so it pans with the
camera) using `clip()`, and draws vertical boundary lines at x=a and x=b.

`Estilo.guiones` and `Estilo.relleno` are declared in the contract but not consumed by
this renderer.

### 9.3 Overlay: `src/core/rendering/overlay/Overlay.ts`

Background, grid, axes, ticks, labels; knows only the `Viewport`.
`generarTicksCuadrados` uses one "nice" step (1/2/5·10ⁿ) for both axes — the camera keeps
px/unit identical on both axes, so a common world step yields square cells.
`ticksConPaso` iterates by integer index with a hard cap, never by `t += paso`: with the
rail chasing an explosive derivative, domY reaches ~1e17, the step falls below the ULP of
t, and the accumulating loop never advanced — a main-thread freeze of all of Obsidian
(recorded in the comment).

### 9.4 Auto-framing: `src/core/scene/autoencuadre.ts`

Runs **once** per block, right after the first render, only if the `encuadreAuto` setting
is on (the `escena.encuadreAutomatico(...)` call in `MotorExperimental.process`).
`semiYAutoencuadre` computes the bounding box of
all traced branches (after pole-vertex pruning) and proposes a smaller vertical semi-range
iff: the curve is strictly contained (2 px cushion — touching a border means it may
continue outside; only zoom **in**, never out), the needed frame is < 60% of the current
one, occupation is capped at 60% (breathing room, matching GeoGebra/Desmos), the center
stays at the origin (scale only — axes always in frame), and the result is quantized
upward to a fine mantissa table {1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10}×10ᵏ (a coarse table
threw away up to half the computed frame). The chosen semi-range becomes the camera's
**base view** (`fijarEncuadreBase`), which is what 🏠 and the rail-toggle reset return to.

### 9.5 `viewport-utils.ts`

The single home of world↔screen mapping (`aPantallaX/Y`, `aMundoX`, `crearViewport`), so
the engine has exactly one convention. Lives in `scene/` because `contracts/` must stay
logic-free.

---

## 10. Interaction

### 10.1 `Camara` (`src/core/interaction/Camara.ts`)

Owns the mutable view (`domX/domY`) and cursor state; emits `onViewport` (recompute+paint)
vs `onCursor` (paint only) — the split that makes cursor movement cheap. Default view:
domY = [−7, 7], domX derived from the aspect ratio (square cells; re-derived on every
`redimensionar`). Wheel zoom is anchored at the cursor; one notch = ×1.05 out with the
*exact* inverse in (so a round trip restores the view bit-exactly — a 0.95 factor drifted
0.25% per round trip).

Button animations (+/−/🏠) share one rAF loop, mutually exclusive, cancelled by any manual
gesture. Zoom accumulates in **log space** (multiplicative zoom ⇒ additive logs; repeated
clicks extend the run smoothly) and is consumed with an exponential profile
(`1 − e^(−dt/90ms)` of the remainder per frame, real dt, tail snapped when < 0.01%). The
home animation interpolates the center linearly and the scale geometrically, and lands by
calling `restaurarVista()` exactly.

`enfocarCarril(railX, railY, factor)` re-frames to follow the rail point, with the center
clamped by `centroCarrilAcotado` (|c| ≤ semi·2⁴⁶): beyond that, `[c−semi, c+semi]`
degenerates in floating point (span quantized or zero) — this was the tick-loop freeze
path. `panear`/`enfocarCarril` are *passive* mutators (no callback; `Navegacion` runs its
own loop); button zoom is *active* (emits per frame).

### 10.2 `Navegacion` (`src/core/interaction/Navegacion.ts`)

Keyboard on the focused canvas. Without rail: WASD/arrows = free pan (pixel-rate,
normalized diagonals). With rail (⌖): A/D travel along the selected curve, W/S zoom
centered on the point, Shift scales all speeds ×0.1 (continuous float movement, so
precision mode can land between pixels). The rail's y comes exclusively from geometry
(`LectorCurva` callbacks bound to `Escena` in `MotorExperimental.ts`), never from
evaluating f.

Travel is by **screen arc length** (`avanzarArco`), not by x — in near-vertical stretches
the point advances in y at a uniform rate and never leaves the polyline. Toggling the rail
resets the view to the base framing and hooks the point onto the curve nearest to (0,
seed) by a zero-length arc walk (so curves undefined at x=0, like 1/x, still get a point).

For curves with vertical asymptotes (`tieneAsintotasVerticales`), the rail switches to the
**inertia mode** (`pasoCarrilAsintota`), a substantial state machine. One camera-motion
engine — a framerate-independent exponential spring (`RIGIDEZ_CAMARA`) — aimed at
different targets depending on real-time topology (`hayVecina`, measured on the
slope-clipped geometry, never on function type):

- **Case A** (a neighboring branch exists: tan, sec, x⁻²): the point accelerates up the
  branch with a verticality ramp (×1 → ×10, `factorRampaVerticalidad` — geometric, from
  local screen slope), the slope-clipped branch *ends*, and the arc walk jumps to the
  neighbor's symmetric entry. The camera does **not** follow the jump in x: the pure
  discontinuity (`hueco`) is absorbed into `_dxReenganche` and dissolved by the spring, so
  the frame never teleports; continuous motion is tracked exactly (a spring on the full
  motion would read as lag).
- **Case B** (no neighbor — a genuine domain end like `arccot(x²)/(2√x)` at x=0⁺): the
  camera rides the point rigidly (spring stiffened by the same ramp), and past
  `ALTURA_ESCAPE_SEMIALTURAS = 18` semi-heights (or when the polyline runs out — `tope`)
  the point enters **escape mode**: its y is *integrated* here at constant screen speed
  instead of read from the finite polyline (whose last real vertex would otherwise trap
  it), the exact escape point is stored, and reversing direction descends and re-hooks at
  that same point — do/undo is exact by construction. Meanwhile the camera stops chasing
  and animates to the fixed target y=0 with a ×10→×1 stiffness curve, snapping when < ½ px
  remains. The rAF loop stays alive while any camera animation is unfinished, even with no
  keys held.

---

## 11. The derivative subsystem (`_derivate`)

`src/derivar.ts`, orchestrated from `MotorExperimental.process` (lines 85–117) and
`montarPanelDerivada`.

**Extraction** (`extraerFuncion`): accepts a bare explicit form (`x^2`, `y = f(x)`,
`f(x) = y`) or the operator written by the user — `\frac{d}{dx}(f)`, `\frac{d}{dx} f`
(only with denominator exactly `dx`; any other Leibniz fraction `\frac{dy}{dx}`,
`\frac{d}{dy}` is *rejected* rather than mis-differentiated wrt x). A free `y` in the
extracted body means an implicit relation → null (prevents a silent ∂/∂x). The **written**
function is degeneracy-classified *before* differentiating (`degeneradaDeEcuacion` on the
extracted f, host side): mathjs is formal algebra and happily produces `d/dx(0/0) = 0`,
which used to display an invented `f'(x)=0` over the line y=0.

**Differentiation** (`derivarExpr`): mathjs `derivative` with two substitution tricks for
node types it cannot handle —

- floor/ceil (`derivarConEscalones`): each step call is replaced inside-out by an opaque
  symbol (locally constant, which *is* the step's local behavior), differentiated, and
  restored; each substituted step contributes a `0·u′` domain-preserving term so
  `d/dx ⌊√x⌋` is 0 only where √x exists. Jumps (measure zero) are not represented.
- `pm/mp` sentinels (`sustituirSignos`/`restaurarSignos`): the sign is a ±1 constant, so
  `d/dx(±u) = ±u′`; after differentiation the sign symbol must be factorable out of each
  additive term or the whole derivative is declared non-representable (throw → null).

**Post-simplification** (`simplificarDerivada`): candidates — extra `sqrt(u)²→u` rule,
`combinarFracciones`, and for top-level products a term-by-term distributed form
(`derivadaDistribuida`, which yields flat terms like `arccot(x²)/(2√x) − 2x√x/(x⁴+1)`
instead of a fraction-of-fractions). Winner = lowest (fraction depth, length) that is
**numerically equivalent to the raw derivative including non-finiteness**
(`derivadasEquivalentes`); the raw derivative is the floor. Then
`racionalizarFracciones` and `resimbolizarConstantes` (last — a further simplify would
re-decimalize).

**Presentation**: the panel shows the unevaluated operator with the function
pre-simplified (`derivadaOperadorSimplificadoLatex`, falling back to the raw operator) as
the default view, and `f'(x) = …` (`derivadaLatex`) plus a stacked "both" view behind the
options menu. The plot always graphs the derivative string; the panel toggle is display
only.

---

## 12. The definite-integral subsystem (`_integral`)

### 12.1 Notation parser and facade: `src/integral.ts`

`extraerIntegral` recognizes the LaTeX form `\int_{a}^{b} f \, dx` (with deliberate
tolerances documented in `parsearLatex`: the `\in` typo before `_`/`^`, `\limits`,
`\displaystyle`, limits in either order, missing differential → variable x, multi-char
un-braced limits like `^10`) and a secondary line form (`a=…` / `b=…` / integrand). Raw
pieces only; each consumer normalizes through the shared route. `normalizarInvisibles`
strips zero-width characters and normalizes exotic Unicode spaces first (pasted
`\, dx` used to break the differential match). `esIntegrandoValido` rejects integrands
containing `=` or free `y` (an implicit curve is graphed, not integrated) — otherwise the
block mis-reported a Level-2 "out of domain" for a Level-1 "not a function".

**Two failure levels**, split consistently across the code (`integral.ts` header,
`areaBajoRama.ts` header, `clasificarBloque`):

- **Level 1** — the integrand takes no real value (0/0, √−1): classified by
  `degeneradas.ts`, veiled on the plot.
- **Level 2** — the curve exists but the number doesn't (interior pole, domain gap in
  [a,b], non-numeric limits): labels produced by `areaBajoRama`, also shown **on the
  plot** via `etiquetaIntegral`. The panel never shows a verdict — it keeps the formula
  only (`cuerpoAreaLatexExacto` returns `cuerpo: null`); the diagnostic lives in exactly
  one place.

**Value rendering** (`cuerpoAreaLatexExacto` → `cuerpoAreaExactoBase`): if a symbolic
antiderivative exists (§12.3) and F(b)−F(a) is consistent with the numeric area within
1e-5 (the consistency check is what detects an interior pole where Barrow does not apply:
∫₋₁¹ 1/x has finite F at both ends), the value is recognized in **closed form** by
high-precision rational approximation (`racionalDe`, continued fractions, denominator ≤
1000, tolerance 1e-9) against rationals and rational multiples of π, e, √k, ln k —
rendering `= \frac{8}{3}`, `= \frac{\pi}{2}`, `= \ln 3` — or `\approx <4-decimals>` when
irrational with no recognizable form. Without a usable antiderivative, the Simpson value
gets `\approx` unless it is a clean integer. A `pm(...)` integrand propagates its ± to the
displayed value (∫±f = ±∫f; magnitude only).

### 12.2 Numeric area: `src/core/analysis/areaBajoRama.ts`

`areaDefinida(f, a, b)` is viewport-independent (a property of (f, a, b)). Pipeline:
orient the interval; scan the open interior with 512 samples — NaN ⇒ *Fuera de dominio*,
±∞ ⇒ *Divergente*, sign changes bisected to distinguish roots (|f|→0) from poles (blow-up
past 1e10), same-sign spikes (1/(x−c)²) confirmed by a 256-point fine sweep; then either
plain **adaptive Simpson** (Richardson error control, tol 1e-11, depth 50; any interior
non-finite value ⇒ divergent) or, if an endpoint is singular, the **improper** route:
integrate on a geometrically shrinking ε-interval and require the estimates to stabilize
within 1e-4 (converge ⇒ `impropia: true`, rendered with `\approx`; otherwise
*Divergente*). |value| > 1e15 ⇒ divergent.

`recortarRegion(ramas, a, b)` clips the integrand's traced branches to the x-strip [a,b]
(interpolating the boundary points, splitting at holes/discontinuities) — this feeds the
renderer's shading (§9.2) and is recomputed on every `actualizar` (cheap; follows the
re-traced curve). The scene is told the limits by the host (`escena.fijarIntegral(a,b)`)
only when both evaluate numerically (`evaluarLimite`).

### 12.3 Symbolic antiderivative: `src/integrar.ts`

mathjs cannot integrate, so this is a small purpose-built integrator (the header states
the scope honestly: a calculus-textbook repertoire, not a general engine — the general
problem is undecidable). Structural recursion: constants, linearity, products with exactly
one x-dependent factor, `const/q` reciprocals (power of affine base / affine log /
pure-quadratic arctangent `1/(kx²+m)`), constant-base exponentials `b^u`, a function
table (sin, cos, exp, tan, cot, sec, csc, sinh, cosh, sqrt) — all with the **linear
substitution** `∫f(ax+b)dx = F(ax+b)/a` detected by constant derivative of the argument
(`coefLineal`), which is what makes `sin(2x)`, `e^{3x}`, `(2x+1)^5` reachable.

Two rules widen this beyond the table. The **logarithmic derivative**
(`integrarDerivadaLogaritmica`) covers the quotient with `x` in *both* parts: if `p = c·q'`
then `∫p/q = c·ln|q|`. The ratio is measured by finite differences rather than by symbolic
differentiation, so it does not depend on mathjs being able to differentiate `csc` or `abs`
— this is what reaches `∫2x/(x²+1)`, `∫cot`, `∫f'/f` in general. And **trigonometric
canonicalization** (`REGLAS_TRIG`) rewrites `csc/sec/cot/tan` in `sin`/`cos` and opens the
double angle, which collapses expressions written "by identity"
(`∫1/(csc 2x − cot 2x) = ∫cot x = ln|sin x|`). It runs only as a *retry*: the original form
is integrated first, so `∫sin 2x` still yields `−cos(2x)/2` rather than the expanded form.

The correctness philosophy: *a wrong antiderivative is worse than none*. Every candidate
must pass `verificaNumerica` — its **finite-difference** derivative (independent of
mathjs's symbolic differentiation, so `abs`, `atan` etc. don't matter) must reproduce the
integrand at ≥3 comparable sample points; otherwise `integrarExpr` returns null and the
panel falls back to the numeric value. No `+C` (irrelevant under Barrow subtraction).

---

## 13. The trigonometric-circle subsystem (`_trig`, `src/trig/`)

Added in 1.3.2. The only block that does not use the geometry engine: a unit circle is an
`arc()`, and forcing it through `ProveedorGeometria` → tracer → `Rama[]` would draw it *worse*
than the browser does, as a sampled polyline. What it does share is the host frame
(§15.1's container, panel box and column/floating split), the palette (§9.2's `paletaPlano`)
and the lifecycle. Five modules: three fully pure, one that compiles expressions and one that
draws to a canvas context:

| Module | Ring | Role |
|---|---|---|
| `bloqueTrig.ts` | 2 | Block source → angles. The only one that compiles expressions. |
| `modeloTrig.ts` | 1 | Everything derivable from one angle, computed once. |
| `exactosTrig.ts` | 1 | The exact-value table for the 24 notable angles. |
| `interaccionTrig.ts` | 1 | Drag/keyboard/slider arithmetic, DOM-free. |
| `renderTrig.ts` | 1 | Canvas-2D renderer and the angle-writing functions. |

### 13.1 Parser: `bloqueTrig.ts`

**One line, one angle; the block has no options.** `parsearBloqueTrig` splits on newlines,
takes the text left of the first `=` as a label (`θ` when absent) and evaluates the rest.
There is deliberately no key/value syntax: without a place to hang an option, the block cannot
grow one. Anything that is not a readable angle becomes an `AvisoTrig` (`{tipo, texto}`,
untranslated — the host writes it with `t()`), and a block with **no** readable angle still
renders, falling back to `ANGULO_POR_DEFECTO` (30°) while reporting what it could not read.

It does **not** go through `dividirEcuaciones` (§4.1): there is no equation here, the `=` only
names. It does reuse the input pipeline —
`compilarExpresion(insertarProductoImplicito(normalizarEntrada(s)))` — so an angle accepts
everything any other block accepts.

**Units.** The angle a block declares is read in **radians** when it is a bare number; `°` is
explicit (`normalizarEntrada` rewrites it to `*(pi/180)`, §5.1). Note that this is *not* the
same rule as the one inside a trigonometric call, where a literal argument is read in degrees
(`argumentoTrigonometrico`, §5.1): `θ = 30` is 30 radians, while `θ = sin(30)` is
`sin(30°) = 0.5` radians. Both rules are live in the same line and neither is a bug in the
other's terms.

**`fuenteSimbolica(expr)`** (in `exactosTrig.ts`) decides from the **text**, never the number,
whether the angle has a right to exact values: it must name degrees or π. `0.5236` does not
earn it however close it passes to π/6 — an exactness that lies is worse than none.

**`componenteNombrada(expr)`** returns the component a block *names*, so `sin(30)` opens with
the sine already traced. It matches on the **normalized** string, so every spelling of one call
(`\sin{30}`, `\sin 30`, `cos(45°)`) is handled by one rule. Three conditions, and the middle
one is the subtle one:

1. The name opens the string — excludes `2sin(30)`, `-sin(30)`, and also `asin`/`sinh`, which
   do not start with `sin(`.
2. The parenthesis closing that call is the **last character**, found by matching levels rather
   than by a regex: `sin(30)+cos(30)` starts and ends the right way, and only counting
   parentheses reveals that the final `)` is not the call's.
3. The argument is constant, decided by evaluating it in an empty scope (`x` yields `NaN`).

It selects a trace; it never reinterprets the angle.

### 13.2 Angle model: `modeloTrig.ts`

`modeloDeAngulo(rad)` → `ModeloTrig`: point on the circle, `PosicionAngular`, reference angle,
whole turns, principal coterminal, arc length, sector area and the six ratios. No DOM, no i18n
— positions are keys (`"II"`, `"ejeY-"`), not translated text, on the same split as
`analysis/analisisDerivada.ts` (§11).

Two decisions the tests pin down:

- **Position is decided on the angle, never on the sign of `Math.cos`/`Math.sin`.**
  `Math.cos(π/2)` is `6.1e-17` — positive — so asking the cosine would file 90° in quadrant I.
  A multiple of π/2 within `EPS_EJE = 1e-12` is an axis; that margin absorbs float noise from
  `90*(π/180)` vs `π/2`, and is far too tight to swallow a hand-written angle.
- **Undefined ratios are `null`, not a huge number.** `tan 90°` is not `1.6e16`; the panel
  writes "undefined" and the plane draws no segment. Which ones die is read off the position,
  not off a division.

Turns use `Math.trunc`, not `floor`: −400° is one turn clockwise, not two.

### 13.3 Exact values: `exactosTrig.ts`

A canonical table of the **7 first-quadrant** notables (0°…90° in steps of 15°), with the other
17 derived by reduction plus quadrant sign. Writing all 24 by hand would let a single typo
produce a cross-quadrant inconsistency — `sin 150°` ≠ `sin 30°` — that no one spots by eye;
derived, that is impossible by construction. Every cell is checked numerically against `Math`
to 1e-12 by the suite.

`ValorExacto` carries `{tex, txt}` plus a `compuesto` flag for values that are a **sum at their
outermost level** (`2+\sqrt{3}`): negating those by prefixing a minus silently produces a
different number that happens to be the *opposite* ratio's value, so it looked plausible. They
are wrapped in parentheses instead.

`radianesExactoLatex` and the `tex` field currently have **no production consumer** — the panel
and the ⓘ popover both render plain unicode (`√3/2`), because the popover is rebuilt on every
frame of a drag and six KaTeX formulas per frame is untenable. They are exercised by the tests
only; the only KaTeX in the block is the fixed `x² + y² = 1`.

### 13.4 Interaction arithmetic: `interaccionTrig.ts`

Pure, so it is testable without a DOM; the event wiring stays in the host.

- **`deltaAngular`** makes the drag *accumulate*: 350° → 370°, not → 10°, so turns can be
  counted with a finger.
- **`imantar`** snaps to multiples of 15° within 4°, preserving turns (733° → 735°, not 15°).
  **`imanVigente(ajuste, altPulsado)`** decides whether it applies at all: the setting rules,
  and `Alt` suspends it while held. It is consulted **per event**, so releasing `Alt` mid-drag
  snaps again without lifting the finger — which works only because the host keeps the raw and
  the displayed angle separate (§13.5).
- **`rangoDeslizador`** is always symmetric about 0 (base −360…360), widened in whole turns to
  contain every angle the block *writes*, so a block saying `θ = 750°` stays reachable.
  **`acotarARecorrido`** caps the raw value to that same range: the three controls write one
  number, so none may reach a value another cannot represent.
- **`pasoAnimacion`** wraps into `[0, 2π)` — the opposite of the drag, deliberately. A drag
  that keeps turning expresses intent; an animation's turns only measure elapsed time. The
  visible consequence is that the first frame reduces a multi-turn angle to its coterminal:
  the point does not move, only the number.

### 13.5 Renderer and the host path

`renderTrig.dibujarTrig` draws, in order: cartesian grid, radial spokes, axes, circle, rim
labels, the inactive angles, then the active one with its components on top. The framing is
fixed (`encuadreTrig`: centre plus a radius at 0.7 of the shorter half-side, leaving the margin
the labels live in) — no camera, no viewport to keep in sync.

Details worth knowing before editing it:

- Spokes are drawn every 15° **except the multiples of 90°**, where the axis already is: 20
  dotted spokes, 24 dots on the rim, the 16 classics fatter.
- Rim labels degrade by radius: two lines (degrees over the π fraction) ≥ 96 px, one line in
  the chip's unit ≥ 84 px, the four axes ≥ 64 px, nothing below. The label under the active
  angle is suppressed — matched by coterminal — because the coordinates of P need that gap.
- The three components are drawn **always**, dotted at 55% when off: a component that did not
  exist until switched on would have to be discovered before it could be understood. Only for
  the active angle.
- `textoGradosDe(rad)` is the **single** way an angle is written in degrees, used by the panel
  reading and by every row of the ⓘ popover. It was two functions until 1.3.2, and the same
  angle read `114.6°` in one and `114.59°` in the other, simultaneously.

In the host (`blocks/trig.ts`), the state that matters is the **raw vs
displayed** angle split: the drag accumulates on the raw value and the magnet is applied when
displaying it. Written to one number, the point would stick to the notable — every move would
start from the already-snapped value and fall back inside the tolerance. Components seed from
`componenteNombrada` of the angle that opens active and are the reader's from the first click;
nothing here is ever written back to the note.

**The slider** (`montarDeslizador`) is not an `<input type=range>`: it is a `div[role=slider]`
with a track and a thumb, driven by pointer capture and by the arrow keys (`Shift` = the coarse
step), so it can be styled and can accept the fractional angle a drag produces without rounding
it. Since 1.4.0 it is a **pill with a disc running inside it** (22 px tall, 16 px thumb, 3 px of
air), where it used to be a thin line. Those three numbers live in the TypeScript, because they
are what computes the travel, and reach `styles.css` as custom properties — written twice they
would be two truths for one measurement. The thumb is positioned with
`calc(margin + u × (100% - (thumb + 2×margin)))`, so the width never has to be measured on a
refresh, and `valorEn` reads the pointer over that same usable travel. The pill being 8 px taller
is why `ALTO_CONTROLES_TRIG` went from 78 to 86: on a narrow block the controls strip moves to the
foot of the plane, and without the extra room it clipped the control on precisely the device the
slider exists for. The height is an option (`alto`) rather than a constant because the parameter
sliders (§4.2c) stack three or four in one panel and use 18; the thumb diameter and its margin are
derived from it, so a caller sets one number instead of three that can drift apart.

**The unit chip** cycles degrees → radians → gradians and draws its state as a glyph
(`GLIFO_UNIDAD`), not as text. It was the words DEG/RAD/GRAD until the icons were redrawn as
**θᴅ / θʀ / θɢ**: a subscripted theta says "angle, in this unit" without depending on three
abbreviations that do not form a set (`°`, `rad` and `gon` are a symbol, a contraction and a word
almost nobody reads).

The subscripts are the **real outlines of Lora Italic**, the typeface the plugin already embeds,
pulled out of the `.ttf` and converted to path data rather than redrawn, so the letter in the chip
is the same letter as the rest of the interface. The θ is the one glyph drawn by hand, because
Lora carries no Greek; it is built to match Lora's `O` — stems of 36 units against 20 at top and
bottom, and the same 2.8° slant — since a geometric ring beside a serif letter reads as two
alphabets in one chip. A math italic (Cambria Math, STIX) would slant more and would look closer
to how LaTeX sets `\theta_R`; Cambria was ruled out as proprietary, and shipping a second embedded
font for three letters has not been judged worth it.

All three share **one box** (`CAJA_UNIDAD`), with the subscript centred in a fixed-width slot, so
cycling moves the letter and nothing else — a per-unit box would make the θ jump. `montarGlifoUnidad`
scales to *fit* that box rather than to a fixed width, which is what keeps a glyph from overflowing
the chip if the ink ever changes shape again. The chip went back to being **round**: it had been a
1.7× pill because a word is wide and low, and with a near-square glyph (363×378) that reason is
gone.

---

## 14. The vector-notation subsystem (`_vector`, `src/vector/`)

Added in 1.4.0. Like `_trig` (§13) it bypasses the geometry engine — a vector is a segment
with a known start and end, not a curve to sample — but it departs from the other five blocks in
a second, more visible way: **the block is a list, not an expression.** In `_graph` the whole
block is one formula (`f(x)=…`); here each line declares a different thing, and stacking them
into a single card would turn them into a system of equations, which is a different claim. So
the panel shows **one card per line**. The plane is always present; when no line has numbers to
draw it is dimmed and states why (§14.5).

| Module | Ring | Role |
|---|---|---|
| `bloqueVector.ts` | 2 | Block source → entries, and entries → what the plane can draw. The only one that compiles expressions. |
| `latexVector.ts` | 2 | Entry → LaTeX, both for its card and for its label on the plane. Delegates every expression to `exprALatex` (§5.6). |
| `renderVector.ts` | 1 | Canvas-2D renderer (arrows and dots), the *positions* of the labels, and the framing computation. |
| `analisisVector.ts` | 1 | What is *deduced* from the drawing — the content of the ⓘ panel (§14.4). Pure arithmetic; no text, no formatting. |

### 14.1 Parser: `bloqueVector.ts`

`parsearBloqueVector` splits on newlines and classifies each one. It does **not** go through
`dividirEcuaciones` (§4.1): there the `=` separates the two sides of an equation, here it
*declares a name*.

**The genus rule is the case of the first letter**, and it is the whole grammar:

| Written | Genus | Typeset | Drawn |
|---|---|---|---|
| `v = (3,2)` | `vector` | `\vec{v}` | arrow from the origin |
| `A = (1,2)` | `punto` | `A` | dot |
| `F(x,y) = (-y,x)` | `campo` | `F(x,y)` | nothing |
| `AB` / `A->B` / `\vec{AB}` | `diferencia` | `\overrightarrow{AB}` | arrow from A to B |
| anything else | `libre` | as written | nothing |

The rule is the textbook convention (points are `A`, `B`, `P`; vectors are `u`, `v`, `w`), which
is why it needs no syntax of its own — the alternative, an explicit `point A = …`, would make the
author restate in every line what the letter already says. Two overrides exist: **arguments win**
(`f(x,y)` is a field regardless of case, because it is a rule that assigns a vector to each
point) and **an explicitly written arrow wins over case** (`\vec{A}` is a vector — answering it
with a point would correct the one author who wrote the correct notation).

Other decisions worth knowing before editing it:

- **`separarPar`** finds the comma at *depth 0*, not the first one: `(max(1,2), 3)` has two. The
  opening delimiter must wrap the whole text, so `(1,2)+(3,4)` is not a pair. Both `()` and `[]`
  are accepted; `\left`/`\right` are stripped first (typography, not structure).
- **`Par.valor`** holds the two components evaluated with an *empty scope*, or `null`. That null
  is exactly the boundary between what can be drawn and what can only be written: a field
  component (`-y`) evaluates to NaN, which is the correct answer — it is not a number, it is a
  rule.
- **Two passes.** Declarations are collected first, so `AB` may be written before `A` and `B`. A
  block of three lines that required a particular order would be a rule nothing on screen
  reminds you of.
- **`AB` needs both endpoints declared**, otherwise it stays `libre` and is typeset as the
  product `A·B`. The block never invents coordinates.
- **`parDiferencia`** writes its components through `numeroATexto` (§8.5's formatter): without
  it, `String(0.3-0.1)` would put `0.19999999999999998` on screen. The `valor` that gets drawn is
  still the raw floating-point difference; only the reading is rounded.

`dibujoDeBloque` turns entries into `Flecha[]` + `Marca[]` (world coordinates, plus the palette
role = the line's index). It lives next to the parser, not in the renderer, because it is a
*reading of the block* — which entries have numbers — and not a drawing decision; the renderer
never learns that fields or free lines exist. A point is a dot and **not** an arrow from the
origin on purpose: drawing it as a position vector would state something the author did not
write, and that confusion is one the block should help undo.

### 14.2 LaTeX: `latexVector.ts`

Every expression goes through `exprALatex` (§5.6), so a component is typeset exactly as it would
be inside an `_graph` in the same note. The one deviation is the escape hatch in
`trozoALatex`: if `comandosNoSoportados` (§5.1) reports anything, the text is passed to KaTeX
**verbatim**. The normalizer's wildcard sweep would degrade `\nabla` to `n·a·b·l·a` in italics;
KaTeX renders it perfectly. The translator is what cannot read it, not the renderer — so the
block accepts notation the engine cannot evaluate, which is precisely what is asked of a block
that only writes.

**The escape hatch is keyed on a `\command`, and that is its boundary.** A line with no unsupported
command takes the normalizing path, where `insertarProductoImplicito` puts a `*` between a name and
an opening parenthesis and `exprALatex` prints it. Two lines hit this in practice: the Unicode
`∇f(x,y)`, which carries no command at all and comes out `∇f∗(x,y)`, and a function call whose
right-hand side is not a pair (`G(x,y) = -y` → `G∗(x,y) = − y`), which `leerNombre` accepts but
`separarPar` rejects, so it falls to `libre`. The `campo` genre is precisely what saves the case
that *does* have a pair: `nombreALatex` composes `F\left(x,y\right)` itself, out of the name and
its parameters, instead of handing the call to the normalizer. That is the whole benefit of the
genre — it draws nothing, labels nothing and reports nothing.

The arrow is KaTeX's own, with its weight and position — never a lookalike — but it is not always
the same command, and `conFlecha` is what picks it. `\vec` is a short mark centred on a single
glyph, so it only fits a one-letter name; from two letters on the name takes `\overrightarrow`,
which stretches over all of it. Over a difference that is always the case (`\overrightarrow{AB}`):
with `\vec` it would read as the arrow of the `A` alone, which is a different statement. Only the
**base** counts, so a subscript or a prime does not turn one variable into two (`v_1`, `u'`).

`rotuloALatex` is the second export of the module and the reason the plane and the panel cannot
drift apart: the name beside an arrow comes from **here**, with the same decoration as its card,
minus the `=` and the pair (the arrow already shows where it ends). It returns `null` for whatever
the plane does not draw — a field, a free line — which is exactly the boundary `dibujoDeBloque`
applies.

### 14.3 Renderer and the host path

`dibujarVectores` draws `Overlay` (§9.3, the same grid and axes as every other block) and then
the arrows and the dots — dots last, so an arrow landing on a point does not cover it. The
arrowhead is a filled triangle built with the same recipe as `_trig`'s axis tips, and the
stroke is **shortened by the head length** so the triangle's apex sits exactly on the vector's
endpoint. A zero-length vector has no direction to orient: it is drawn as a dot and labelled,
which is the honest answer — the null vector exists and looks like that.

**The names are not on the canvas.** A vector's name is a mathematical variable and has to be set
as one — `\vec{v}`, KaTeX's filled arrow, the same letter as its card — and `fillText` can only
put the system's italic there. So the renderer exports *positions* (`rotulosDeDibujo`) and the host
mounts one DOM span per label in a `.lmath-rotulos` layer over the canvas, rendering the LaTeX that
`rotuloALatex` (§14.2) returns.

The order of that array is **part of the contract**: arrows first, then dots, the same order as
`dibujarVectores`. The host creates one element per label the first time and only repositions them
afterwards (KaTeX is asynchronous, and remounting on every resize would make them flicker), so if
the order shifted, the names would change owner on resize. Positions are handed over as CSS custom
properties (`--lmath-rotulo-x/y/color`); the rule that uses them lives in `styles.css`.

A label sits at the *midpoint* of the stroke, offset along the normal that points up on screen (so
they never swap sides by quadrant) — not at the tip, which leaves the canvas as soon as the vector
points at a border. A dot's label, and that of a null arrow with no stroke to step away from, goes
diagonally above the disc.

`encuadreDeDibujo` computes the framing once. Unlike the curve auto-framing (§9.4) it may zoom
**out** as well as in: a finite set of arrows is known in full, whereas a curve that touches a
border may continue past it. It returns `null` when the default view already fits the drawing
without wasting it, so two ordinary vectors do not leave the block at a different zoom from the
note next to it.

In the host (`blocks/vector.ts`) the plane carries **the same camera as `_graph`**: `Camara` for
the viewport, `Navegacion` for wheel zoom and drag, `Crosshair` for the aiming cursor, and the
🏠︎/+/− chips. An earlier revision had none of that — the framing was recomputed on resize and
nothing else — which made the only interactive-looking plane in the plugin the one you could not
touch. Touch devices keep the plain cursor and no crosshair, as everywhere else.

The host owns the canvas sizing: `Camara.redimensionar` updates the camera's own state, and
`canvas.width`/`canvas.height`/`ctx.setTransform(dpr, …)` are set alongside it. Dropping those three
lines leaves the canvas at its default 300×150 and the origin pinned to an edge — worth stating
because it happened. `fijarEncuadreBase` is called on the **first** sizing only: it restores the
view internally, so calling it on every resize would undo the reader's zoom.

The plane also carries the ⓘ (§14.4) and, on a narrow block, the same `f(x)` button as the other
blocks; those two are mutually exclusive, because they open over the same plane. One `Reparto` field
carries the layout difference: `alto` (the panel height, from `altoPanelPorTarjetas`, which grows up
to 2×`ALTO_PANEL` and then lets the cards share).

**Correction (1.4.0, in the tree).** An earlier revision of this section described a *conditional*
plane, carried by a second `Reparto` field (`completo`, the panel taking the full width) and the
`.lmath-solo-formula` class. Both are gone. Hiding the plane made the same block look like two
different blocks depending on what was written, and — worse — a plane that is simply absent, or
present and empty, says nothing about why. The plane is now always drawn and dimmed with a reason
when empty (§14.5), which is what the graphing blocks have always done.

**Two views.** When the block both declares something and asks for a result — at least one
`declaracion` and at least one `diferencia` — the panel is built with `montarPanelVistas` (§15.1)
instead of a plain scroller: the main button holds the block's canonical line (`\vec{v}=(x, y)`,
what `f(x)` is to `_graph`) and shows every declared line, one card each; the options menu holds
`\overrightarrow{AB}` and switches to the differences alone. Besides separating two different kinds
of statement, it buys room: stacked, N cards split the column equally (`flex: 1 1 0`) and
`\overrightarrow{AB}` — taller than a bare name — was the only one to overflow; alone in its view a
card grows with its content up to `ALTO_TARJETA_MAX`. The panel is sized for the fullest view
(`Math.max` of both), so switching never changes the block's height.

### 14.4 What is deduced: `analisisVector.ts` and the ⓘ panel

The block's rule is that it writes what you wrote and resolves nothing. This module is the other
half of that rule — what *follows* from what is already drawn — and the boundary is thin and
deliberate: **no new vector is born here.** A panel that showed `u+v` would be writing into the
note something the author did not write.

`analizarDibujo(dibujo)` returns `null` when there is nothing drawn, and otherwise:

- `vectores: AnalisisFlecha[]` — per arrow: `componentes` (for `AB`, the difference `B − A`),
  `modulo`, `direccion` in `[0, 2π)`, `posicion` (the same eight `PosicionAngular` values as the
  circle, §13), `unitario`. The **null vector** returns `direccion`, `posicion` and `unitario` as
  `null`: it has no direction, and a 0° would suggest it points east.
- `par: AnalisisPar | null` — only with **exactly two** arrows: dot product, angle, determinant,
  parallelogram and triangle areas, and `relacion` (`perpendicular` / `paralelo` / `null`).
- `puntos: AnalisisPuntos | null` — only with **exactly two** dots: distance and midpoint.

The "exactly two" is not a technical limit; the pairs would compute just as well. It is that five
vectors make ten pairs and the panel becomes a matrix nobody reads. With two, "what is the relation
between these?" has *one* answer.

Three decisions are worth keeping:

- **The exactness rule.** A value is given in closed form (`√13`, `2√3`, `3/2`) only when the
  components it comes from are **integers** — the one provenance this block can check. `raizTexto`
  pulls the largest square out of the radicand, which is not cosmetic: `2√3` says at a glance that
  the number is a little over 3. It is the discipline of `_trig`, applied here.
- **Angles leave in raw radians**, deliberately. The host writes them with `textoAngulo`, the same
  function that labels the circle, so they follow `unidadAngulo` and already know when an angle has
  an exact form. A notable-angle table of its own here would give two truths for one number — the
  mistake the circle made once, with `114.6°` in one place and `114.59°` a centimetre away.
- **The angle is `atan2(|det|, dot)`, not `acos(dot/(|u||v|))`.** Near 0 and π the arccosine's
  derivative is unbounded, so the quotient's rounding error is amplified without remedy: `u=(1,2)`
  and `v=(2,4)`, parallel by inspection, gave a cosine of `0.9999999999999998` and with it an angle
  of 2·10⁻⁸ rad — far enough from 0 for the notable table to reject it, so the panel printed a
  decimal for a null angle. With `atan2` the parallel case is `atan2(0, +) = 0` exactly and the
  perpendicular one `atan2(+, 0) = π/2` exactly. Since `|det| ≥ 0`, the result is already in
  `[0, π]`.

The panel itself (`montarBotonInfoVector`) is **static**: a set of arrows does not change, there is
no camera and no drag, so it is built on first open and rebuilt only when a section is folded. Its
values are plain text with Unicode (`√13`, `π/4`), like the circle's ⓘ: at that size they read the
same as KaTeX and the popover does not depend on an asynchronous render. Nothing in this module is
translated or formatted — labels and language belong to the host (`t().vector.info`).

### 14.5 When there is nothing to draw

*In the tree, not published.* The plane is always built. When `hayDibujo` is false, the host lays a
dimmed layer over it with a reason, in two variants:

| Condition | Veil |
|---|---|
| No entries at all | `velo.sinVector` — *No vector*, with the shape the block expects (`v = (3, 2)`). The card still shows `PLANTILLA_VACIA`. |
| Entries exist, none drawable | `velo.nadaQueDibujar` — *Nothing to draw*: a field `F(x,y)`, a gradient, an unresolved `w = u + v`. Those lines *are* typeset; they are simply not arrows. |

Two messages and not one because they say different things — *you wrote nothing* and *what you
wrote is not an arrow* — and not three because the veil only appears when nothing at all is
drawable, so distinguishing a field from a free expression there would be a classification with no
reader. The parser already keeps those apart (§14.1); the veil does not need to.

The layer is CSS (`.lmath-velo-vector`, `.lmath-velo-mensaje`), not inline styles, so it does not
reintroduce the `no-static-styles-assignment` findings cleared in 1.3.3. Both layers are
`pointer-events: none`: the veil explains, it does not block. The ⓘ chip does not appear, since
`analizarDibujo` returns `null` with nothing drawn and a chip opening an empty box is worse than no
chip.

Note the asymmetry with a graphing block, which is deliberate: there a veil means *this cannot be
graphed*, while here the typeset cards above are perfectly valid output. The veil is about the
plane, not about the block.

---

## 15. Host presentation layer

### 15.0 How the host is laid out (1.4.0)

Until this version the host was one file, `MotorExperimental.ts`, at 4045 lines. It is now 987, and
the reason it could shrink that far is worth stating: the class held **three** things — the plugin,
the block mode, and a getter for the live settings — and almost nothing in it read them. The rest
were free functions with a `this.` in front.

| Path | What lives there |
|---|---|
| `MotorExperimental.ts` | `process()` for the four curve blocks, `editarBloque`, `registrarRecarga`, and the class `main.ts` instantiates. |
| `contexto.ts` | `interface Motor` — those three members plus the three mode flags and `registrarRecarga`. Every extracted module takes a `Motor` and depends on this file, never on the class, so the import graph stays acyclic. |
| `blocks/trig.ts` · `blocks/vector.ts` | §13.5 and §14.3, whole. |
| `ui/estilos.ts` | The `cssText` of the chrome: panel buttons, ⓘ chip, ⓘ popover. Strings, not nodes. |
| `ui/controles.ts` | Tooltip, icons, unit glyphs, inline-KaTeX labels. `montarEtiquetaMath` takes the plugin as its first argument — the only thing it needs from it is `app`. |
| `ui/deslizador.ts` | The hand-built slider (§15.1) and the parameter rack. |
| `ui/menu.ts` | The toggle bar and its drop-down. The **only** popover in the plugin that closes on an outside click, because a menu is in the way until you choose. |
| `ui/scrollerLatex.ts` | The formula panel, below. |
| `ui/paneles.ts` | `montarPanelVistas`, `montarPanelLatex`, `montarPanelDerivada`, `montarPanelIntegral`. |
| `ui/reparto.ts` | Layout constants and the column/floating split. |
| `info/contratos.ts` | `ExclusionPopover` and `FilaInfo`. |
| `info/latexSolucion.ts` | A solution of the system as LaTeX (`\left(\frac{7-\sqrt{13}}{2},\ …\right)`), plus the plain-text form kept as the fallback if typesetting never completes. Pure. |
| `info/botones.ts` | The ⓘ of `_graph` (explicit), `_derivate` and `_integral`: written once from a formula. |
| `info/plano.ts` | The two ⓘ that are **refreshed** — the system's solutions and the summary of a non-explicit curve. They return a refresher that `process()` calls on every final pass, and the equations enter as **accessors**, not values, so that moving a slider changes what they say. Neither receives the camera any more: as of this version an implicit curve's notable points come from solving three systems (`math/notablesImplicita`) rather than from the traced polyline inside the current viewport, which is why the box no longer ends in "In the current view". `Escena.resumenNotables` went with it. |
| `analysis/` | The pure half: `clasificacion`, `lineasAnalisis`, `transformaciones`. No DOM. |

**How an ⓘ line is written.** A line is prose with its mathematics marked between `$…$`;
`pintarLineaPanel` typesets what lies between the delimiters with KaTeX and leaves the rest in the
panel's font. A line with no `$` never reaches the renderer. What gets interpolated into a
translated message is **LaTeX**, and it is each message that decides where the delimiters go —
only the sentence knows how far the mathematics extends: in "Roots: …" it is the list, in "Max at
θ = …" the whole equality, in "Vertex: …" the pair with its parentheses. The five redactions
(`lineasResumen`, `lineasPolar`, `lineasParametricas`, `lineasDerivada`, `lineasIntegral`) live in
`analysis/lineasAnalisis` and are pure, so the contract is checked in
`tests/modules/paneles-info.test.ts` without mounting a block. Two panels stay in plain text on
purpose: `_trig`'s refreshes on every frame of the drag, and typesetting six formulas per frame
is not sustainable; `_vector`'s values come from producers that only emit plain text.

**How an ⓘ panel is dismissed.** By its own chip, and by nothing else. The `_trig` and
`_vector` panels used to register a `mousedown` listener on `document`, copied from
`ui/menu.ts`; because the listener was on the document and not on the block, a click anywhere —
including the plane itself, and including another block's ⓘ — closed it. In `_trig` that meant
dragging the angle closed the panel showing the values the drag was changing. The listeners are
gone as of 1.4.0. The single remaining way a panel closes without its chip is `ExclusionPopover`:
on a narrow block the floating formula and the ⓘ cover the same plane, so opening one closes the
other.

### 15.1 Formula panels (`host-obsidian/ui/`)

`crearScrollerLatex` builds the left panel: a 261-px container hosting one
independent horizontal-scroll *card* per formula (unified rule: one expression = one
framed card; card height is derived so a single card is pixel-identical to one slot of the
stacked "both" view). Each card has its own fade overlays (siblings of the scroll area —
an absolute child would scroll with the content), wheel-to-scroll clamped to ±40 px/tick,
sub-pixel overflow tolerance (3 px, KaTeX artifact), and a `ResizeObserver` for the async
KaTeX font load. Formulas render through Obsidian's `MarkdownRenderer.render` with
`$$…$$`, i.e. the vault's KaTeX.

The layout constants (`PAD_SUP_PANEL`, `PAD_LADO_PANEL`, `HUECO_TARJETAS`, `ALTO_TARJETA`,
`ALTO_TARJETA_MAX`) sit at module scope rather than inside `crearScrollerLatex` because since
1.4.0 there is a second interested party: `altoPanelPorTarjetas`, which is how `_vector`
(§14) asks for a panel tall enough for its N cards. Copying the numbers there would give two
truths for one measurement. The size of the panel box itself is written in a single place,
`aplicarCajaPanel`, from the `Reparto` record — including `alto`, the one field only `_vector`
sets.

Panel variants share the same toggle chrome (math-glyph buttons rendered by KaTeX
via `montarEtiquetaMath`, hamburger options menu, enabled-state = "applying this would
change the displayed LaTeX"):

- **`montarPanelLatex`** (graph/system): the displayed base is `baseAutomatica` — the
  optional auto-solve (`despejarAuto` setting) followed by the *always-on, unconditional*
  simplification; failures keep the previous form (never break the render). "Original"
  returns to that base; the only menu item is Solve-for-y (hidden when automatic). State
  is chainable: transformations apply to the current re-parseable strings.
- **`montarPanelDerivada`**: views operator / evaluated derivative / both (§11).
- **`montarPanelIntegral`**: views operator / Barrow bracket + exact value / both (§12).
- **`procesarVector`** (§14.3): views *declared* / *deduced*, with no "both".

The last three run through one implementation, `montarPanelVistas` (`ui/paneles.ts`), which
since 1.4.0 takes a
**list** of formulas per view (`string | readonly string[]`, normalised on entry) instead of a
single one. `_vector` needs one card per declared line; the operator blocks pass a list of one
and behave exactly as before. A view's identity is its `latexDe(v).join(" ")` signature — arrays
do not compare by identity, and the signature is what decides whether an option would change
anything and therefore whether it is enabled.

### 15.1b The narrow block has two faces (`ui/botonFormula.ts`, `aplicarCajaPanel`)

In the column layout the formula is always on screen and there is nothing to open. Below
`ANCHO_MINIMO_COLUMNAS` the block **is** the plane, and the formula needs a door: the `f(x)` button
in the bottom-left corner.

There were two shapes for what happens next, and 2.0.0 kept only one.

* **Floating card** (up to 1.5.0): a 180-px card posed over a plane that stays visible around it.
  Still the fallback for any block that does not ask for the other one.
* **Two faces** (`Reparto.panelCompleto`): the panel *is* the block's other side. No margin, no
  border, no shadow — the frame you see around it is the block's own. The plane is not covered, it
  is **not being shown**.

`panelCompleto` is a mode and not a setting: the block fixes it when it is built and it never
changes. All six blocks ask for it.

**Where the panel stops.** `aplicarCajaPanel` lays it out as `top/left/right: 0` and
`bottom: huecoInferior`, which is `0` everywhere except `_trig` (§13): there the plane cedes a strip
at its foot to the ratio boxes, the θ reading and the slider, and **those are the block's controls,
not its content**. They stay visible in both faces, so the panel occupies the rectangle of the
*plane* rather than of the block. Putting a full-height panel over the slider would have hidden the
one control that matters most on the device where dragging on a 300-px circle is imprecise.

Two traps worth naming, both of which drew blood:

* Every branch of `aplicarCajaPanel` must declare **its own width and height** even when it seems
  not to need them. The panel carries `.lmath-latex`, which the stylesheet gives `width: 50%`, and
  an inline style only overrides what it *writes*. A full-bleed panel without `width:auto` comes
  out absolute, full-height and half-wide.
* The panel sits at `z-index: 6`. Anything meant to survive the swap has to be **above** it: the
  chips that do carry `z-index: 7`, and marking one visible without raising it just hides it behind
  the formula.

**What survives the swap** is a stylesheet rule, not a list of elements to hide by hand:

```css
.lmath-grafica.lmath-modo-formula > *                          { visibility: hidden; }
.lmath-grafica.lmath-modo-formula > .lmath-sobre-panel         { visibility: visible; }
.lmath-grafica.lmath-modo-formula > .lmath-trig-controles-pie  { visibility: visible; }
```

So a chip added tomorrow is born hidden in formula mode instead of appearing over the formula, and
surviving is an explicit decision at its `createDiv`. `_trig`'s controls strip gets a rule of its
own rather than the class, because it is not *over* the panel — it is below it, in the strip the
panel leaves free.

**The glyph names the destination, not the state.** `f(x)` when it will open the formula; the other
face's icon when it will go back — `cartesian_plane` for the plane blocks, `unit_circle` for
`_trig`; and `cerrar` (✕) only in the floating-card shape, where something really is posed on top of
something else. A ✕ on a two-face block would claim there is something to dismiss, and there is not.
The glyph is only repainted when it **changes** (`dataset.glifo`), because `f(x)` goes through
`MarkdownRenderer` and this runs on every layout sync.

**The other survivor: the ✎ chip** (`ui/edicionBloque.ts`, top-left corner). Mounted **only on
touch**, because Obsidian's own `</>` needs a hover a phone does not have, and our canvases keep the
touches that start on them (`touch-action: none`, which is what lets a finger move the plane or the
angle) — so without it a block rendered on a phone can be read but not corrected. It carries
`lmath-sobre-panel` for a reason worth stating: in formula mode there is no plane, but there is
still a written block, and correcting what is written is exactly what one may want to do while
looking at it. `irAlCodigoDelBloque` handles the three things that cannot be assumed — which lines
the block occupies (`getSectionInfo`, null in a preview or a canvas), which view holds it (the
active one, *checked to be the same file*, or a chip in an embedded block would move another note's
cursor), and reading mode having no cursor to place until the view is switched.

This chip is why the module exists as a module. It was a private method of `MotorExperimental`, so
`_trig` (1.3.2) and `_vector` (1.4.0) were both born without it despite sharing the same plane and
the same problem. Extracted, each inherited it with **one line**; all six blocks mount it as of
2.0.0.

### 15.2 Settings: `src/host-obsidian/ajustes.ts`

`AjustesTransformaciones` = `{despejarAuto, puntosNotables, encuadreAuto, unidadAngulo,
imanTrig, idioma}` with defaults `{false, false, true, "degrees", true, "en"}`. The tab writes
to `plugin.ajustes` and persists via the `PluginConAjustes` contract (decoupled from the
concrete plugin class). Consumption points: `despejarAuto` in `baseAutomatica`;
`puntosNotables` read **live on every repaint** (`escena.mostrarNotables`); `encuadreAuto`
once at block mount; `unidadAngulo` and `imanTrig` once at `_trig` mount (§13.5), and
`unidadAngulo` again at `_vector`'s ⓘ (§14.4, no chip there); `idioma` re-fixes the i18n
pointer and re-renders the tab immediately.

**Since 1.4.0 a change applies immediately to the blocks on screen.** `PluginConAjustes` gained
`alCambiarAjustes(oyente) → baja` and `notificarCambioDeAjustes()`; `setControlValue` fires the
notifier, and every mount point (`process`, `procesarTrig`, `procesarVector`) subscribes through
`registrarRecarga`, which **rebuilds the block**: unsubscribe, `limpieza.unload()` (which runs
every registered teardown — resize observers, document listeners, workspace refs; without it each
settings change would leak another set), `el.empty()`, and mount again. One path for every setting
instead of a live route per setting — at the price of resetting zoom, pan and the angle of an
`_trig`, which the tab states in its own text.

The two trig settings are **presentation and gesture only** — neither changes how a block is
*read*. `unidadAngulo` can be overridden per block, live, by the θᴅ/θʀ/θɢ chip, which
mutates a local and repaints; it does not write to the note and does not survive a re-render.
`imanTrig` has no chip: `Alt` suspends it per gesture instead (§13.4).

Since 1.3.1 the tab is declared **only** declaratively (`getSettingDefinitions()` +
`getControlValue`/`setControlValue`), so Obsidian paints it and indexes its settings in the
settings search. The imperative `display()` fallback — required for Obsidian 1.5–1.12 — went
away with `minAppVersion` 1.13.0, and with it the last deprecated API in the plugin.

### 15.3 i18n: `src/i18n/`

Framework-agnostic string tables behind `t()`, with a module-level active-language pointer set by
`fijarIdioma`. Since 1.4.0 there are **three** languages — `en` (default), `es`, `pt` — and one file
each (`en.ts`, `es.ts`, `pt.ts`), all implementing the `Textos` contract in `textos.ts`. `index.ts`
is the runtime and the only door: it re-exports the contract, so consumers keep writing
`import { t, type Textos } from "../i18n"`. Adding a language is adding a file, and the compiler
lists exactly which of the 252 entries are missing.

The core engine does **not** depend on i18n: it emits its veil labels in canonical Spanish (fixed
by tests). `localizarVelo` translates exactly those labels at the host boundary via a map keyed by
canonical text — `VELO_NUCLEO_EN`, `VELO_NUCLEO_PT`; Spanish returns them untouched — passing
through anything unmapped. Host-generated labels come out of `t()` already localized.

**Two traps this layer set, both fixed in 1.4.0 and neither visible in English or Spanish.** The
settings tab validated the chosen language against a hand-written expression
(`value === "es" ? "es" : "en"`), so Portuguese fell to the `else` and the whole tab came out in
English; the compiler could not warn, because `"en"` is a valid `Idioma`. It now validates against
`IDIOMAS`. And Obsidian **reuses a settings row whose `name` has not changed** — the language row is
`Language` in English but `Idioma` in *both* Spanish and Portuguese, byte for byte — so switching
between those two kept the previous description. That row is now mounted through the imperative
`render` hook, holding its `Setting` handle and rewriting name and description on the spot.

`_trig` follows the same split: its parser emits structured warnings (`AvisoTrig`,
§13.1) with no text at all, and the host phrases them with `t().trig.anguloNoValido(...)`.
The `trig` table also holds the component names, the four ⓘ section titles and the eight
`PosicionAngular` labels, which is why the model may return `"ejeY-"` and never a sentence.

### 15.4 Fonts: `src/host-obsidian/fuentes.ts` + `styles.css`

The Lora variable fonts (`assets/fonts/Lora/*.ttf`) are imported as **Data URIs** — the
esbuild flag `--loader:.ttf=dataurl` (package.json `build` script) embeds them in
`main.js`, so the release keeps the standard Obsidian trio (main.js, manifest.json,
styles.css). `registrarFuenteLora` registers the `FontFace`s idempotently and fails
silently per face (CSS fallback `var(--font-interface)`). `styles.css` scopes the family
to `.lmath-grafica` (the plot's DOM overlays) only — KaTeX keeps its own fonts — and
neutralizes Obsidian's own math-block overflow wrappers so the plugin's scroller is the
only scrollbar.

### 15.4b Colour: `--lmath-*` tokens (`styles.css`) and `paleta.ts`

The rule the whole plugin follows: **the frame is the theme's, the plot is ours.** Everything that
is chrome — panels, cards, popovers, chips, menus, borders, text — is painted with `--lmath-*`
custom properties declared on `.lmath-container`, and each of those resolves to an Obsidian
variable. Everything *inside* the plot — curve colours, grid, axes — comes from `paleta.ts`, which
carries a hand-tuned pair of palettes (dark and light) because a graph's six hues have to stay
distinguishable from each other, which no theme variable can promise. **No colour literal, ever**,
outside those two places.

The chrome stack, as of 1.5.0, is three layers deep and defined only in terms of the note:

| token | what it paints | how it is derived |
|---|---|---|
| `--lmath-superficie` | the plot's surface | `--background-primary` — the note itself |
| `--lmath-panel` | the block's own material: the area around the formula card, the floating menu, the mobile card | `--background-primary` lifted 5% toward `--text-normal` |
| `--lmath-tarjeta` | the formula card and the ⓘ popover — the objects that sit *on* the block | `--background-primary` mixed 80/20 toward black |

Three things about that table are load-bearing.

**None of them hangs off `--background-secondary` any more.** It used to, and the result depended
on a coin-flip the theme makes: the secondary background is *lighter* than the primary in some
themes (Obsidian's stock dark included) and darker in others, so the block rendered either as a
recessed card or as a pale grey box around a dark plot, with no way to predict which.

**The card is measured against the note, not against the panel**, even though "one step below the
panel" is what it looks like. If it were derived from `--lmath-panel`, raising the panel would
raise the card with it and the two mixes would never separate — the distance between the layers
would stay constant no matter what either knob did. Anchored to the same place, each knob moves
exactly one layer and the separation is the sum of the two.

**The mixes go toward `--text-normal` and toward `black` for different reasons.** Lifting toward
the ink is the theme-symmetric gesture: moving a background *toward the text colour* means "stand
away from the background" whether the ink is light or dark, which is also what the `-activo`
tokens do. Darkening has no symmetric counterpart — on a light theme you cannot go lighter than
white — so the card mixes toward black, which is not a design colour but the operation "sink this
a little", the same status `--lmath-velo` has. Each `color-mix` declaration is preceded by a flat
one that stands in if `color-mix` is unavailable.

Two derived rules that are easy to break:

* **The card's background and its fade gradients are the same colour** (`scrollerLatex.ts`, the
  frame and `fadeColor`). They must move together or the edge of the fade shows against the card
  when a formula overflows.
* **Anything that floats over the plot carries its own `border` and `box-shadow`** — ⓘ popover,
  menu, mobile card — so none of them depends on its background differing from what is behind it.
  That is what makes it safe for the panel token to coincide with the note's own background.

Since 1.5.0 the ⓘ popover also needs one rule that an inline style cannot express, so the element
carries the class `CLASE_POPOVER_INFO` (`lmath-info-pop`, named in `ui/estilos.ts`) alongside its
inline geometry:

```css
.lmath-container .lmath-info-pop p { margin: 0; }
```

An ⓘ line is rendered by `MarkdownRenderer`, which wraps it in a `<p>` carrying Obsidian's
paragraph margins. `pintarLineaPanel` unwraps that `<p>`, but it does so in the render promise's
`.then()`, and the popover is shown *before* that resolves. Without the rule, the user sees the
box in its margined state first: five lines went from ~96 px to over 200 px, hit the popover's
`max-height`, grew a scrollbar, and then snapped shut when the renders landed. With margins at
zero the box measures the same in both states. The left formula panel has had the equivalent rule
(`.lmath-latex p`) since it started rendering markdown; the ⓘ boxes only began doing so when their
lines moved to LaTeX, and were left without it. The unwrap is still needed — this equalises the
**height**, that puts the line in the box's flow as text rather than as a block.

### 15.4c Number provenance: `src/core/analysis/formatoNumero.ts`

Three different jobs print numbers, and until 2.0.0 all three used the formatter written for one
of them. The fix is not a digit count: **a number carries where it came from**, because "how many
of these figures mean anything" is not a property of the format — it is a property of how the
number was obtained, and the only place that knows is whoever computed it.

```ts
export type Origen = "evaluado" | "medido";
const CIFRAS          = { evaluado: 6,     medido: 4    };
const TOL_SNAP_POR_ORIGEN = { evaluado: 1e-12, medido: 1e-4 };
```

Note that the provenance governs **two** things, not one. The significant figures, and the
tolerance of the closed-form recogniser — a value that came out of a bisection may legitimately be
snapped to `3` from 1e-4 away, because below that scale the estimator cannot tell them apart; a
value that was *evaluated* may not, or the panel would announce a `3` that is not one.

**The three surfaces:**

| Surface | Function | Format |
|---|---|---|
| Crosshair readout | `formatearLectura` | 6 significant figures, **padding zeros kept**, no exponent between 1e-4 and 1e6 |
| ⓘ panels | `numeroALatex` / `numeroATexto` / `puntoALatex` / `intervaloALatex` / `listaALatex` | closed form when there is one (integer, rational multiple of π), otherwise the decimal for its provenance, **padding zeros trimmed** |
| Axis tick marks | `formatearNumero` (`rendering/overlay/Overlay.ts`) | **untouched.** 4 significant figures, exponent past a thousand. Its job is legibility |

The padding split is deliberate and both halves have a reason. In the readout the number **changes
as the cursor moves**: a fixed width keeps `1.49050` and `1.48990` apart and stops the decimal
count from jumping between adjacent pixels. In a panel the number is static and competes with
nothing, so the zeros only got in the way — a slope of 0.05 read `0.0500000`. Trimming costs no
significant figure, which is the condition that makes it safe: `1.4905` and `1.4899` still read
apart. The single trim point is `decimalDe`, so the readout cannot pick it up by accident.

**Who supplies the provenance.** The default is `"medido"` everywhere, so adding the parameter
moved nothing until each caller was examined. Two suppliers:

* `Escena.lecturaEnCurva(worldX)` returns `{ y, evaluada }` instead of just `y`. It is `true` when
  the scene has a `lectorExacto` (§18.5) — a single explicit `y = f(x)` — and `false` when the
  height was interpolated from the traced polyline, which is also **why that reading still moves
  with the zoom**: the polyline's density depends on the framing. `yEnCurva` delegates to it, so
  its six existing callers did not change.
* The panel line builders, one call site at a time. The full classification, with the reason for
  each number, is in the header of `host-obsidian/analysis/lineasAnalisis.ts` and is the thing to
  read before adding a number to a panel.

Six of the ~38 panel numbers are evaluated: `f(0)`; the slope at the origin (computed on the
**symbolic** derivative, already compiled); the limits of an integral and the singularities of an
improper one (both are what the user typed, run through `evaluarLimite`); the parameter interval;
and the analysis window. The other thirty-two stay measured — roots by bisection, vertices and
critical points by parabolic fit, areas by quadrature, periods by harmonic fit — and that is the
half worth stating, because showing six figures of a bisection would be showing four figures of
noise. The two policies sit side by side in the same box, and `tests/modules/paneles-info.test.ts`
pins that they do.

### 15.5 Legacy engine: `src/engines/obs-graph/GraphEngine.ts` (+ `src/render/muestreoExplicito.ts`, `src/webgl.ts`)

The original single-function engine, still compiled and reachable via the flag in
`main.ts`. Differences from the new engine: three stacked canvases (WebGL for the curve —
polylines expanded to triangle quad-strips by `construirQuadStrip` and drawn with a
minimal color shader from `webgl.ts`; a 2D canvas for the overlay; a third for the
crosshair), WebGL context released on unmount via `WEBGL_lose_context`; the analytic
pipeline of §5.5 for notable points (with hover labels and collision-avoiding placement);
its own rail implementation. Its sampler was extracted verbatim into
`src/render/muestreoExplicito.ts` (also formerly shared with the removed SystemEngine);
the new engine's `TrazadorExplicitoAdaptativo` is the same algorithm re-housed behind the
contract, and `tests/motor.test.ts` asserts parity between the two (allowed to differ only
in the finite-value clipping correction). `webgl.ts` and `render/muestreoExplicito.ts`
have no other consumers.

### 15.6 The block rename, and where its tool went

Up to 1.4.0 the six blocks were `obs-graph`, `obs-system`, `obs-derivate`, `obs-integral`,
`obs-trig` and `obs-vector`. 1.5.0 renamed them to `_graph`, `_system`, `_derivate`, `_integral`,
`_trig` and `_vector`, registering **both** spellings so nothing broke while people converted, and
shipped a tool that rewrote a whole vault. **2.0.0 registers only the new names** and **the tool is
gone from the published tree.**

What remains is `src/host-obsidian/nombresBloque.ts`: the six identifiers and `nombresDe`, which
`main.ts` walks in `registrarBloque`. It still returns a *list* although there is one name in it —
so admitting a second spelling again is one function and nothing else — and the call still sits in a
`try/catch`, which is not defensive habit: a block identifier is a **global key shared by every
installed plugin**, so a collision would otherwise abort `onload()` and take down the whole plugin
over one name.

**Why the tool was removed, which was not tidiness.** Its vault walk called
`app.vault.getMarkdownFiles()`, and Obsidian's automated review flags that as **Vault Enumeration**
— *"gives the plugin access to every file path in the vault"*. It was the only place in LMath that
enumerated anything: the plugin reads the note it is rendering and nothing else, and walking the
vault existed solely to convert notes.

Turning it off was not enough, and the reason is worth keeping. A constant `MIGRACION_A_LA_VISTA =
false` removed the startup notice and the settings row, but `ajustes.ts` still imported the modal at
top level, so the vault walk stayed in `main.js`. **Obsidian's check is static**: it sees the call,
not whether anything can reach it. Only cutting the import edge silenced it — verified by symbol,
`getMarkdownFiles`, `getFiles`, `getAllLoadedFiles` and `vault.adapter` all appear **0 times** in
the bundle.

**Where it is.** `.dev/migracion/`, which is gitignored, with a `LEEME.md` explaining the above, and
its 19 tests still passing (run by hand; a `package.json` script pointing into `.dev/` would fail on
a fresh clone). It was moved rather than deleted because 1.5.0 was the **only** release that could
convert a vault automatically: anyone jumping from 1.4.0 straight to 2.0.0 has no automatic route,
and if that route is ever needed again the scanner and rewriter are there, tested, instead of in a
git history. Bringing them back means restoring the import — and the review warning with it.

**Why the underscore**, since the choice outlived the tool. `graph` bare is among the easiest names
for another plugin to have taken, and whoever loses that draw stops rendering with no warning. The
first attempt at a prefix was `graph*`, and it did not work: Obsidian does not preserve the asterisk
from a fence's info string, so the registered key never matched what was written in the note.
`\graph` and `.graph` fail the same way. The underscore is a word character, survives the round
trip, and still marks the block as ours at a glance.

**The consequence, deliberate and real:** a vault still written `obs-*` has no in-app way out. Those
blocks render as the plain code blocks they are until the fences are renamed by hand. The release
notes say so where a user will read it, rather than only here.

---

## 16. Development tooling and tests

### 16.1 Pipeline tracer: `src/tools/trazador.ts` + `formato.ts`

A pure (no DOM/Obsidian) reproduction of what each block computes, calling the *same*
functions as panel and engine (`dividirEcuaciones`, `simplificarEcuaciones`,
`despejarEcuaciones`, `bloqueALatex`, `derivada*`, `extraerIntegral`, `construirObjeto`) —
by construction it cannot diverge from what the user sees. For each step it reports the
re-parseable mathjs string (what is plotted), the LaTeX (what KaTeX renders), and a
diagnosis (object type, normalized form, solve status). Input syntax `[ec1/ec2]` passes
several equations on one terminal line. `formato.ts` renders the structure to plain text
with facet flags.

### 16.2 Consumers

- `tools/trazar.ts` — the terminal CLI, and since 1.1.8 the only consumer. Bundled
  once with `npm run trazar`, executed with plain `node`
  (`node tools/.trazar.cjs <block-type> "<input>" [--grafica|--latex|--diagnostico]`;
  the header documents why not `npm run … --` on Windows: cmd.exe corrupts `^` and
  parentheses).
- A `window.lmath` DevTools global used to exist (`src/host-obsidian/consolaDev.ts`); it was
  removed in 1.1.8 (commit `d75536d`) while clearing the Obsidian review warnings. The tracer
  core is unaffected — it is reachable from the CLI and directly from tests.

### 16.2b Corpus probe over a real vault (`.dev/sondas/`)

Not a test suite — it asserts no expected results. It is a **sweep**: it takes the LMath blocks a
person actually wrote in their notes, over months, with no thought for the engine, and pushes each
one through the same pipeline the plugin uses, without Canvas and without Obsidian. It looks for
what a green suite structurally cannot see: exceptions, curves that come out empty, panels that go
mute, non-finite coordinates reaching the geometry, and cases that take absurdly long.

```
node .dev/sondas/extraerBloques.cjs "<vault>/<folder>" bloques.json
npx esbuild .dev/sondas/corpusVault.ts --bundle --platform=node --format=cjs \
    --outfile=.dev/sondas/.corpus.cjs && node .dev/sondas/.corpus.cjs bloques.json informe.txt
```

The extractor pulls every fence whose language is one of the six blocks under **either** name
(`obs-graph` and `_graph`), copying the body verbatim — erratas included, since that is the whole
value of the corpus. The probe then runs, per block type: geometry at a fixed viewport
(`[-8,8]×[-7,7]`, the one the zoom suite uses, so cases are comparable), plus despeje, notable
points, derivation, integral value, and the `_trig`/`_vector` models. It also re-simplifies every
expression and asserts through `mismaFuncion` that the simplified form is still the same function,
domain included.

There is deliberately **no `package.json` script**: the probe reads one particular vault, which is
not part of the plugin. Two conventions worth keeping if it is ever re-run: the blocks are
numbered **by block type**, the same order the organised notes use — two numberings of one corpus
is the easiest way to end up pointing at the wrong case in a report — and the length metric can
overflow to `Infinity` on something like `x^{1000}` whose real coordinates are of order 10³⁰⁰,
which is the metric overflowing and not a broken coordinate; the non-finite check is the
authoritative one.

Its first run over a 162-block corpus produced 0 exceptions, 0 non-finite coordinates, and six
real defects. Two are fixed in 1.5.0 — the `±` of §18.2c and the nested-brace argument of
§5.1 — and the other four are listed in the release notes as known limitations rather than
half-fixed. The sweep after those two: 15 warnings instead of 18 (exactly the three blocks
that did not parse), and the simplification check went from 3 unverifiable expressions to 0,
because the three it could not compare were the three that did not compile.

### 16.3 Tests

Zero-dependency micro-runner (`tests/runner.ts`; per-`describe` timing decides which suite
a new block belongs to). Two suites:

- `tests/motor.test.ts` (`npm run test`, ~30 s, run on every change): sampler parity vs
  the legacy reference, continuation cases, cache behavior, geometry reading, notable
  points, solve/simplify/derive/integral units, condition-system reduction,
  expansion-guard limits, tracer tool. It also pulls in `tests/modules/trig.test.ts`
  (§13): input units, the parser's no-options rule, the angle model, the exact-value
  table checked numerically against `Math`, drag/slider arithmetic, the ratio a block
  names, and that the degree formatter is shared. Since 1.4.0 it also pulls in
  `tests/modules/vector.test.ts` (§14): the pair splitter's depth-0 comma, the genus rule and
  its two overrides, the three spellings of `AB` and its two-pass resolution, the passthrough
  for unsupported LaTeX, what reaches the plane, what `analizarDibujo` deduces from it (§14.4:
  exact magnitudes, the null vector's absent direction, the exact 0 and π/2 of the `atan2`
  angle, and the "exactly two" of the pair sections), the name each entry is labelled with on
  the plane, and the framing. **532 assertions at 1.4.0, 75 of them for `_trig` and 46 for
  `_vector`.** After 1.4.0, and not yet released, it also pulls in
  `tests/modules/restriccion.test.ts`
  (§4.2b): the six spellings of the comparator, the LaTeX groups that must **not** read as
  intervals (`\sqrt{x}`, `x^{2}`, and `\left(` — which begins exactly like `\le`), the safe
  return of anything unreadable, the clipping seen from the oracle (NaN outside, the interval as
  the parameter domain, `periodica` off), the warning raised by a restriction over another
  variable, and the panel's tail. It also covers the endpoint forms that were measured failing
  before release — `\infty`, a named constant on a one-sided bound, the unreadable interval that
  must be *reported* rather than drawn blank, the empty interval (`{5 ≤ x ≤ 2}`), and the
  one-point interval that must **not** be reported — plus the bare comparator reaching the veto
  without catching `A->B`, and the `cases` system whose restriction has to survive a `\\`.
  And `tests/modules/parametros.test.ts` (§4.2c): what is and is not a declaration (including the
  block from the issue, verbatim), the substitution and its boundaries (`Ax` **is** the product
  `A·x` and must be substituted; `tan`, `alpha` and `Pi` are atoms and must not), the slider's
  range, and that Greek names survive the implicit product and are typeset as letters.
  **585 assertions with both in.**

  **At 2.0.0 the suite is 974**, and the growth is mostly a different kind of test. Six modules
  joined it: `oro.test.ts` and `frontera.test.ts` (the golden files, the semantic oracle's
  self-diagnosis and the import rule — §19.5), `nucleo.test.ts`, `normal.test.ts`,
  `algebraico.test.ts` and `lector.test.ts` (the symbolic core and its reader — §19). Those six
  test code that **does not ship**; the boundary tests are the ones that keep it that way.

  On the shipping side, `crosshair.test.ts` and `paneles-info.test.ts` grew by 24 cases covering
  number provenance (§15.4c): the values that used to collapse to the same reading, the large and
  small ones, `f(0)`, an integral's limits, the padding split between readout and panel, and — the
  assertions that matter most — that roots and vertices did **not** move.
- `tests/zoom.test.ts` (`npm run test:zoom`, ~80 s): the anti-regression sweep for "the
  curve disappears / flickers when zooming out" — each bounded curve traced across ~150
  viewports × 2 canvas sizes × 2 passes, asserting **traced world length** (branch count
  was tried and let the bug through: the same drawing can come out as 2 or 4 polylines).

`npm run test:todo` chains both. Two further harnesses target the solver specifically and
are not part of that chain because they are slow:

- `tests/fuzz-despeje.ts` (`npm run fuzz`, several minutes): a **differential fuzzer** for
  *soundness* — it generates equations per strategy family (fixed seed) and asserts that
  every result marked `completo` satisfies its original equation numerically, honoring the
  emitted domain guards. The only column that may never be non-zero is `UNSOUND`.
- `tests/bateria-cas.ts` (`npm run bateria`): a **graduated battery** for *completeness* —
  generated inversion towers, checking that every real root of the original is claimed by
  the solved form, plus domain, representation and simplification.

**What no suite covers:** the block host. `MotorExperimental` is DOM and canvas, and there is
no DOM harness in this project, so everything from the panel outward — including the whole of
`procesarTrig`'s and `procesarVector`'s wiring, and every pixel `dibujarVectores` puts on the
canvas — is verified by eye in a vault. When you add host behavior, push the
decidable part down into a pure module and test *that* (`imanVigente` is the pattern: the rule
is tested, the `ev.altKey` wiring is not).

Build is esbuild, bundling `main.ts` → CJS `main.js` (target es2018, `obsidian` external).

---

## 17. Cross-cutting invariants

A consolidated list of the rules the code depends on (each stated or enforced in the files
cited):

1. **Single normalization route** — every consumer compiles
   `insertarProductoImplicito(normalizarEntrada(s))`; panel, engine, solver, derivative,
   integral, ⓘ and tracer therefore agree byte-for-byte on semantics
   (`construirObjeto.norm`, `ladoALatex`, `despejar.norm`, `derivarExpr`, `integral.ts`).
2. **Non-finite = no curve** — every oracle coerces non-numbers to NaN; every geometric
   stage treats non-finite as a domain hole (`fields/*`, tracers). A written domain
   restriction is enforced through this same invariant and needed no new machinery: a
   function that stops answering outside its interval (`restringirFuncion`, §4.2b).
3. **Camera invariance of geometry** — providers are deterministic in (region, resolution,
   tolerance); the single-entry cache and the pan stability depend on it
   (`contracts/proveedor.ts`, `ProveedorConCache`).
4. **Renderer/interaction agnosticism** — nothing above a provider knows which algorithm
   made a `Rama` ("no se nota la estrategia": `contracts/geometria.ts`,
   `RendererCanvas2D`, `Crosshair`, `lecturaRama`).
5. **`parametro` gates per-x interaction** — present ⇔ branch is x-monotone; consumers
   (`yEnRamas`, `curvaRecorrible`) rely on it rather than on curve type.
6. **Formal algebra never overrides numerics** — every symbolic rewrite (simplify, solve
   branches, derivative candidates, antiderivatives, odd-root reductions, cleared
   denominators, squared radicals) is validated by numeric sampling with domain fidelity
   before being shown or plotted (`formasEquivalentes`, `ramaReal`, `derivadasEquivalentes`,
   `verificaNumerica`, `despejeCuadratico(DVal)`, `solucionValida`).
7. **A transformation that is not an equivalence states its condition or is rejected** —
   restricted-range inversions carry a `dom` guard; rewrites that can *gain* solutions
   (clearing a denominator, squaring) are validated against the equation as it stood before
   the rewrite. Where the needed condition cannot be expressed (`dom` says `≥ 0`, never
   `≠`), the solver returns the partial form rather than a formula laxer than the curve
   (`conDominio`, `despejeRadicales`, `despejeSinDenominadores`, `despejeLinealEnY`).
8. **Determinism over timeouts** — all budgets are counts (expansion monomials,
   evaluations, subdivisions, points, intersection caps), never wall-clock
   (`formatoExpr.ts`, `TrazadorContinuacion`, `DescubrimientoMuestreado`,
   `interseccionesRamas`).
9. **Fail visibly, fail flat** — unrecognized commands, degenerate functions and absent
   values produce a *labelled* veil or a saturation message; over-cap enumerations are
   dropped entirely rather than shown as a biased subset (`comandosNoSoportados`,
   `clasificarBloque`, `interseccionesSaturadas`).
10. **Ring discipline** — contracts import nothing; Ring 1 never imports mathjs or
   Obsidian; mathjs enters only through `fields/` + Ring 2; Obsidian only through Ring 3.
11. **Diagnostics have one home** — for `_integral`, all verdict labels render on the
    plot; the formula panel shows formulas only (`cuerpoAreaLatexExacto`,
    `etiquetaIntegral`, `clasificarBloque`).
12. **Exactness comes from provenance, never from proximity** — a closed form is shown only
    when the angle's *text* named degrees or π, or when the block's own controls produced the
    number. `0.5236` is never sine ½ however close it passes to π/6 (`fuenteSimbolica`,
    `derechoExacto`, §13.1).
13. **One number, one way of writing it** — the same quantity may not read differently on two
    surfaces at once. The panel and the ⓘ popover share `textoGradosDe`; the animation reduces
    the stored angle rather than only the shown one, so the corner and the popover cannot
    disagree about how many turns there are (`textoGradosDe`, `pasoAnimacion`, §13.5).
14. **Looking is not editing** — dragging, animating, switching units and turning components
    on are all ephemeral. No interaction in any block rewrites the note; re-rendering returns
    to what is written (`procesarTrig`, §13.5).
15. **The drawing is not the source of truth** — the viewport, the polyline and the sampling
    exist to visualize. A number the user reads must not depend on how far they zoomed. Added
    in 1.4.0 after two breaches, both corrected: the solutions of a system, and the crosshair's
    `f(x)` on an explicit curve (§18).

---

## 18. The math engine (`src/math/`)

**Status: in the tree, not published.** Added in 1.4.0.

### 18.1 Why it exists — a design decision that was wrong

Until this version, the solutions listed by the ⓘ panel of `_system` were computed by
`core/analysis/interseccionesRamas.ts`: the crossings of the **already-traced polylines**, with
the segments clipped to the visible region before being intersected. That module's own header
declares the trade — *precision = that of the tracing, subpixel on screen, not Newton's 1e-9* —
and records that it had replaced a Newton solver retired with the old `SystemEngine`.

Two consequences, and neither is a nuance:

- **The value depended on the drawing.** For `y = x` against `y = x^2`, the solution at the origin
  read `(0, 0)` at one framing and `(8.4e-6, 8.4e-6)` after a pan, because the polyline's vertex
  fell where it fell.
- **Which solutions existed depended on the window.** Clipping to the view means a solution
  off-screen does not exist.

The same defect, smaller, was in the crosshair: `lecturaRama.yEnRamas` interpolates linearly
between plotted vertices, so the reported `f(x)` moves with the sampling density. Measured on
`y=exp(x)` at `x=2.1` (true value 8.16616991…): 8.16617 at `±20`, **8.17678** at `±200` — visible
in the third digit.

Both came from one reasonable-sounding rule that earlier revisions of this document presented as a
virtue: *the interaction reads the geometry*. That rule is what lets the rail, the picking and the
crosshair work on implicit and parametric curves without knowing the formula, and it remains
correct **for those curves**. It was wrong wherever the expression can simply be evaluated.

### 18.2 Modules

| File | Role |
|---|---|
| `racional.ts` | Exact rationals over `bigint`, always reduced, sign in the numerator. `bigint` and not `number` because coefficients grow during elimination — a resultant of two conics multiplies them four times, and silent overflow at 53 bits would return a confidently wrong polynomial. `aNumero` is the only place exactness is lost. `desdeDecimal` reads the *digits* a person typed (`0.1` → 1/10); `desdeNumero` reads the *bits*. The distinction is deliberate and both exist. |
| `polinomio.ts` | One variable over ℚ. `mcdPol` (monic at each step, or coefficients explode), `libreDeCuadrados` (`p/gcd(p,p')`, which is also what makes a double root visible), `sucesionSturm`, `raicesEnIntervalo` (Sturm's theorem: the *exact* count in `(a,b]`), `cotaCauchy` (every real root satisfies `abs(x) < 1 + max abs(aᵢ/aₙ)`, so the search interval comes from the polynomial and not from a window), `raicesReales` (isolation by Sturm-guided bisection, then refinement to double precision), `raicesRacionales` (rational-root theorem, capped at divisors ≤ 100000). |
| `polinomio2.ts` | Two variables, stored as coefficients in `y`. `sustituirY` for the explicit case; `resultanteY` — Sylvester matrix, determinant by **fraction-free Bareiss** — for the rest. Bareiss and not Gauss because every division it performs is provably exact in ℚ[x], so the computation never leaves the ring. |
| `extraer.ts` | Written equation → exact polynomial, or `null`. Uses the *same* front end as every other block (`normalizarEntrada` + `insertarProductoImplicito`), so it cannot read a different equation from the one drawn. Carries **fractions of polynomials**, which keeps `y = 1/x` on the exact path; the denominator is returned so the verifier can reject solutions the clearing invented. Degree cap 8. |
| `numerico.ts` | The non-polynomial route. Deterministic sweep over `DOMINIO_X = [-100, 100]` with 40000 samples, bisection on each sign change, Newton polish, and root/pole discrimination — without which `y = tan x` against `y = 0` would list every asymptote. Requires both equations to have a variable **isolated**, in any of the three shapes: both `y = f(x)` (sweep x), both `x = g(y)` (sweep y), or one of each, composed into `f(g(y)) = y` (sweep y). The last two need `{ simetrico: true }`, which only the rungs *after* the branch stage pass — reaching them earlier would answer with decimals what the branch stage answers exactly. |
| `ramas.ts` | Written equation → the N equations it really represents, each with the guard under which it holds. `despejar` (transposing x↔y when the isolatable unknown is the other one) → `expandirDobleSigno` → `dom` guards pulled out as predicates. Declines an incomplete solve and a periodic family (infinitely many branches), and screens out free symbols — which is also what keeps a 40000-sample sweep from running on an expression that cannot be evaluated anywhere. ≤ 4 branches per equation by construction. |
| `simbolico/valorExacto.ts` | The quadratic field `a + b√d`, `d` square-free. Closed under +, −, ×, ÷, with a canonical form, so `√8 → 2√2`, `1/√2 → √2/2` and `√9 → 3` fall out of construction rather than from rewrite rules. Equality is field comparison, not a tolerance. Two different radicals return `null`: `√2+√3` is degree 4 and admitting it would cost the canonical form. |
| `simbolico/raicesSimbolicas.ts` | Closed form of the real roots. A quadratic irrational never comes alone — its conjugate is also a real root — so pairs of irrational roots propose `x² − Sx + M` (S and M reconstructed from doubles by continued fractions) and **exact division decides**. The floating-point step can only propose; nothing approximate can be presented as exact. |
| `simbolico/polinomioExacto.ts` | Horner over ℚ[x] evaluated inside the field: turns an exact abscissa into an exact ordinate through `y = f(x)`. |
| `simbolico/constanteExacta.ts` | A variable-free subtree evaluated in ℚ, in integer arithmetic only: `nthRoot(64,3)` is 4, `8^(2/3)` is 4, `√2` is `null`. Roots are accepted only when the integer root exists. |
| `resolverSistema.ts` | Classify → eliminate → solve → **verify**, plus the four-rung ladder (exact → numeric → branches → symmetric numeric). `resolverBloque` is the entry point the host calls; it separates the domain restriction before solving and re-applies it after, **expands the double sign before pairing anything** (§18.2c), and reports `aproximado` (values came from a sweep) and `parcial` (some pair could not be enumerated) as **independent** facts — an empty *and* partial list is "I do not know", not "they do not meet". |
| `ordenada.ts` | `lectorExacto(objeto)`: the exact ordinate reader, for explicit `y = f(x)` only. |
| `dominio.ts` | What an expression needs in order to exist, read off the tree: a denominator that does not vanish, an even radicand that is not negative, a positive logarithm argument, an arcsine argument within [−1, 1]. From those conditions it derives the **breakpoints** — where the domain can change — solving them exactly through the CAS's own root engine when they are polynomial, and by a sign-change sweep otherwise. `mismaFuncion(a, b)` is the guard that decides whether a transformation is adopted: it compares **values** over the anodyne sample *and* **domains** over the breakpoints, and the second question is asked of the conditions, never of the numbers — in floating point `1/0` is `Infinity`, so `(1/x)^(-1)` evaluates to 0 at x=0 and agrees with `x`. Shared by `simplificar` and `derivar`. |
| `notablesImplicita.ts` | The notable points of an implicit curve, asked of the equation: roots are `F = 0 ∩ y = 0`, Y-intercepts `F = 0 ∩ x = 0`, and vertices `F = 0 ∩ ∂F/∂x = 0` — implicit differentiation, since `dy/dx = −Fₓ/F_y` vanishes where `Fₓ` does and `F_y` does not. That last condition is not decoration: where **both** vanish the point is singular (the cusp of `y² = x³` at the origin has no tangent), so those are filtered out. Three calls to `resolverBloque`; the states it returns travel untouched to the panel, because an empty list from an unsolved system is not "there are none". |

### 18.2b A transformation must preserve the domain, not just the values

Algebraic identities taught as rewriting rules are mostly conditional, and the two classic traps
are `(x²−1)/(x−1) → x+1` (true only for `x ≠ 1`) and `√(x²) → x` (false for every negative `x`;
the real identity is `|x|`). A simplifier that treats expressions as strings makes both.

The plugin's answer is a **fidelity guard**: a transformation is adopted only if the result is the
same function as the original. That guard used to compare values over ten anodyne sample points —
non-integer, both signs, near and far from the origin — chosen precisely so as not to land on a
root. It catches the big error, because a form that widens the domain over a whole *interval*
(`√u² → u` for `u<0`) shows up in some sample; and it is blind to the small one **by
construction**, because a domain that changes at a single *point* is invisible to a sample that
avoids the special points. Four unsound cancellations were passing through it: `x²/x → x`,
`x³/x → x²`, `x²/x² → 1` and `sin(x)·x/x → sin(x)`, all of them filling the hole at `x = 0`.

`math/dominio.ts` closes it by telling the sample where to look, and by asking the right question:

- **Where.** The conditions are read off the tree and their zeros — the breakpoints — are solved
  exactly through the CAS's own root engine when polynomial. Exactly matters: evaluating `x²/x` at
  `1e-13` yields `1e-13`, a perfectly finite number that betrays nothing. The hole is only visible
  if you step exactly on it.
- **What.** Whether a point is outside the domain is decided by the *conditions*, not by the value
  that comes out. `1/x` at 0 is `Infinity` in floating point, so `(1/x)^(-1)` is 0 there and
  matches `x` number for number; comparing conditions instead shows one demands `x ≠ 0` and the
  other does not.

Two identities that *are* unconditionally true were added at the same time, and they are the ones
that used to be left undone out of caution: `√(u²) → |u|` and `|u|² → u²`.

**What this does not do.** It does not decide implications between conditions, and it does not need
to: the caller already has the points where the difference shows. And it cannot rescue a reduction
that happens before the plugin sees it — `mathjs`'s own `derivative()` returns `1` for `d/dx(x²/x)`,
already without the hole, so the derivative panel still widens the domain there. Expressing that
result faithfully would need a notation for "everywhere except a point", which the block syntax
does not have.

### 18.2c A `±` is two curves, and both halves of the engine have to agree on that

`y = ±⁴√(1−x⁴)` is not an equation, it is the *family* of two. The tracing side always knew this:
`composicion.ts` runs `expandirDobleSigno` and hands the two branches to a `ProveedorUnion`, which
is why the plot shows both halves. The solver did not — it paired the equations as written — so
against `y = ∛x`, a system whose two curves are **odd** and therefore cross in a symmetric pair
(x ≈ 0.7507 and x ≈ −0.7508), the ⓘ panel named one point while the plot drew the crossing of the
other. Two halves of the same engine disagreeing about how many curves are written.

Since 1.5.0 `resolverBloque` expands the double sign **before pairing anything**, through the same
`parsing/dobleSigno` the plot uses. Two properties make the fix correct rather than merely
larger:

* **Branches stay grouped by the equation they came from, and pairing is group against group.**
  A branch is never crossed with its own sibling. Where the two halves meet — the radicand at zero
  — there is no intersection between distinct curves; it is one curve closing on itself, and
  enumerating that point would invent solutions. It is the same reason the plot unites them in one
  provider instead of treating them as two objects.
* **The expansion happens above the ladder, not inside a rung**, so all four rungs see
  single-valued equations. Rung 3 already expanded `±` on its own despeje results; that still
  works, because `ramaDoble` refuses to open a second independent sign axis in a context that
  already has one.

Pairs are flattened into one list before the loop, so the four rungs still read at one level of
indentation instead of at the bottom of four nested loops. Cost is bounded the same way the tracer
bounds it: one written `±` means two branches, never four, because `expandirDobleSigno` resolves
*every* sentinel in an expression with the same sign.

Two regression tests pin both properties (`mate.test.ts`). Measured against the 162 hand-written
blocks of a real vault, this changed that one system and **no other**: every other output is
identical line by line.

### 18.3 Verification is not a formality

Elimination genuinely produces false candidates, of two kinds:

- **The resultant works over ℂ.** For `x^2+y^2=1` against `(x-10)^2+y^2=1` the resultant has a real
  root at `x = 5` — the curves do share a root in `y` there, but a complex one (`y^2 = -24`).
  Substituting back and requiring a real `y` is what rejects it; a test fixes this exact case.
- **Clearing denominators invents solutions.** `extraer.ts` returns the denominator precisely so a
  candidate that annihilates it can be discarded: the curve does not exist there.

Solutions with an irrational abscissa are polished with a 2-D Newton step on the exact system;
solutions already known to be rational are left alone, since polishing could only degrade them.

### 18.4 Boundary — what it does not claim

- **Exact and complete over ℝ** for polynomial and rational systems. This is the strong case, and
  it is the school case: lines, conics, polynomials.
- **Viewport-independent but interval-bounded** for the rest. No algorithm enumerates the solutions
  of an arbitrary transcendental system over ℝ, so `numerico.ts` searches a declared interval and
  the panel states it. Two roots closer than the sampling step, or a tangency that touches without
  crossing, can be missed there.
- **Silent rather than wrong** on a non-polynomial implicit curve paired with anything: reported as
  not solvable, because solving it would require a two-dimensional sweep — which is how the
  original defect entered.
- **Pairwise semantics kept.** With three or more equations, what is listed are the crossings
  between *pairs*, as before. This changed where the numbers come from, not what they mean.
- **The plane's markers still come from the geometry.** The discrepancy is millionths of a pixel.

### 18.5 The crosshair reading (`ordenada.ts`, `Escena.yEnCurva`)

`ObjetoEscena` gained an optional `lectorY`, set by `core/app/composicion.ts` — the only place
that holds the `ObjetoMatematico`. `Escena.yEnCurva` is now the single place that decides where the
number comes from: the exact reader when there is one, `yEnRamas` otherwise. `Crosshair.dibujar`
receives the `y` already resolved and no longer calls `yEnRamas`; a renderer draws, it does not
decide what is true.

`lectorExacto` uses the object's **own `f`**, the one that traces the curve, so the domain
restriction and the substituted parameters are already applied and there is no second copy of those
rules to fall out of step with the drawing.

It declines in three cases, each for a stated reason: an implicit, parametric or polar curve (no
single `y` per `x`); `y = ±√(…)`, which expands to two curves; and the **transposed** explicit
(`salida: "x"`, a parametric component drawn on its side), whose `f` yields the abscissa — using it
would give a confidently wrong number, which is worse than the approximate one it replaced.

Newton refinement onto implicit curves is **not implemented**.

### 18.6 Tests

`tests/modules/mate.test.ts` (48) and `tests/modules/crosshair.test.ts` (10). Beyond the obvious
cases they fix: the origin as an exact `0`; a double root (invisible to any sign-change sweep); two
roots `0.002` apart (invisible to a `0.02` step); a root at `x = 12345` (outside any fixed range);
the complex-common-root trap above; a system carrying a domain restriction; and — so the crosshair
tests are not vacuous — a measurement that `yEnRamas` *does* vary with the zoom, which will fail if
that ever stops being true.

**What no suite covers:** the panel and the popover are DOM. What is tested is the engine and its
contract.

---

## 19. The symbolic core — `src/CAS/` — **built, tested, and NOT in the production path**

Read the heading twice. Everything below describes code that exists in the repository, passes its
tests and **does not run when you open a note**. It is verified by symbol: `tokenizar`,
`ErrorDeLectura`, `FUNCION_POR_COMANDO` and `TRIG_DIRECTAS` do not appear in `main.js`. The block
you render still goes through `src/parser.ts`, mathjs and the modules of §5.

It is documented here for two reasons. The migration is staged and each stage has to leave a
repository someone else can pick up; and the boundary tests that keep this code separate from the
running engine **do** ship, so a contributor who trips one needs to know what it is guarding.

### 19.1 Why there was a second engine to begin with

The diagnosis that motivated the rewrite was measured, not felt. At the time it was taken: of 145
TypeScript files under `src/`, **27 imported mathjs**, there were **62** calls to `parse(` and
roughly **90** `.toString()` on expression trees. mathjs and its satellites were **1 279 KB of a
2 615 KB bundle — 49 %**.

Those numbers have not improved, and saying otherwise would be the easy lie: today `src/` holds 166
files, 29 of them import mathjs, and `main.js` is 2.73 MB. **Nothing has been removed yet** — the
new core was added *beside* the old one, which is what a staged migration looks like from the
inside. The figure that measures actual progress is the transitive closure of `api-legado.ts`
(§19.3b), and the bundle only moves at E8.

Underneath that, the project held **two** computer-algebra systems that barely spoke:

* **CAS A** — the everyday path: strings as the currency between stages, mathjs trees in the
  middle, and *sampling* as the final arbiter of whether a rewrite was legitimate.
* **CAS B** — the exact path: `Racional` over `bigint`, `Polinomio` over ℚ[x] with Sturm sequences,
  `Polinomio2` over ℚ[x,y] with resultants, `ValorExacto` in ℚ(√d). Correct, closed, and reached by
  a **one-way** bridge — A could call B, B could not answer in A's terms.

The consequences were structural rather than a list of bugs. Canonical form was decided **while
printing** (`renderCanonico` in `formatoExpr.ts` sorts and serialises in the same function), so
changing typography was changing algebra. A transformation that needed a condition to be valid
recorded it as a **sentinel** — a node shaped like a function call (`pm`, `mp`, `pm2`, `dom`,
`fam`) whose meaning was not a function, understood by seven separate modules. And an exact result
that crossed back into A came out as a decimal.

### 19.2 The seven invariants

These are what the core **promises**, not a description of what it currently contains, and they are
what to quote when someone — including whoever wrote it — wants to take a shortcut here. This
section is their published form; there is no other document to go and find.

1. **Exactness by default; approximation is an explicit act.** A number is exact unless the user
   wrote a decimal. Precision is lost in exactly **one named place** (`aproximar`), never as a side
   effect.
2. **`null` is an answer.** When the engine does not know, it says so, rather than returning an
   approximation dressed as a result.
3. **Expressions travel between stages, not strings.** A `string` is user input or printer output.
   Never in between.
4. **Canonical form is structural.** Equality is decided by comparing structures, not by printing
   them. The algebraic order and the presentation order are two different orders in two different
   places.
5. **No rule without its condition.** `√u·√v → √(uv)` carries `u ≥ 0 ∧ v ≥ 0`. Domain conditions
   and branches are **model data** (`Condicionado`, `Rama`), not functions recognised by name.
6. **A general abstraction before a special case.**
7. **The hash filters; the structure decides.** A collision must never be able to make the engine
   claim two different expressions are the same.

### 19.3 The layout

| Path | What it is |
|---|---|
| `nucleo/expresion.ts` | The AST: a closed, immutable discriminated union — `Literal`, `Simbolo`, `Constante`, `Potencia`, `Producto`, `Suma`, `Aplicacion`, `Rama`, `Condicionado`, `Familia` — each node carrying its hash. There is **no** subtraction, division, unary minus or parenthesis node: `a−b` is a sum with a −1 factor and `a/b` a product by a −1 power, which is what makes associativity and commutativity free in the canonical form. `Suma` and `Producto` are n-ary. |
| `nucleo/numero.ts` | The numeric tower: `racional` (over `bigint`) or `flotante`. `desdeTexto` reads digits exactly; `desdeCalculo` always yields a float. **Provenance is the caller's declaration**, not a guess — the same principle the panels now use for their own numbers (§15.4c). `aproximar` is the single exactness frontier. |
| `nucleo/orden.ts` | A total order: class rank first, then per-class comparison. It deliberately does **not** use the hash as a tiebreak, so the order cannot change when the hash function does. |
| `nucleo/igualdad.ts` | Structural equality; the hash is only a fast reject. |
| `registro/ficha.ts`, `registro/catalogo.ts` | One function, one record: arity, evaluation, natural domain, sign, parity, and typed empty slots for derivative, antiderivative, inverse and exact values. **42 entries.** The catalogue is the single source of which names are functions — there is no parallel list to maintain, which is what makes `xy` a product and `sin x` not. |
| `normal/canonica.ts` | The canonical form, computed structurally. It flattens and orders, folds numbers exactly, drops neutral elements and gathers like terms — and does **nothing** whose validity depends on a condition. The traps it dodges by hand are documented in its header (`0·u → 0` is false when the rest is undefined; `u^a·u^b → u^(a+b)` changes the domain more widely than the textbook case suggests). |
| `dominio/definicion.ts` | `siempreDefinida`: the guard the rules above consult. |
| `numeros/algebraico.ts`, `numeros/forma.ts` | General algebraic numbers and the road back to a writable closed form. This is what makes `x³ = 2` answer `∛2` instead of `1.2599210498948732`. |
| `resolver/exactas.ts` | Exact roots, pure over `Expresion`. |
| `algebra/polinomica.ts` | `Expresion` → `Polinomio2`, reusing the existing traversal rather than duplicating it. |
| `io/leer/` | The reader — see §19.4. |
| `puente/mathjs.ts` | The mathjs boundary, and the **only** place the compatibility sentinels are named. |
| `puente/lectura.ts` | The transitional text → `Expresion` boundary. Used **only by tests** today. |
| `api.ts` / `api-legado.ts` | Two doors, on purpose. |

### 19.3b The two façades, and why `api-legado.ts` matters

From outside `src/CAS/` you import **`src/CAS/api`** (the new core) or **`src/CAS/api-legado`**
(the historic engine), and nothing else. Inside, freedom.

Two doors rather than one because **`api-legado.ts` can only shrink**. Each stage that moves a
capability into the core takes a line off it, and when it is empty the transition is over. If it
ever grows, something is being built in the wrong place. Its transitive closure is the migration's
own progress bar: **24 files** today.

`tests/modules/frontera.test.ts` watches **both** directions — that nobody outside reaches into
`CAS/`'s internals, and that the consuming layers ask for the CAS through the façade instead of
through its guts. The second half was added in E3.5 and caught two leaks the same day.

### 19.4 The reader (`io/leer/`)

Three files, and the split is the point: **`lexico.ts`** breaks text into named pieces and decides
nothing (it emits letters one at a time — that `sin` is a function is the analyser's judgement,
made against the catalogue, because a tokenizer that knew the catalogue would not be a tokenizer);
**`notacion.ts`** is tables only; **`latex.ts`** is a precedence-climbing recursive-descent analyser
that produces an `Expresion` **directly**.

It replaces:

```
text → 49 regexes → mathjs string → parse → mathjs tree → deMathjs → Expresion
```

with `text → Expresion`. Its transitive closure outside `src/CAS/` is **three** files — `racional`,
`polinomio`, `polinomio2` — and **`parser.ts` is not among them**, which was the architectural
point of the stage.

**It reproduces the current conventions rather than improving them**, because the goal was to read
*the same*, not to read *better*. Two that surprise people and are nonetheless the measured
behaviour of the shipping engine:

* `\sin 2x` is `sin(2x)`, but `\sin x^2` is `(sin x)^2`.
* **A bare numeric argument to one of the six direct trigonometric functions is in DEGREES**:
  `sin(45)` is the sine of 45°. Not the inverses, not the hyperbolics, and not if the argument
  contains a symbol or a constant. This mirrors `normalizarTrigonometria` in `src/parser.ts`.

Degrees written as `°`, `\degree` or `\deg` are a **postfix operator** at product precedence, so
`x^2°` is `(x²)·π/180` and not `x^(2·π/180)` — again, matching what the text rewrite does today.

The tokenizer keeps the **position** of every token. Nothing consumes it yet; it exists because an
error message with a column (`expected an expression at column 7`) is a capability the current
engine cannot offer — mathjs reports over the rewritten string, which is not what the user typed —
and it will not need rebuilding to have it.

**Verification.** The reader is compared against the historic one over the 249-case corpus and a
78-entry hand-written bench, requiring both to produce the same expression after normalisation.
**One divergence remains, and it is declared** in `DIVERGENCIAS_CONOCIDAS` in
`tests/modules/lector.test.ts`, whose assertion demands the set of divergences be *exactly* that:
a new one fails the suite, and so does one that disappears without being removed from the list.

The divergence is `x^(2/3)`. The historic reader only reads `x^{m/n}` as a real root when the
exponent is in **braces**, because its rewrite is done over text and requires `^{`. So today
`x^{2/3}` draws the full cusp, `x^(2/3)` only its right half, and `x^\frac{2}{3}` is `x²/3` — the
same expression written three ways, three curves. The new reader reads all three as the root. That
is a product decision, not a patch, and it is what stands between this reader and production.

### 19.5 The test infrastructure this brought

It is a different kind of testing from the rest of the suite and worth knowing about.

* **A shared corpus** (`tests/oro/corpus.ts`): 100 equations across six difficulty levels (20 + 19 + 18 + 16 + 13 + 14), plus 49
  standalone expressions. `tests/bateria-cas.ts` reads it too, so the battery and the golden files
  cannot drift apart.
* **Golden dumps** (`tests/oro/dorados/`), regenerated deliberately with `npm run oro`. Their
  precondition is that the engine is deterministic, which was established by regenerating three
  times and comparing bytes.
* **A three-valued semantic oracle** (`tests/oro/oraculo.ts`): `igual | distinta | indecidible`.
  Splitting "different" from "could not decide" is the whole point — `mismaFuncion` conflates them.
  It tries identity, canonical form, exact rational identity in ℚ(x,y), domain, sampling and
  branches, in that order.
* **A change classifier** (`tests/oro/clasificar.ts`): `cosmético | matemático | alcance |
  exactitud | indecidible`. `exactitud` is a **declared heuristic** (it looks for long decimals),
  and it is declared because no oracle that compares *functions* can tell `∛2` from
  `1.2599210498948732` — they are the same function to any sampler. Writing the limitation into the
  tool was preferable to pretending it was not there.
* **Boundary tests** (`tests/modules/frontera.test.ts`): the import rule of §19.3b, enforced rather
  than trusted.

### 19.6 Stages: what is done and what is not

| Stage | What it is | State |
|---|---|---|
| **E0** | Façade, shared corpus, golden dump, semantic oracle, classifier, boundary tests | done |
| **E1** | `Expresion` with hashes, numeric tower, total order, two-way mathjs bridge | done |
| **E2** | Structural canonical form | done — see the note below |
| **E3** | General algebraic numbers; `x³ = 2` gives `∛2` | done |
| **E3.5** | Boundary hygiene (six agreed tasks) | done |
| **E4** | The reader | built and verified; **not in production** |
| **E5–E8** | Simplifier with conditions, unified solver, calculus, own printer, retiring mathjs | **not started** |

**Why E2 is not in the production path, measured rather than assumed.** Replacing
`formatearCanonico` with the new normaliser over the whole corpus gives **0 mathematical changes
and 91 cosmetic ones** — and all 91 are *worse to read*: `x²−1` would become `−1 + x²`, and `x/x`
would become `x·x⁻¹`. The reason is that `formatearCanonico` does not only canonicalise, it
**presents**. The algebraic order serves the algebra; the presentation order serves the reader, and
it belongs with the printer, which is E7. The normaliser *is* in use where it belongs already: as
the semantic oracle's decision procedure.

**The order of the remaining stages changed** after the boundary review: the reader moved ahead of
the simplifier. The reason was measured — 39 imports from the CAS to the parser, with 27 calls to
`normalizarEntrada` spread across its stages — and it is that while the bus between stages is text,
any new stage is born with the boundaries the reader is about to change.

### 19.7 Consented debt

Written down because a debt that is not written becomes architecture by forgetting.

* **mathjs is still underneath** simplify, solve, differentiate and integrate. The core treats it
  as an implementation detail and reaches it **only** through `CAS/puente/mathjs.ts`.
* **The sentinels `pm` / `mp` / `pm2` / `dom` still exist** as a compatibility format towards
  `core/`, which is what understands them today. They are confined to that one bridge file; the
  core does not name them anywhere.
* **The LaTeX printer is still mathjs's**, with post-processing. Replacing it is E7, and it is
  scheduled late on purpose: the panel's LaTeX is finished goods and a misplaced comma shows.
