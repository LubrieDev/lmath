# 1.1.7

## Maintenance

Maintenance release with **no user-facing changes**. It resolves the largest
remaining group of type-safety warnings reported by Obsidian's automated plugin
review. No graphing, equation-solving, derivative, integral, or parsing behavior
was changed — the fix is purely internal typing.

- The shared symbolic AST type (`Nodo`), previously an alias for `any`, is now a
  structural interface over mathjs nodes. This clears the cascade of
  `no-unsafe-*` / `no-explicit-any` warnings across the symbolic engine —
  expression formatting, derivatives, integrals, equation solving, inverse
  solving, simplification, LaTeX output, and parametric/polar parsing — which
  accounted for the vast majority of the review's warnings.
- Node construction now goes through small typed helpers, and the boundary with
  mathjs's own API is the only place a cast remains. Internally the engine no
  longer passes untyped values around.

Existing behavior is unchanged: the full test suite passes exactly as before.
