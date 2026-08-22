# LMath 2.0.1 — German interface

`minAppVersion` stays at **1.13.0**.

A new interface language: **German**. The setting **Settings → LMath → Language** now offers Deutsch alongside English, Spanish and Portuguese, and the language chip the block uses picks it up the same way the others do — every visible text on every block is read through the new table.

The core keeps returning its canonical labels in Spanish (they are what the test corpus asserts against). German is added the way the others were: a translation table at the i18n boundary, and a `VELO_NUCLEO_DE` map that localises the labels the core itself produces. Anything the new table does not yet cover falls back to English; nothing in the render path breaks if it is incomplete.

## What changed

- New language file: `src/i18n/de.ts` (the interface text) and `src/i18n/index.ts` now lists `de` as a registered language alongside `en`, `es` and `pt`.
- The selector in **Settings → LMath** picks it up immediately; blocks already on screen rebuild themselves, which is the same behaviour any other language change has.

## What did not change

- No block syntax change. The six blocks still render under their `_*` names, and `obs-*` still does not.
- No engine change: the symbolic core in `src/math/`, the tracer, the solver and the i18n-agnostic modules are untouched.
- No minAppVersion bump — German is just one more row in the language table.

## What to verify before tagging

The new table is one file (`src/i18n/de.ts`). A quick scan of `t()` call sites against `Textos` (in `src/i18n/textos.ts`) is the cheapest way to confirm coverage — any text the German table is missing will read English in a German vault, which is the intended fallback rather than a failure.
