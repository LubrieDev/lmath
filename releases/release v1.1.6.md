# 1.1.6

## Bug fixes

- **Fixed a freeze in `obs-integral` with singular integrands.** A definite
  integral whose integrand blows up near a limit — for example
  `\int_{0}^{\pi/2}\frac{1}{\csc 2x-\cot 2x}\,dx` — could hang Obsidian completely
  when leaving the block. The adaptive area quadrature capped recursion depth
  but not the total number of subdivisions, so a numerically jagged integrand
  (here, catastrophic cancellation near `x=0`) drove it toward an exponential
  blow-up. The quadrature now has a subdivision budget: such integrals resolve
  in a fraction of a second and report **"Divergent integral"** instead of
  freezing the app.

## Maintenance

This release also resolves a group of type-safety warnings reported by
Obsidian's automated plugin review:

- The shared expression evaluator (`compilarExpresion` / `compilarFuncion`)
  now returns `unknown` instead of `any`. Every caller narrows the value to a
  number before using it, so the graphing and analysis paths no longer rely on
  an untyped result.
- Non-real results (for example `sqrt(-1)`) are still treated exactly as
  before — as outside the real domain — so degenerate-function detection and
  the "not defined in ℝ" label are unchanged.