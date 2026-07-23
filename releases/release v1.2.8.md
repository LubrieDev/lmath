# 1.2.8

## Graph controls: an icon set, one tooltip per control, and a crosshair that survives panning `sin(1/x)`

Most of this release is cosmetic — a real icon set for the plane's controls, a
single tooltip per control instead of two, zoom buttons that repeat while held,
and the removal of a decorative marker — and it carries two bug fixes: curves
now close against the edge of their domain instead of stopping short of it, and
the crosshair on `sin(1/x)` no longer goes dark after you pan the view.

- **Curves stopped short of the edge of their domain, leaving a visible gap
  there.** Reported on the system `y = ±⁴√(1−x⁴)` — the squircle `x⁴+y⁴=1` —
  which at high zoom showed a hole at (±1, 0) with the stroke cut in two, so the
  near-vertical tip read as a dashed asymptote rather than a curve. Where a curve
  meets the end of its domain with a *vertical tangent*, the value falls off as a
  root of the distance to the edge: for `⁴√(1−x⁴)` it is `y ≈ (4ε)^(1/4)`, which
  descends so slowly that after the sampler's `PROF_MAX` refinement steps y is
  still ≈7·10⁻³ — tens of pixels once you zoom in — and the branch simply ended
  there. It closed only by luck, when the edge happened to land exactly on the
  sampling grid, which is why the gap appeared at some zoom levels and not
  others, and why it was never a regression: the defect had been latent since
  long before 1.2.6. The sampler already located the edge to machine precision —
  it bisects 40 times to decide whether the discontinuity is a pole — but threw
  that point away instead of drawing it. It is now emitted, attached to the
  finite end and inside the same segment, so the polyline reaches the edge: the
  gap goes from 6.6·10⁻³ (2.5·10⁻² during a gesture) to zero, both passes agree,
  and it stays under a pixel at any zoom. This applies to every explicit curve
  that touches a domain boundary — `√x`, half-parabolas, and the rest — all of
  which had the same gap, just smaller than the fourth root made it.

- **The crosshair on `sin(1/x)` stopped appearing after a pan — a regression
  from 1.2.6, unnoticed until now and fixed here.** 1.2.6 began drawing
  stretches that oscillate faster than one pixel as a min/max envelope band,
  marked `CalidadRama: "incierta"` and carrying no `parametro`, since a band is
  not a curve you can walk along. The walkability test that gates the crosshair,
  `curvaRecorrible`, rejects any branch without a `parametro` — its purpose is to
  catch curves that fold back in x and are therefore multivalued. A band trips
  that test even though it is not a fold, so the presence of a single band
  disabled the crosshair for the *whole* curve. It surfaced on `sin(1/x)`
  specifically, and only after panning: the band near x=0 forms or not depending
  on how the sampling grid lands on the pixels, which shifts as the view moves,
  so a settled default view resolved cleanly while a panned one did not — and a
  wheel zoom, which resolves the oscillation as it magnifies, never triggered it
  either. The test now excludes `"incierta"` bands from its judgement, exactly as
  the crosshair's own `yEnRamas` already skips them: the crosshair works over the
  rest of the curve and is simply not drawn over the band itself, where there is
  no single y to report. Before 1.2.6 the curve was traced as ordinary branches
  throughout and was always walkable, so this restores the earlier behavior.

- **The plane's controls now use a real icon set.** Home, zoom-in, zoom-out,
  trace, info and the options menu were text glyphs and emoji (🏠, +, −, ⌖, ⓘ,
  ☰), and the pointer over the plane was a hand-drawn cross. All are now Material
  Symbols, drawn as inline SVG through Obsidian's DOM API rather than
  `innerHTML`, and filled with `currentColor` so each icon inherits its button's
  colour and follows the active/inactive highlight unchanged. The pointer icon is
  drawn on the canvas as a `Path2D`, built lazily so it costs nothing in the Node
  test bundle, which never paints.

- **The zoom buttons repeat while held.** Pressing + or − zoomed a single notch
  and had to be clicked again for every further step. They now keep zooming for
  as long as the button is held, at a steady cadence, reusing the same centred,
  smoothed zoom a single press already used — so holding reads as one continuous
  zoom rather than a stack of steps. A quick tap still does exactly one notch.

- **One tooltip per control, above it rather than below.** The options button
  carried both a `title` attribute and an `aria-label`, so hovering it produced
  two tooltips at once — the browser's native one and Obsidian's. Every control
  now uses Obsidian's `setTooltip` with top placement and no `title`, so there is
  a single dark tooltip, positioned above the control where the pointer does not
  cover it.

- **The experimental-engine ⚙ marker is gone.** The small gear in the top-right
  corner of the plane was a decorative label; it has been removed along with its
  now-unused translation strings, and the zoom buttons moved up to take its
  place.

Both suites pass unchanged — 345 tests in the main suite and 12 in the zoom
suite.
