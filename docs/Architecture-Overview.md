# LMath — Architecture Overview

**Technical guide for version 1.3.2.** This map describes one version and is meant to be
edited along with the code; treat anything it says as true *of 1.3.2* and check it against the
paths it names. Companion to the
[Technical Reference](https://github.com/LubrieDev/lmath/blob/main/docs/TECHNICAL-REFERENCE.md),
which has the detail.

Five Obsidian code blocks, one symbolic layer, one geometry engine — and one block that uses
neither the engine nor the pipeline.

---

## Pipeline

The four **graphing** blocks (`obs-graph`, `obs-system`, `obs-derivate`, `obs-integral`):

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

`obs-trig` branches off at the first step and shares none of it — no equation split, no
`ObjetoMatematico`, no oracle, no provider, no camera. A unit circle is an `arc()`, and a
sampled polyline would draw it worse:

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

---

## Rings

Dependencies point inward. Enforced by import discipline.

| Ring | Content | mathjs | DOM |
|---|---|---|---|
| **0** | Contracts — pure types, zero logic, zero deps | no | no |
| **1** | Numeric geometry — tracing, discovery, analysis, scene, rendering | no | canvas only |
| **2** | Symbolic layer — parsing, algebra, LaTeX | yes | no |
| **3** | Host — Obsidian plugin, settings, panels | indirect | yes |

---

## Symbolic layer — Ring 2

| Module | Role |
|---|---|
| `parser.ts` | LaTeX/Unicode → mathjs. The single normalization route every consumer shares. |
| `formatoExpr.ts` | Shared algebra toolkit: terms, factors, canonical order, the `rationalize` expansion guard. |
| `simplificar.ts` | Simplify, gated by a numeric equivalence check including non-finiteness. |
| `despejar.ts`<br>`despejeInverso.ts` | Solve for `y`: layer inversion, denominator clearing, affine-by-evaluation, radical rationalization. Every non-equivalence carries a guard or is rejected. |
| `condiciones.ts` | Resolves the domain guards as one system of inequalities (sign table + intersection), so a domain reads `x ≥ √3`. |
| `derivar.ts` · `integrar.ts`<br>`integral.ts` | Symbolic derivative and antiderivative; definite-integral notation and area. |
| `latex.ts` | The one typographic pipeline. Panel and plot never disagree because both start from the same normalized string. |
| `motor/fields/` | The mathjs boundary: expressions compiled into numeric oracles. Nothing below this imports mathjs. |

---

## Geometry engine — Ring 1

| Module | Role |
|---|---|
| `motor/providers/` | One strategy per curve kind behind a single seam `geometria(viewport, tolerancia)`: explicit, implicit, rasterized, separable, periodic, parametric/polar, plus cache and union decorators. |
| `motor/tracing/` | Oracles → polylines: adaptive sampler, parametric sampler, continuation, marching squares. |
| `motor/discovery/` | Where is the curve? Sign-change seeds on a grid. |
| `motor/analysis/` | Reads the produced geometry: roots, vertices, intersections, rail progression, signed area. |
| `motor/scene/`<br>`motor/rendering/`<br>`motor/interaction/` | Scene orchestration and auto-framing; Canvas-2D renderer and overlay; camera and gestures. |

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

## Host — Ring 3

| Module | Role |
|---|---|
| `main.ts` | Registers the five block languages and the settings tab. One string discriminant per block selects the mode. |
| `host-obsidian/` | Per-block orchestration, formula and control panels, settings, i18n, fonts. |
| `engines/obs-graph/` | Legacy WebGL engine, kept behind a compile-time flag as a fallback. |

---

## Invariants

- **One normalization route.** Panel, engine, solver, derivative and tools agree byte for byte
  on what an expression means.
- **Formal algebra never overrides numerics.** Every symbolic rewrite is validated by
  sampling, with domain fidelity, before being shown or plotted.
- **A transformation that is not an equivalence states its condition or is rejected.** Never a
  formula laxer than the curve.
- **Non-finite means no curve.** Every oracle coerces to NaN; every geometric stage reads that
  as a hole.
- **The strategy is invisible.** Nothing above a provider knows which algorithm drew a branch.
- **Determinism over timeouts.** Budgets are counts, never wall-clock, so caches and tests stay
  stable.
- **Fail visibly, fail flat.** A labelled veil instead of a wrong or partial answer.
- **Exactness comes from provenance, not proximity.** A closed form is shown only when the
  text asked for one; a decimal stays a decimal however close it passes to π/6.
- **One number, one way of writing it.** The same quantity may not read differently on two
  surfaces at the same time.
- **Looking is not editing.** No interaction in any block rewrites the note.

---

## Tests

| Command | Covers |
|---|---|
| `npm run test` | Engine, symbolic and `obs-trig` units. Run on every change. |
| `npm run test:zoom` | Zoom-out sweep: the curve must not vanish or flicker. |
| `npm run fuzz` | Differential fuzzer for solver soundness. The `UNSOUND` column must stay at zero. |
| `npm run bateria` | Graduated battery for solver completeness and domain. |
