# 1.3.0

## The block on a phone: the plane gets the whole width, the formula waits behind a button

Until now the block applied a desktop layout everywhere. The formula asks for half the
width and the plane takes two thirds of what is left, which on a 412 px phone leaves a
plane **214 px wide and 261 px tall** — a graph taller than it is wide, with a panel beside
it whose lower half is empty. Nothing was broken; it was a proportion designed for a
window that a phone does not have.

This release splits that decision in two, because **two different things were being
confused**: how much room there is, and how you are pointing. They now travel separately,
and that is what lets the phone gain a usable plane **without changing anything in
landscape**, where a phone has ~700 px and the desktop layout already works.

- **A narrow block is now just the plane, with the formula in a panel on top of it.**
  Below **520 px of container width**, the formula panel leaves the flow and becomes a card
  floating over the plane, opened and closed by a new **f(x)** button next to the ⓘ. The
  plane goes from 214 × 261 to **321 × 264** on that same phone — **52 % more area**, and
  landscape at last.

  The threshold is not a round number picked by feel. In the side-by-side layout the plane
  takes ⅔ of the block, so for it not to end up taller than wide you need ⅔·W ≥ 261, that
  is W ≥ 392; at 520 the plane never drops below 4:3, which is the least a graph needs to
  read as a graph. Being measured on the **container** and not on the device, a narrow side
  pane on the desktop gets the same treatment — it has exactly the same problem.

  The panel does **not** change parent when the threshold is crossed: it stays a sibling of
  the plane and only its box is rewritten. So rotating the phone is one style write —
  KaTeX is not re-rendered, and your zoom and panning survive the turn. Rotating with the
  formula open closes it, so coming back to portrait starts closed rather than with a panel
  nobody asked to open.

  The card takes **180 of the 264 px** and rests 46 px above the bottom edge instead of
  sitting on it: the ⓘ and the button that closes the formula live down there, and a panel
  that covers its own close button is a trap. While it is open the **f(x) turns into ✕**,
  the same rule the ☰ menu got in 1.2.8, and the zoom column steps aside — at that height
  it would be underneath the card. That is the price of a large panel, and it is the right
  one: with the formula in front of you, you are not navigating the graph. Tapping the
  plane also closes it, but only a **clean tap** — under 8 px of travel and half a second —
  because a drag to move the view ends up emitting a click just like a tap, and closing the
  panel every time you moved the plane would make it unusable.

- **One finger moves the plane on both axes; two fingers zoom.** Until now the only zoom on
  a phone was the ± buttons, which are precisely the ones that step aside when the formula
  is open. Panning was also fragile: a single stored position meant the second finger's
  `pointerdown` overwrote the first one's, and the view jumped from one finger to the
  other.

  Pointers are now tracked **per id**. With one, the arithmetic is the same one as always,
  so the desktop drag is unchanged. With two, the **midpoint drags** the view and the
  **separation scales** it, anchored on that midpoint: pulling the fingers apart zooms in,
  bringing them together zooms out, and the point of the world under your fingers stays
  where it is. Lifting one finger no longer jumps, because the one that remains already has
  a known position. `pointercancel` is finally handled — the system can take a finger away
  at any moment (an incoming call, a gesture of its own), and that finger used to stay
  "down" forever.

  The wheel and the pinch now share the same anchored-scale routine, so there is **one
  invariant to keep and one to test**. Two guards: below 24 px of separation the gesture
  only pans (the ratio explodes, and divides by zero in the limit), and the scale per event
  is capped at ×4.

  This has a consequence worth knowing: a swipe that **starts on the plane** no longer
  scrolls the note. `touch-action` is set on the canvas only, so swipes that start on the
  margins, above, below, or on the formula panel — 180 of those 264 px when it is open —
  still scroll normally.

- **Nothing that needs a mouse pretends to work with a finger.** On touch there is no
  hover, so the crosshair and the cursor cross had nothing to follow, and the rail is
  driven with A/D and W/S on a keyboard that is not there. All three are now off, along
  with the ⌖ button that opened a mode with no way to steer it, and the canvas no longer
  hides the system cursor. Controls that stay grow from 22 to **30 px** — not the 44 that
  the touch guidelines ask for, because four 44 px targets over a 321 px plane would take a
  third of its height and bring back the problem we came to solve. The ⓘ popover now rises
  with the chip row and is capped against the plane instead of against fixed numbers, and
  the popover and the formula are mutually exclusive: opening one closes the other, since
  on a phone they overlap almost completely.

  **What is lost with this: on a phone there is now no way to read the coordinates of a
  point.** The crosshair and the rail were the two ways to do it, and both were mouse and
  keyboard. Nothing has replaced them yet; a tap that shows coordinates is the natural
  candidate. A tablet with a Bluetooth keyboard also loses keyboard navigation — there is
  no way to detect that keyboard until a key is pressed.

- **A button to edit the block, because on mobile there is no `</>`.** Obsidian's button
  for reaching the source of a rendered block appears on hover, so on a phone it never
  does, and our canvas takes the taps. The block was left with no door to its own code.
  There is now a ✎ chip in the top-left corner — away from the others on purpose: the ones
  on the top right move the view, the ones at the bottom right open something inside the
  block, and this one leaves the block. It takes the cursor to the **end** of the block's
  body, not the start, because you press edit to carry on writing; if the note is in
  reading mode it switches to editing first, and it scrolls the cursor into view, which on
  a phone matters because the keyboard covers the lower half of the screen. It hides while
  the formula panel is open, where it would only add noise.

- **The block no longer flashes while it mounts.** The formula panel goes through
  MarkdownRenderer, and that has to be awaited before the plane can be built. In that gap
  the browser painted whatever was there — the block with its formula and **no graph at
  all** — and then jumped to the finished block. On the desktop it lasted an instant; on a
  phone, leaving the editor, it was plainly visible. The block now mounts hidden and is
  revealed once the layout is decided, the canvas sized, and the geometry traced and
  painted. It is hidden with `visibility` and not `display:none` on purpose: it has to keep
  occupying its place and measuring for real, because the layout is decided from
  `clientWidth` and the canvas is sized from its real box. There is a two-second safety net
  so that a failure halfway can never leave a block invisible.

The graphing engine itself is untouched: no sampler, tracer or analysis code changed, and
the geometry of every existing case is the same as in 1.2.9. Both suites pass, now with
nine new tests for the gestures — **354 tests** in the main suite and **12** in the zoom
suite. Those nine check the properties that are easy to break without noticing: that the
world point under the anchor does not move when pinching (with the anchor deliberately off
centre, where a wrong anchor would go unnoticed), that one pointer still pans exactly as
before, that lifting a finger does not jump, and that a cancelled pointer stops counting.

Verified on Android. **The behaviour on iOS has not been tested**, and neither has a
tablet.
