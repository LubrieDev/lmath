# Version 1.3.2

This release adds one new block, **`obs-trig`**, and two settings that go with it. It is the first
LMath block that does not plot a curve: it draws the unit circle, and you drive an angle around it.

It also brings an **angle unit selector** — degrees, radians or gradians — as a global plugin
setting and as a chip on the block.

Nothing else changes. The four existing blocks — `obs-graph`, `obs-system`, `obs-derivate`,
`obs-integral` — keep the same syntax and draw the same curves, and `minAppVersion` stays at
**1.13.0**.

---

# The new block: `obs-trig`

An empty block already renders a working figure at 30°: in this block the unit circle **is** the
content, so there is nothing missing to report.

````
```obs-trig
θ = 30°
```
````

## Writing a block

One line, one angle. The `=` only assigns a name, and the name is **optional** — it is not an
equation, so `30°` on its own is a complete block and gets called θ.

| you write | you get |
|---|---|
| *(empty)* | 30° |
| `30°` | one angle, named θ by default |
| `θ = 30°` | the same angle, named θ explicitly |
| `α = 30°` … `δ = 330°` | four angles at once |
| `θ = 750°` | two turns and 30°: the point sits at 30° and the turn count says so |
| `θ = -45°` | negative angles are ordinary input |
| `θ = 30` | **30 radians**, not 30 degrees |
| `θ = \frac{\pi}{6}`, `pi/6`, `2\pi` | π is written however you write it anywhere else |

**The two unit rules, which are not the same rule.** The angle a block *declares* is read in
radians when it is a bare number: `θ = 30` is 30 radians and lands at 1718.9°, not at 30°.
Degrees need the `°`. But inside a **trigonometric function** the plugin keeps its usual
convention, which is the opposite one: a literal argument is read in degrees, so `sin(30)` is
`0.5` — sine of 30 *degrees* — here exactly as in `obs-graph`. Written as the angle of a block,
`θ = sin(30)` is therefore 0.5 **radians**. Two rules, two places; the `°` is what removes all
doubt from the first.

A line that is not a readable angle is reported **in the panel, just under the card** — not over
the plane, where it would cover the controls. At most three are listed, and a `+N` counts the
rest. If *no* line is readable the block still draws: it falls back to 30° and reports what it
could not read.

## Naming a ratio turns its trace on

If the expression is **exactly** a call to `sin`, `cos` or `tan` on a constant angle, the block
opens with that component already drawn, solid and with its construction. Writing the name of a
ratio is already saying which one you want to look at; making you press the toggle afterwards is
asking you to repeat yourself.

````
```obs-trig
sin(30)
```
````

**It chooses a trace, it does not reinterpret the source.** The angle is still the value the
expression evaluates to, by the same rule as everywhere else — `sin(30)` is `0.5`, so the block
draws 0.5 radians and lights the sine of *that* angle. Nothing about the reading changes.

"Exactly" is meant literally, and it is checked on the **normalized** expression, which is the one
that actually gets evaluated:

| you write | opens with |
|---|---|
| `sin(30)`, `\sin{30}`, `\sin 30`, `cos(45°)`, `\tan{\frac{\pi}{4}}` | that component |
| `2sin(30)`, `-sin(30)`, `sin(30)*2`, `sin(30)+cos(30)` | nothing: the call is not the whole expression |
| `asin(0.5)`, `arcsin(0.5)`, `sinh(1)`, `cot(30)`, `sec(30)` | nothing: no trace on the figure |
| `sin(x)` | nothing — and it is not an angle either, so it is reported |
| `30°`, `\frac{\pi}{6}`, `750°` | nothing, as before |

Only the angle that opens **active** is consulted, because the components belong to the active
angle. And it is only a seed: the moment you touch a toggle the selection is yours, and moving to
another angle with `Tab` does not seed it again — a choice that undid itself as you navigated would
be the same mistake as rewriting the note when you drag.

## The figure

The framing is fixed — no camera, no zoom, no pan. The **wheel is never captured**, so the note
scrolls normally when the mouse is over the block. On **touch** the plane does keep the gesture, as
every LMath plane does: a swipe that starts on the circle drives the angle instead of scrolling the
note, so scroll from the panel or from the margin.

- **Two grids.** A faint cartesian 1:1 grid and dotted radial spokes every 15°. Each measures what
  the other cannot: the cartesian grid measures the vertical and horizontal lengths that sine and
  cosine *are*, so "this leg is a half" can be counted in quarter-unit cells — half-unit ones once
  the circle gets small enough that a quarter would stop being legible — while the spokes
  measure the angle and anchor the labels around the rim. The four multiples of 90° carry no spoke —
  the axes are already there, and a dotted line over an axis only blurs it — so 20 are drawn.
- **The 24 notable angles are marked** on the circumference, the sixteen classics — the multiples
  of 30° and 45° — with a fatter dot than the rest. Those sixteen are also labelled outside the
  rim in **both units at once**, degrees over the fraction of π. The labelling adapts to the size
  of the plane: two lines, then one line in the active unit, then the four axes only, then none.
  The label that falls under the active angle stays quiet, because the coordinates of P need that
  gap — and it is matched by coterminal, so `θ = 750°` silences the label at 30°.
- **Per angle,** its terminal side from the origin and its point on the circumference. The
  **active** angle is drawn last, so it stays on top where two cross, and it is heavier and carries
  a halo. It also takes the figure's own line colour; the angles that are *not* active are the ones
  that carry a colour each, from the same palette the other blocks use for several curves.
- **The exact coordinates of P** next to the point: `(√3/2, 1/2)` where other tools print
  `(0.866, 0.5)`. Only for the active angle, and only when it has earned an exact value (see
  below); otherwise nothing is written.

## Sine, cosine and tangent

The three are **always on the plane** — for the **active angle**, which is the one the whole panel
talks about — dotted and each in its own colour: sine purple, cosine blue, tangent green. The
panel's three toggles promote them from dotted to solid and add their construction: the sine's
guide to the axis, and for the tangent the auxiliary line x = 1 and the point S where it meets the
terminal side. They are independent, so you can have none, one, two or all three, and a block opens
with none of them promoted unless it names one (see above).

The three tones are the plugin's own blue, green and purple — the same ones the other blocks give
to several curves, not a new family — and the suite checks that the three stay distinct in both
themes. The names `sin`, `cos` and `tan` in the panel carry the colour of their component, so the
table reads as the plane's legend.

**The tangent is joined to the terminal side.** Where the join starts depends on the sign of the
cosine, because the tangent is built on the terminal side's *line*, not on its ray: with cos θ > 0
it runs from P outward, and with cos θ < 0 the line meets x = 1 on the opposite side, so it runs
from the origin.

**At 90° and 270° the drawing shows why the tangent does not exist.** There the terminal side is
the Y axis, parallel to x = 1, so it never meets it: only that prolongation is drawn, running off
the plane. No segment over x = 1, which would be infinite, and no point S, which has nowhere to be.

## Exact values

All 24 notable angles — the multiples of 15° — carry their six ratios in exact form, `√3/2` and
`(√6−√2)/4` included. On the four angles that land on an axis two of the six do not exist, and
those read "undefined" rather than a number.

They are written in **plain unicode**, on the plane and in the panel alike: the panel is rebuilt on
every frame of a drag, and putting six KaTeX formulas through that would be untenable — at this
size the unicode reads just as well. The only formula the block renders as maths is the fixed
`x² + y² = 1` at the top of the panel.

**The right to an exact value comes from the written text, not from the number.** A block earns it
by naming the angle in degrees or in terms of π — `30°`, `\frac{\pi}{6}`, `2\pi`. `0.5236` never
claims to be sine 1/2, however close it passes to π/6, and neither does `θ = 30`, which is a
perfectly ordinary angle of 30 radians with no closed form.

An angle produced **by the block's own controls** earns the right too, because its provenance is
known: drag it, step it with the keyboard, move the slider or run the animation and that angle may
show exact values from then on. It will only actually show them when it lands on a multiple of 15°
— which the magnet, `Page Up`/`Page Down` and `Home` do exactly. A decimal typed by hand never
earns it.

## The panel

Everything in it describes the **active** angle. Three bands:

1. **`x² + y² = 1`**, fixed, with the live point below it: `P(30°) = (√3/2, 1/2)`. The law that
   defines the figure stays put while the point that satisfies it moves. The angle is written in
   the unit the chip selects, so it reads `P(π/6 rad)` or `P(33.33 gon)` just the same.
2. **The reading.** With exactly one component selected, that ratio alone and large, headed by its
   name in its own colour; with none or with several, the three ratios in a table. Each one shows
   its exact form with the decimal beside it, or just the decimal when there is no exact form.
3. **The controls**: the three component toggles, the live value of θ, and the angle slider.

Below **520 px** of block width the panel stops being a column: it floats over a square plane and
starts closed. The controls are the one part that does not go with it — they move to a fixed strip
at the foot of the plane and stay visible, because a slider you have to uncover is useless exactly
where dragging on a small circle is least precise. The **f(x)** chip opens the panel.

## Driving the angle

The drag, the keyboard and the slider all write the same number and share one range.

- **Drag** the point, or anywhere within 20 px of the circumference (30 px on touch). It is the
  *rim* that is grabbable, not the disc: a press near the centre does nothing. With several angles,
  the nearest one is grabbed and becomes the active one.
- **The magnet** snaps to notable angles within 4°. It is on by default and can be turned off in
  the settings, and **holding `Alt` suspends it** for as long as you hold it — the escape hatch for
  the one case where an always-useful magnet is in the way, placing the point at some angle that is
  not notable. It is read on every event, so letting go of `Alt` mid-drag snaps again without
  lifting the finger. `Alt` only ever takes the magnet away: with the setting off it does nothing.
  The keyboard does not go through the magnet either, so a 1° step always moves 1°.
- **Keyboard on the plane:** `←` `→` for ∓1°, with `Shift` for ∓15°, `Page Up`/`Page Down` for the
  next notable angle, `Home` for 0, and `Tab` to change the active angle when the block has more
  than one (with a single angle, `Tab` leaves the block as usual). The plane has to hold focus
  first — click it, or tab into it.
- **The slider** runs **−360° to 360° with zero in the middle**, and widens symmetrically in whole
  turns to contain every angle the block writes — a block that says `θ = 750°` can reach 750° with
  the slider. It has no magnet, and it follows the angle whoever moves it. Focused, it takes the
  arrows for ±1° and `Shift` for ±15° like the plane, but `Home` and `End` go to its two ends
  rather than to zero.
- **Dragging accumulates** inside that range: 350° goes to 370°, not to 10°, so turns can be
  counted with a finger.
- **Animation** ▶/⏸ sweeps the circle at 60° per second — a turn every six seconds — wrapping at a
  full turn. It pauses when the block scrolls off screen and resumes when it comes back; grabbing
  the point stops it, and so does moving the slider. Because it keeps the angle inside the
  principal turn, the first frame reduces a multi-turn angle to its coterminal: a block written
  `θ = 750°` starts reading 30° as soon as you press play. **The point does not move** — 750° and
  30° are the same place — only the number does.

**Nothing rewrites the note.** Dragging, animating and selecting components are all ephemeral, like
everywhere else in the plugin. To change the angle the block declares, edit its source as you would
any code block.

## The ⓘ panel

Four collapsible sections, one question each, with **only the first open**: the whole thing does
not fit at once in a 261 px plane, and a list you have to scroll is not read at a glance. What you
fold stays folded while you keep dragging.

1. **The six ratios**, including csc, sec and cot, closed by the Pythagorean identity — a numeric
   check, and it says so.
2. **Angle measure** — degrees, radians, arc length and sector area. On a positive angle radians
   and arc length come out equal on purpose: with r = 1 that *is* the definition of the radian, and
   the two rows sit together so it reads as the fact it is. On a negative one they differ by the
   sign, because an arc has a length and no direction.
3. **Position on the circle** — terminal side, principal coterminal, complete turns and reference
   angle. The terminal side is named, not numbered, because the eight answers are four quadrants
   *and* four half-axes.
4. **Related angles** — opposite, complementary, supplementary and antipodal, each given as an
   angle. The panel does not say which ratio each one shares with θ.

## Chips on the plane

- **DEG / RAD / GRAD** cycles the unit the angles are written in. Each state carries its own
  **custom-drawn glyph** — the words DEG, RAD and GRAD, built for this release in the same
  geometry as the rest of the icon set — so the three read as three options of one control instead
  of as a symbol, an abbreviation and a word. This chip is a rounded rectangle rather than a
  circle, because that is the shape a word needs. It sits in the top-right corner.
- **▶/⏸** runs the animation, at the foot of the plane.
- **ⓘ** opens the information panel, in the bottom-right corner.
- **f(x)** opens the panel when it is floating on a narrow screen; on a wide one there is nothing
  to open, so it is not there.

The unit chip is presentation only. It changes how angles are **written** — the labels around the
rim and the reading in the panel — and nothing else: `θ = 2` is still 2 radians with the chip on
degrees, written as 114.6°, and the point does not move when you press it. It is also **per
block and per session**: the chip does not write to the note and does not change the setting, so
re-rendering the note brings back the unit chosen in the settings.

Gradians divide the turn into 400 instead of 360, so a right angle is `100 gon`. The multiples of
45° come out round (50, 100, 150…) and the multiples of 30° do not — 30° is `33.33 gon`, shown as
the decimal it is.

---

# Two new settings

A "Trigonometric circle" section in the plugin's settings tab:

- **Angle unit** — degrees, radians or gradians. Degrees by default.
- **Snap to notable angles** — whether dragging the point snaps to the multiples of 15°. On by
  default, and `Alt` suspends it during a drag without coming back here.

They apply to every `obs-trig` block, and neither of them changes how a block is **read**: the
angle you write means the same thing whatever is selected here. The unit can also be changed per
block, live, with the chip on the plane — that is a way of looking, not a way of writing, so it
does not touch the note and does not survive a re-render. The magnet has no chip: it is only in
the settings.

---

# Compatibility

No syntax changes, no block draws differently, and `minAppVersion` stays at **1.13.0**. Existing
notes are unaffected. If an existing block does look different after updating, that is a defect —
please report it.

---

# Validation

- Main suite: **486 passed, 0 failed** (75 of them for `obs-trig`).
- Zoom suite: **12 passed, 0 failed**.
- Typecheck and build: clean.
- CSS audit: clean.

The tests cover the parser, the angle model, the exact-value table, the drag arithmetic, the slider
range and the ratio a block names. Among them: that `30` is 30 radians and not 30°; that 90° does
not fall in the first quadrant (`Math.cos(π/2)` is 6.1e-17, which is positive, so asking the cosine
would put it there); that −400° is one turn and not two; that the undefined ratios are `null`
rather than a huge number; that the 24 notable positions agree with `Math` to 1e-12 through the
plugin's own pipeline; that the three components have different colours in both themes; that
`sin(30)+cos(30)` names no component even though it opens and closes like a single call; and that
naming one leaves the angle exactly where it was.

**What the tests do not cover.** The block host has no automated tests in this project — the suite
covers the engine, not the adapter — so everything that is DOM or canvas is checked by eye. No
performance figure is claimed for this block: it draws a circle and a handful of segments.

**Review audit.** Eight findings, all of them `obsidianmd/no-static-styles-assignment`: inline
style strings in the new block's chrome, where the rule asks for CSS classes.

---

# Known limitations

- **The rim labels ignore the gradian setting.** They show degrees over the fraction of π when
  there is room, because that correspondence is worth learning and `33.33` under `30°` is not. On a
  plane too small for two lines they do follow the chip, gradians included.
- **The ⓘ panel does not follow the unit chip.** It lists degrees and radians as separate rows, and
  every other angle in it — coterminal, reference angle and the four related ones — is always given
  in degrees.
- **The block shows the live angle, not the one written in the note.** After dragging, the panel
  reads where you are; to see what the block declares you have to look at its source. Re-rendering
  the note returns to the written angle.
- **Arc length and sector area are printed without a unit** in the ⓘ panel, next to rows given in
  degrees.
- **Exact values exist only for multiples of 15°.** That is the definition of "notable" the whole
  block shares — the table, the magnet and the 24 marks on the rim — so any other angle is shown as
  a decimal, and so is any angle whose text never claimed to be exact.
- **`Alt` frees the drag, but nothing on screen says so.** The modifier is only described in the
  settings tab, and there is no hint of it on the block itself.
