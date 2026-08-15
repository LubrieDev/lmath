# Contributing to LMath

Thanks for taking the time. Bug reports, feature requests and pull requests are all welcome.

- **Architecture and internals:** [`docs/TECHNICAL-REFERENCE.md`](https://github.com/LubrieDev/lmath/blob/main/docs/TECHNICAL-REFERENCE.md)
- **One-page map:** [`docs/Architecture-Overview.md`](https://github.com/LubrieDev/lmath/blob/main/docs/Architecture-Overview.md)

Both carry the plugin version they describe in their first line. They track the code rather
than outlive it: a change that makes one of them wrong is not finished until that section is
updated in the same pull request.

---

## Contents

- [Getting set up](#getting-set-up)
- [Development workflow](#development-workflow)
- [Tests](#tests)
- [Debugging without rendering](#debugging-without-rendering)
- [Reporting a bug](#reporting-a-bug)
- [Pull requests](#pull-requests)
- [Code conventions](#code-conventions)
- [The rules that are not negotiable](#the-rules-that-are-not-negotiable)
- [Releases](#releases)

---

## Getting set up

Requirements: **Node.js**, **npm** and an Obsidian vault to test in (the plugin targets
Obsidian `1.13.0` and above — see `minAppVersion` in `manifest.json`, which is the number that
actually decides). TypeScript and esbuild come from `npm install`.

```bash
git clone https://github.com/LubrieDev/lmath.git
cd lmath
npm install
npm run build
```

`npm run build` bundles `main.ts` into `main.js`. To try it in Obsidian, copy `main.js`,
`manifest.json` and `styles.css` into `<your-vault>/.obsidian/plugins/lmath/` and enable the
plugin under **Settings → Community plugins**.

A practical setup is to clone the repository *directly* into the plugins folder of a scratch
vault, so `npm run build` writes `main.js` where Obsidian already reads it. Reload the plugin
(or the vault) to pick up a new build.

> **UTF-8 without BOM.** `manifest.json` and every `.ts` file must be saved without a byte
> order mark. A BOM at the start of any of them can break parsing inside Obsidian or produce
> silent build errors.

---

## Development workflow

```
edit → npm run build → reload in Obsidian → verify visually → npm run test
```

Keep a known-good `main.js` around while you experiment; restoring it is the fastest way back
if a build misbehaves in the vault.

---

## Tests

The runner is a zero-dependency micro-runner (`tests/runner.ts`), so there is nothing to
install and nothing to configure.

| Command | What it covers | Cost |
|---|---|---|
| `npm run test` | Engine and symbolic units: sampling, continuation, caching, geometry reading, notable points, solve/simplify/derive/integrate, condition systems. Also the `obs-trig` module (angle parsing, the exact-value table, drag and slider arithmetic) and the `obs-vector` module (pair splitting, the genus rule, what reaches the plane, the name each entry is labelled with, and what the ⓘ panel deduces from the drawing) and the domain restriction (`{0 ≤ x ≤ 2π}`: what is and is not an interval, and the clipping seen from the oracle) and the declared parameters (`A = 1`: what is and is not a declaration, the substitution that must not bite its neighbours, and the slider's range) and the **math engine** (`src/math/`: exact rationals, real roots by Sturm, elimination, and which curves get an exact crosshair reading) | seconds — **run on every change** |
| `npm run test:zoom` | Zoom-out sweep: each bounded curve traced across ~150 viewports, asserting traced world length | ~1 min |
| `npm run test:todo` | The two above, chained | |
| `npm run fuzz` | Differential fuzzer for **solver soundness**: generated equations per strategy family; every result marked complete must satisfy its original equation numerically | minutes |
| `npm run bateria` | Graduated battery for **solver completeness**: every real root of the original must be claimed by the solved form | ~1 min |

**Which ones to run.** `npm run test` always. Add `npm run test:zoom` if you touched tracing,
scene or rendering. Add `npm run fuzz` and `npm run bateria` if you touched anything under the
solver (`despejar.ts`, `despejeInverso.ts`, `condiciones.ts`, `simplificar.ts`,
`formatoExpr.ts`). Work under `src/trig/` or `src/vector/` is covered by `npm run test` alone —
neither uses the tracer nor the solver.

**What no suite can tell you.** There is no DOM harness here, so the block host
(`MotorExperimental.ts`) is verified by eye in a vault — canvas drawing, gestures, panels,
keyboard. When you add behavior there, push the part that can be decided into a pure module and
test that; leave only the event wiring untested. Then say in the PR what you checked by hand.
That boundary is why, for instance, `analisisVector.ts` computes every number of the ⓘ panel and
holds no text: the arithmetic is testable, the popover is not.

In the fuzzer output, the only column that must never be non-zero is **`UNSOUND`**. A
`vacuo` count means the checker found no points to compare at, not a failure.

**Changing an expected value in a test is a decision, not a chore.** These suites are how the
project checks that a formula shown to the user is true. If your change makes an assertion fail,
work out which of the two is wrong before editing either — and if you do update an expectation,
say so explicitly in the pull request.

**A green suite is evidence, not proof, and it can be wrong in your favour.** Two ways it has
already happened here, both worth expecting:

- **The test agreed with the bug.** The parameter substitution shipped an assertion that `Ab`
  must *not* be substituted. In this plugin `Ab` is the product `A·b`, so the correct behaviour
  was the opposite; the suite was green and `Ax` came out undrawn. Write the assertion from what
  the feature *should* do, not from what the code you just wrote happens to do.
- **The suite covered the line and the bug was in the block.** The domain restriction was green
  with six real failures in it, several of them silent — a blank plane with no message. Before
  calling a feature done, write the block out and look at it, including the shapes nobody would
  choose: empty braces, an interval backwards, a `cases` instead of newlines, the comparator
  typed instead of written in LaTeX.

The habit that catches the second kind is cheap: for anything that can fail *quietly*, ask what
the block does when the input is wrong, and make sure the answer is a message rather than an
empty plane.

---

## Debugging without rendering

The transform tracer shows what each pipeline step produces — the mathjs string, the rendered
LaTeX and diagnostics — without drawing anything:

```bash
npm run trazar                                     # bundles the CLI once
node tools/.trazar.cjs obs-graph "x^3+y^3=9"
node tools/.trazar.cjs obs-integral "\int_{0}^{2}x^2\,dx"
```

Flags `--grafica`, `--latex` and `--diagnostico` narrow the output to one facet; with none,
you get everything. Run it with plain `node`, **not** `npm run trazar --` — on Windows,
cmd.exe corrupts `^` and parentheses in the argument.

It reuses the same functions as the panel and the engine, so what it prints is what the plugin
would do. It does not know about `obs-trig` or `obs-vector`, which have no transform pipeline to
trace: for an angle, for a vector component and for the endpoint of a domain restriction, the whole
story is `evaluarConstante` — compile the expression and evaluate it against an empty scope
(`evaluarAngulo` and `evaluarComponente` are aliases of it, named for their call site). The one
endpoint it does not answer is `\infty`: `evaluarConstante` rejects non-finite results on purpose,
so `cotaDe` reads infinity itself before delegating (an infinite angle is an error; an infinite
bound means "do not bound this side").

---

## Reporting a bug

Open an issue with:

1. **The block, verbatim** — the language (`obs-graph`, `obs-system`, `obs-derivate`,
   `obs-integral`, `obs-trig`, `obs-vector`) and its exact contents. Most bugs live in the input.
2. **What you expected and what you got.** A screenshot helps for anything visual.
3. **Versions** — plugin, Obsidian, and OS.

For a wrong formula or a wrong curve, the tracer output for your input (see above) is worth
more than any description.

---

## Pull requests

- **One concern per PR.** A bug fix and a refactor in the same diff are hard to review and
  harder to revert.
- **Say what you verified**, not just what you changed: which suites you ran, and what you
  checked by hand in the vault. If you did not run something, say that too.
- **Cover new behavior with a test.** New code should also not introduce lint warnings.
- Do not commit build output changes on their own; `main.js` is regenerated by `npm run build`.
- Commit messages: imperative mood, prefixed by kind (`feat:`, `fix:`, `chore:`, `docs:`).

---

## Code conventions

The codebase is written with **Spanish identifiers and comments**. That is deliberate and
consistent — please match it rather than mixing languages. User-facing strings go through
`src/i18n/`.

Comments explain **why**, not what. The reason a guard exists, the measurement that motivated
a budget, or the bug a branch prevents is worth writing down; a paraphrase of the next line is
not. Match the density of the file you are editing.

Prefer finding the one change that removes a whole class of problems over adding a special
case for the input in front of you. If a fix only works for a specific equation, it probably
belongs somewhere else.

**A menu closes on an outside click; a panel does not.** The drop-down of the toggle bar is in the
way until you choose something, so `ui/menu.ts` dismisses it on any click elsewhere. The ⓘ panels
are the opposite: they are readings you consult *while* working with the plane, and they close only
by their own chip. Do not copy the listener from one to the other — that was done twice, and the
result was that dragging the angle in `obs-trig` closed the panel showing the values the drag was
changing. Any listener on `document` is shared by every block in the note; if you add one, be sure
that is what you mean.

**Tooltips are anchored at the top. Always.** The cursor sits on top of whatever it is pointing at,
so a tooltip underneath lands where the hand is and covers the control — on a slider, the very
thing being dragged. Use `ponerTooltip`, and for a control that carries its own ARIA semantics
(`role="slider"`, `role="group"`) use `ponerEtiquetaAccesible`. Never write
`setAttribute("aria-label", …)` by hand: Obsidian derives a tooltip from `aria-label` through a
path that does **not** go through `setTooltip`, and that path defaults to the bottom. `grep -rn
'setAttribute("aria-label"' src/` should only ever find the helper itself.

**The host layer is functions, not methods.** `MotorExperimental` owns three things (the plugin, the
block mode, the settings getter), declared as the `Motor` contract in `host-obsidian/contexto.ts`.
Anything that does not read those three belongs in `ui/`, `info/`, `analysis/` or `blocks/` as a
plain exported function. New code that reaches for `this` in the host is usually code that has not
found its module yet.

---

## The rules that are not negotiable

These hold across the codebase and reviews check them (the full list is §17 of the Technical
Reference):

- **Formal algebra never overrides numerics.** Every symbolic rewrite — simplification, a
  solved branch, a derivative, an antiderivative — is validated by numeric sampling, with
  domain fidelity, before it is shown or plotted.
- **A transformation that is not an equivalence states its condition or is rejected.** Squaring
  both sides, clearing a denominator or inverting an even root can gain or lose points. Either
  the result carries the condition that makes it true, or it is not emitted. A partial answer
  is always better than a formula laxer than the curve.
- **Fail visibly, fail flat.** When something is out of scope, say so — a labelled veil, a
  partial form, a `null`. Never a plausible-looking wrong answer, and never a biased subset of
  an enumeration that overflowed. **This is the rule that leaks most often**, and it leaks in a
  recognisable place: a module that returns its input untouched when it does not understand it,
  trusting some later check to complain. When that later check does not fire — because what is
  left has no `\command` in it, or no comparator, or nothing at all — the block goes blank and
  says nothing, which is the one outcome that cannot be told apart from "there is no curve here".
  If your module can decline, it should be the one that says so.
- **Determinism over timeouts.** Budgets are counts (monomials, evaluations, subdivisions),
  never wall-clock, so results are reproducible and caches stay valid.
- **Ring discipline.** Contracts import nothing. The geometry engine never imports mathjs or
  Obsidian; mathjs enters only through `core/fields/` and the symbolic layer, Obsidian only
  through the host. This is what keeps the engine testable in plain Node.
- **Looking is not editing.** Dragging, zooming, animating or toggling anything on a block is
  ephemeral. No interaction rewrites the note; a re-render returns to what is written.
- **One number, one way of writing it.** The same quantity may not read differently on two
  surfaces at the same time — two formatters for one value is a bug waiting to be reported.
- **The drawing is not the source of truth.** The viewport, the polyline and the sampling exist
  to *visualize*. When a question can be answered from the expression, answer it from the
  expression — a number the user reads must not depend on how close they happened to be zoomed.
  This rule was added *after* breaking it twice, in the two places it was easiest to break:
  - the **solutions of a system** were the crossings of the traced polylines, clipped to the
    visible view, so `(0, 0)` read `(8.4e-6, 8.4e-6)` after a pan and a solution off-screen
    simply did not exist;
  - the **`f(x)` of the crosshair** was interpolated between plotted vertices, so on `y=exp(x)`
    at `x=2.1` it read `8.16617` at one zoom and `8.17678` at another.

  Both came from the same reasonable-sounding decision — *the interaction reads the geometry*,
  which is what lets the rail and the picking work on implicit and parametric curves without
  knowing the formula. It is a good rule for those curves and a bad one wherever the expression
  can just be evaluated. `src/math/` is where the answers that must not depend on the view live;
  reach for it before reaching for a `Rama`.

---

## Releases

Maintainer task. Bump the version in `manifest.json`, `package.json` and `versions.json` (the
latter maps the version to its `minAppVersion`), write the notes in `releases/`, run
`npm run build`, and tag. Publishing a GitHub release triggers the workflow in
`.github/workflows/` that attaches and attests `main.js` and `styles.css`.

---

By contributing you agree that your contributions are licensed under the
[MIT License](https://github.com/LubrieDev/lmath/blob/main/LICENSE).
