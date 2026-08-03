# LMath

LMath is an [Obsidian](https://obsidian.md) plugin for graphing functions, systems of equations, derivatives and integrals directly inside your notes: each graphing block shows the formula rendered in LaTeX (KaTeX) on the left, and an interactive Cartesian plane (pan, zoom, crosshair, rail mode) on the right. The `obs-trig` block shares that frame but not the plane: it draws the unit circle in a fixed view, with no camera, and puts its controls where the formula would be.

---

## Contents

- [Available blocks](#available-blocks)
- [Features](#features)
- [Cover](#cover)
- [Gallery](#gallery)
- [Installation](#installation)
- [Usage](#usage)
- [Input syntax](#input-syntax)
- [Settings](#settings)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [Third-party resources](#third-party-resources)
- [License](#license)

---

## Available blocks

| Block | What it graphs |
|---|---|
| ` ```obs-graph ` | A single function or curve: explicit `y=f(x)`, implicit `F(x,y)=0`, parametric `(x(t), y(t))` or polar `r(θ)`. |
| ` ```obs-system ` | Several equations (one per line, or LaTeX `\begin{cases}…\end{cases}`), each with its own color, plus the **solutions of the system** (intersections between curves). |
| ` ```obs-derivate ` | Differentiates `f(x)` symbolically and graphs **only the derivative** `f'(x)`. |
| ` ```obs-integral ` | Definite integral `\int_a^b f\,dx`: graphs the integrand, **shades the region** between `a` and `b` and shows the signed area (and the antiderivative, when the built-in integrator covers it). |
| ` ```obs-trig ` | The **unit circle**: you write one or more angles and see where they fall, with their sine, cosine and tangent as segments and their **exact** values (`P(30°) = (√3/2, 1/2)`). |

## Features

- Custom graphing engine: it discovers and traces the curve by arc length (it does not sample over a pixel-bound grid), so bounded curves (heart, astroid, lemniscate) neither deform nor vanish when you zoom out.
- Dense implicit curves now switch to viewport-aware pixel rasterization with marching squares when needed, so highly oscillatory families render as filled bands instead of sparse hatch marks.
- LaTeX rendering of the entered expression, including nested exponents, roots of any index, and parametric/polar curves with their own notation.
- Interactive zoom and pan with the mouse and the keyboard.
- Interactive crosshair: it follows the cursor and shows `x` and `f(x)` in real time, with a marker on the curve.
- Rail mode (⌖): walk along the curve with the keyboard by on-screen arc length; at vertical asymptotes it jumps to the neighboring branch instead of derailing.
- The rendering plane adapts to the curve: smooth implicit curves use continuation tracing, while extremely dense implicit fields can render via pixel-level marching squares for a more faithful visual result.
- Automatic detection of roots, vertices and the Y intercept, displayed as markers on the plane; functions with infinitely many notable points (periodic ones) show a summary through the ⓘ button.
- Vertical asymptotes detected and drawn as dotted lines.
- Classification of non-graphable blocks (*Not defined over ℝ*, *Undefined*, *Indeterminate*, *Unsupported symbol*, etc.) with an informative overlay on the plane; the LaTeX panel never shows a verdict, only the formula.
- Input in LaTeX, Unicode (`π`, `√`, `×`, `÷`, `²`, `³`, `θ`, `∞`) and standard mathematical notation.
- Support for absolute value (`|x|`, `\left|…\right|`, `abs(x)`), the six inverse trigonometric functions and step functions (`⌊x⌋`, `⌈x⌉`).
- Automatic simplification of every displayed expression, and solving for `y` either manually or optionally automatically (see [Settings](#settings)).
- A unit circle block (`obs-trig`) with **exact** values on the 24 notable angles, a draggable point with snapping, and sine, cosine and tangent drawn as the segments they are — in degrees, radians or gradians. A block written `sin(30)` opens with that ratio already traced.

---

## Cover

<figure>
	<img src="assets/images/demo-heart.png" alt="LMath tracing a heart-shaped implicit curve on a Cartesian plane">
	<figcaption><strong>Cover.</strong> Heart-shaped implicit curve traced on a Cartesian plane, with the formula rendered in the side panel.</figcaption>
</figure>

---

## Gallery

### Basic graphing

<figure>
	<img src="assets/images/demo-explicit.png" alt="LMath graphing an explicit function with the rendered formula and the curve on the plane">
	<figcaption><strong>Explicit function.</strong> Explicit function rendered in the panel and traced on the plane with axes and interactive markers.</figcaption>
</figure>

### Systems

<figure>
	<img src="assets/images/demo-system.png" alt="LMath solving a system of equations and showing its curves and intersections on the plane">
	<figcaption><strong>Systems of equations.</strong> System of equations traced with differently colored curves and highlighted intersections on the plane.</figcaption>
</figure>

### Derivatives

<figure>
	<img src="assets/images/demo-derivative.png" alt="LMath showing the symbolic derivative and its linear graph in a split view">
	<figcaption><strong>Derivatives.</strong> Symbolic derivative shown in a split view, with the operator and the result displayed separately.</figcaption>
</figure>

### Integrals

<figure>
	<img src="assets/images/demo-integral.png" alt="LMath showing a definite integral with a shaded region and an evaluated antiderivative">
	<figcaption><strong>Definite integrals.</strong> Definite integral with a shaded region, evaluated antiderivative and the area reading in the panel.</figcaption>
</figure>

### Special curves

<figure>
	<img src="assets/images/demo-parametric.png" alt="LMath graphing a parametric curve with its component-wise equation">
	<figcaption><strong>Parametric curves.</strong> Parametric curve traced from its components, with the corresponding notation in the panel.</figcaption>
</figure>

<figure>
	<img src="assets/images/demo-polar.png" alt="LMath graphing a polar curve with the r of theta notation in the panel">
	<figcaption><strong>Polar curves.</strong> Polar curve traced with the <code>r(θ)</code> notation in the panel and its corresponding geometry on the plane.</figcaption>
</figure>

---

## Installation

### From Obsidian (recommended)

1. Open **Settings → Community plugins** and turn off **Restricted mode** if it is on.
2. Click **Browse**, search for **LMath**, and click **Install**.
3. Click **Enable**.

### Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/LubrieDev/lmath/releases)
2. Create the `lmath` folder inside `<your-vault>/.obsidian/plugins/`.
3. Copy the files there.
4. In Obsidian: **Settings → Community plugins** → enable **LMath**.

### From source

```bash
git clone https://github.com/LubrieDev/lmath.git
cd lmath
npm install
npm run build
```

Copy the generated `main.js` (along with `manifest.json` and `styles.css`) to your vault's plugins folder.

---

## Usage

### obs-graph

Write a function; if you write a full equality the plugin automatically takes the right-hand side (`y = …`, or a single-letter function label such as `f(x) = …`).

````markdown
```obs-graph
f(x) = sin(x) * 2
```
````

Implicit, parametric and polar:

````markdown
```obs-graph
x^3 + y^3 = 9
```
````

````markdown
```obs-graph
x(t) = 5*cos(t) - cos(5*t)
y(t) = 5*sin(t) - sin(5*t)
```
````

````markdown
```obs-graph
r = sin(3*theta)
```
````

### obs-system

One equation per line; each one takes its own color, and the solutions (intersections) between them are marked.

````markdown
```obs-system
y = x + 1
y = -x^2 + 3
```
````

### obs-derivate

You only write `f(x)`; the block differentiates and graphs `f'(x)`.

````markdown
```obs-derivate
x^3 - 2*x
```
````

### obs-integral

LaTeX input with the limits of integration.

````markdown
```obs-integral
\int_{0}^{2} x^2 \, dx
```
````

### obs-trig

The unit circle. An empty block already draws a working figure at 30°, because here the circle
**is** the content.

One line, one angle. The `=` only puts a name on it — it is not an equation — and the name is
optional, so the shortest block that says anything is a bare angle:

````markdown
```obs-trig
30°
```
````

Naming it is just as valid, and several angles is the same thing repeated:

````markdown
```obs-trig
α = 30°
β = 150°
γ = 210°
δ = 330°
```
````

You can write the angle any way the rest of the plugin accepts: `30°`, `-45°`, `750°`,
`\frac{\pi}{6}`, `pi/6`, `2\pi`. A line that is not a readable angle is reported in the panel
instead of being dropped; if none of them is readable, the block falls back to 30° and says so.

**Watch the units — there are two rules, not one.** The angle a block *declares* is read in
**radians** when it is a bare number, so `θ = 30` is 30 radians (it lands at 1718.9°, not at 30°)
and degrees need the `°`. Inside a **trigonometric function**, though, the plugin keeps its usual
convention, which is the opposite one: a literal argument is read in degrees, so `sin(30)` is `0.5`
here exactly as in `obs-graph` (see [Input syntax](#input-syntax)). Writing the `°` removes the
ambiguity from the first rule entirely.

Drag the point — the grabbable part is the rim of the circle, not the middle — or use the slider,
the arrow keys (the plane has to be focused) or the ▶ button. Dragging snaps to the notable angles
by default; hold **`Alt`** to place the point anywhere without going to the settings to turn
snapping off.

Turn on sine, cosine or tangent from the panel to see each one drawn as the segment it is. None of
the three is ever hidden: the ones that are off show as dotted lines, and the toggles promote them
to solid and add their construction. Everything the panel says refers to the **active** angle: the
one you last grabbed, or the first one, cycled with `Tab`.

**Naming a ratio turns its trace on.** If the expression is *exactly* a call to `sin`, `cos` or
`tan` on a constant angle, the block opens with that component already drawn:

````markdown
```obs-trig
sin(30)
```
````

It chooses a trace, it does not change the angle: `sin(30)` still evaluates to `0.5`, so the block
draws 0.5 radians with the sine lit. The call has to be the whole expression — `2sin(30)` and
`sin(30)+cos(30)` light nothing — and `asin`, `sinh`, `cot` and `sec` do not count, because they
have no trace on the figure. It is only the starting state: once you touch a toggle, the selection
is yours.

On a notable angle — any multiple of 15° — the coordinates and the ratios are given in **exact**
form rather than as decimals, but only if the angle earned it: either the block wrote it in degrees
or in terms of π, or you reached it with the block's own controls. A decimal typed by hand stays a
decimal, so `θ = 0.5236` never claims to be π/6.

The angle unit is on the block's own chip and in [Settings](#settings); the drag magnet has no chip
and is set only in [Settings](#settings), though `Alt` suspends it for a single drag.

### More input examples (obs-graph, obs-derivate, obs-integral)

Vertical asymptote:

````markdown
```obs-graph
1/(x-2)
```
````

Absolute value:

````markdown
```obs-graph
|x^2 - 4|
```
````

Inverse trigonometric function:

````markdown
```obs-graph
arctan(x)
```
````

Root of an arbitrary index:

````markdown
```obs-graph
\sqrt[3]{x}
```
````

Nested exponent (rendered and evaluated as `x⁹`):

````markdown
```obs-graph
x^{3^{2}}
```
````

### Interacting with the graph

This table is for the four graphing blocks. `obs-trig` has a fixed view and none of these: dragging
moves the angle instead of the view, and there is no zoom, no pan and no crosshair — see
[obs-trig](#obs-trig) for its own controls.

| Action | Effect |
|---|---|
| Move the cursor | Shows a crosshair with `x` and `f(x)` in real time |
| Bring the cursor near a notable point | Shows a coordinate label `(x, y)` |
| Drag | Moves the view (pan) |
| Mouse wheel | Zoom in/out centered on the cursor |
| ⌖ button (rail mode, when the curve is walkable) | Walk along the curve with the keyboard, jumping between branches at asymptotes |
| In `obs-system`, the color button per equation | Choose which curve the crosshair/rail follows |

### Functions with many notable points

In periodic functions such as `sin(x)` or `tan(x)`, the roots and vertices are infinite and are not drawn individually. Instead, an **ⓘ** button appears in the corner of the graph and shows a summary when clicked.

### Non-graphable functions

If the function does not produce any real value (for example `sqrt(-1)` or `log(x)/log(1)`), the plane is dimmed with a label indicating the cause: *Not defined over ℝ*, *Undefined*, *Indeterminate*, among others. Zoom and pan remain active.

An empty block shows the message *No function* instead of an error. This does not apply to `obs-trig`, where an empty block is a complete figure at 30°.

---

## Input syntax

The plugin normalizes different formats before evaluating them with [mathjs](https://mathjs.org/). This applies to all five blocks, which share the same parser — `obs-trig` included: it reads the angle you write with exactly this machinery.

| Type | Examples |
|---|---|
| Unicode | `π`, `√`, `∛`, `∜`, `×`, `÷`, `²`, `³`, `θ`, `∞`, `⌊x⌋`, `⌈x⌉` |
| LaTeX | `\frac{1}{2}`, `x^{2}`, `\sqrt{x}`, `\sqrt[3]{x}`, `\sin{x}`, `\log_{2}{x}`, `\left(x\right)`, `\int_{0}^{1} x^{2} \,dx` |
| Standard | `sin(x)`, `cos(x)`, `log(x, 2)`, `sqrt(x)`, `abs(x)` |
| Inverse | `arcsin(x)`, `sin⁻¹(x)`, `asin(x)` (and their analogues for cos, tan, csc, sec, cot) |

> ⚠️ **Trigonometry (degrees vs. radians):** if the argument is a literal number (e.g. `sin(30)`), it is interpreted in **degrees**; if the argument contains a variable (e.g. `sin(x)`), it is evaluated in **radians**.
>
> This is about the **argument of a function**. The angle that an `obs-trig` block declares follows the opposite rule: a bare number there is **radians** (`θ = 30` is 30 radians), and degrees need the `°`. Both rules can meet in one line — `θ = sin(30)` is 0.5 radians, because `sin(30)` is the sine of 30 degrees.

> ⚠️ **Logarithms (default base):** `log(x)` written without a base means **base 10**, as it does on a calculator — `log(100)` is `2`. For the natural logarithm write `ln(x)` or `\ln x`. An explicit base is always respected: `log(x, 2)`, `\log_{2}{x}` and `log2(x)` all mean base 2.

**Roots of any index:** the `\sqrt[n]{x}` notation is supported for cube, fourth, fifth roots, and so on. Odd-index roots with a negative radicand return the real value (e.g. `\sqrt[3]{-8} = -2`).

**Absolute value:** `|x|`, `\left|x\right|` and `abs(x)` are all accepted.

**Inverse trigonometric functions:** `arccsc`, `arcsec` and `arccot` are not native to mathjs; the plugin implements them as real-domain wrappers.

**Component-wise parametric curves:** `x(t)=…` and `y(t)=…` on separate lines are merged into a single curve; a lone component also graphs, respecting the axis it declares (`y(t)=…` gives the classic graph, `x(t)=…` comes out lying on its side).

**Unrecognized symbol:** an unknown LaTeX command (`\alpha`, `\sum`, …) does not silently degrade into a free variable: the block shows **"Unsupported symbol"**.

**Complex numbers:** not supported. If the function produces an imaginary result, the plane will show the non-graphable function overlay.

---

## Settings

The plugin adds a settings tab (**Settings → LMath**):

- **Language** — language selector for the interface text (English / Spanish; English by default).
- **Solve automatically** — when rendering, it directly shows the solved result (`y = f(x)`) without pressing the "Solve" button.
- **Show notable points** — draws the markers for roots, vertices, Y intercepts and system solutions on the plane. Turning it off leaves the plane clean; the ⓘ summary still lists them, and the crosshair and rail mode are unaffected.
- **Automatic framing** — zooms the initial view in when the curve is bounded and leaves a lot of empty plane (heart, lemniscate, astroid…); it only zooms in, never out.

Under **Trigonometric circle**, for `obs-trig`:

- **Angle unit** — degrees, radians or gradians (degrees by default). Presentation only: it changes how angles are *written*, never how a block is read, so a bare number is still radians whatever you pick. Each block also has a **DEG / RAD / GRAD** chip that overrides it for that block until the note is re-rendered.
- **Snap to notable angles** — whether dragging the point snaps to the multiples of 15° (on by default). Hold **`Alt`** while dragging to suspend it for that gesture, without coming back here to turn it off. There is no chip for this one; it is set here or not at all.

---

## Known limitations

> This version is already at a mature stage, but it may still contain bugs. If you find one, report it in an issue with the exact block that reproduces it.

- `obs-system` requires two or more equations; for a standalone curve (including an implicit one), use `obs-graph`.
- Regions and inequalities are not graphed: the LaTeX inequality operators (`\ge`, `\le`, `\geq`, `\leq`) are reported as an *Unsupported symbol*.
- The symbolic integrator has textbook-level scope: when it cannot find an antiderivative, the panel falls back to the numeric value. Improper integrals (limits at `±∞`) are labeled, not evaluated.
- The crosshair and rail mode follow a single curve at a time and require it to be walkable as `y=f(x)`.
- The visual behavior of functions with dense asymptotes (such as `sec(10x)`) at extreme zoom-out is inherent to the periodic nature of those functions.
- In `obs-trig`, exact values exist only for the multiples of 15°, and only for angles that earned the right to them (written in degrees or in terms of π, or reached with the block's own controls). Everything else is shown as a decimal.
- `obs-trig` shows the angle you are *looking at*, not the one the note declares: dragging, animating and switching units never rewrite the block, and re-rendering the note goes back to what is written.
- The ⓘ panel of `obs-trig` does not follow the unit chip: it lists degrees and radians as separate rows, and every other angle in it is given in degrees. The rim labels only follow the chip when the plane is too small for two lines; with room for two they always show degrees over the fraction of π, whatever the chip says.
- Holding `Alt` frees the drag from the magnet, but nothing in the block's own interface hints at it: inside the app the modifier is only described in the settings tab.

---

## Contributing

Bug reports, feature requests and pull requests are welcome — see
[CONTRIBUTING.md](https://github.com/LubrieDev/lmath/blob/main/CONTRIBUTING.md) for how to
build, test and send changes, and the
[Technical Reference](https://github.com/LubrieDev/lmath/blob/main/docs/TECHNICAL-REFERENCE.md)
for the engine internals.

---

## Third-party resources

LMath includes a small number of third-party assets distributed under their
respective licenses.

| Asset | Author | License | Purpose |
|-------|--------|---------|---------|
| Material Symbols | Google LLC | Apache License 2.0 | User interface icons |
| Lora | The Lora Project Authors | SIL Open Font License 1.1 | User interface font |

### Material Symbols

Material Symbols is © Google LLC and is licensed under the
Apache License, Version 2.0.

- https://fonts.google.com/icons
- https://www.apache.org/licenses/LICENSE-2.0

### Lora

Lora is © The Lora Project Authors and is licensed under the
SIL Open Font License, Version 1.1.

- https://fonts.google.com/specimen/Lora
- https://openfontlicense.org

---

## License

MIT — see [LICENSE](https://github.com/LubrieDev/lmath/blob/main/LICENSE).