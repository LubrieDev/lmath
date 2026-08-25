# LMath 2.0.2 — Undefined and indeterminate expressions stop lying

`minAppVersion` stays at **1.13.0**.

This release closes **BUG-001** (issue #2) and the family it opened: a slider value that breaks the expression is now *recognized*, and the block answers with the formal veil instead of drawing a curve that does not exist.

## The bug

Since sliders landed in 1.4.0, a parameter value could turn a formula into an undefined or indeterminate form, and the block drew `y=0` anyway:

| Block | Status | What was drawn |
|---|---|---|
| `Ax^{A-1}` with `A=0` | Undefined | `y=0` (wrong) |
| `Ax^{A}` with `A=0` | Indeterminate (`0^0`) | `y=0` (wrong) |
| `tan(A)` with `A=90` | Undefined (pole) | `y=1.63312e+16` (a floating-point residue drawn as a line off-screen) |

## What changed

- **The substitution format is no longer invisible to the domain reader.** Sliders write each value parenthesized, so `Ax^{A-1}` with `A=0` arrives as `x^{(0)-1}` — a *binary* minus of two constants that the domain reader could not fold. It now folds constant arithmetic (`0-1`, `2*3`, `1+1/2`…), so the negative-power condition (`base ≠ 0`) is emitted again and the fidelity guardian rejects the collapse to the constant `0`. Typed-by-hand forms (`0x^{-1}`) always behaved; the regression was the `(value)` format, and slider and keyboard are consistent again.
- **A zero exponent demands a nonzero base.** `u^0` at `u=0` is the indeterminate form `0^0`, so the domain reader now emits the condition, the guardian stops endorsing `0·x^{(0)} → 0`, and `y=0^0` itself is classified *Indeterminate*.
- **A constant with a broken domain is veiled, not drawn.** A new classifier (`degeneradaPorSingularidad`) recognizes the family: the function is one constant on its whole domain and that domain is broken at isolated points. It veils with the label the broken condition dictates — *Undefined* for an annihilated quotient (`0x^{-1}`), *Indeterminate* for `0^0` — and deliberately keeps drawing everything that was always drawable: poles (`1/x`, `5/(x-5)`, `tan x`), removable holes of non-constant functions (`(x²−1)/(x−1)`), and interval domains (`sqrt x`).
- **The veil is now alive.** It was decided once when the block mounted, so dragging a slider into —or out of— a broken form left the veil saying what was true a moment ago. The classification is recomputed on every slider move, and the scene runs empty under the veil, since underneath it would be exactly the lying line the veil exists to deny.
- **`0^0` evaluates undefined in both evaluation paths** (the mathjs path rewrites `^` to a guarded function; the native compiler shares the same implementation, so the differential validation still passes). The symbolic core in `src/CAS/` is aligned with the same doctrine — it already refused `u^0 → 1` for symbolic bases, and now refuses `0^0 → 1` for literal ones too.
- **Trigonometric poles are honest.** `Math.tan(pi/2)` is not infinity but the residue `1.633e16`; likewise `sec`, `csc`, `cot` at their poles, and `1/cos(pi/2)`, `1/sin(pi)` through exact-zero residues. The six direct trigonometric functions now return `±Infinity` at their exact poles and the exact zero at their zeros, in both evaluation paths. The detection window on the argument is deliberately narrow (1e-12 turns of π): the float of an exact pole sits ~1e-16 from it, while the implicit-curve pole localizer probes at ±1e-9 expecting *finite* huge values — a wider window ate those probes, which the zoom-out regression suite caught.
- **The LaTeX panel scrollbar gets its own token.** `--lmath-scrollbar` (in `styles.css`, one value in the dark base block, one in `.theme-light .lmath-container`) carries the whole `scrollbar-color` — thumb and track — and nothing else; it no longer shares `--lmath-borde` with the borders. Editing the colors needs no rebuild.

## What did not change

- No block syntax change; the six blocks render under their `_*` names as before.
- No slider syntax change: declarations are still `name = constant`, and ranges stay automatic.
- No minAppVersion bump.
- `obs-derivate` and `obs-integral` still do not take parameters, exactly as before.

## What to verify before tagging

The two reproduction blocks of the issue (`Ax^{A-1}` / `Ax^{A}` with `A=0`) must veil as *Undefined* and *Indeterminate*; `tan(A)` with `A=90` must veil as *Undefined*; and `1/x`, `tan(x)`, `sqrt(x)`, `(x²−1)/(x−1)` must keep drawing exactly as before. Moving a slider through `90` in `tan(A)` must show and dismiss the veil live, without reopening the note.

## What to verify before tagging

The two reproduction blocks from the issue (`Ax^{A-1}` / `Ax^{A}` with `A=0`) must veil as **Undefined** and **Indeterminate**; `tan(A)` with `A=90` must veil as **Undefined**; and `1/x`, `tan(x)`, `sqrt(x)`, `(x²−1)/(x−1)` must keep drawing exactly as before. Moving a slider through `90` in `tan(A)` must show and dismiss the veil live, without reopening the note.

At this point, no additional unresolved cases involving slider values have been identified. A deeper review of commits **46 and 48** is planned for **December 2026** to further verify the stability of the affected systems.
