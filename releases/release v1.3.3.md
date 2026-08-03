# 1.3.3

## Why 1.3.2 was superseded

1.3.2 did not pass Obsidian's automated review. Everything else in that review passed: the
`main.js` and `styles.css` assets carried verified GitHub attestations, no suspicious network
patterns were found, no vulnerable dependencies were detected, and the build check reproduced
the released `main.js` **byte for byte** from the repository, which is the strongest thing the
report can say about a plugin. The only failure was in the source-code check: eight instances of
`obsidianmd/no-static-styles-assignment`, all of them in the new block's chrome.

A release marked *Failed* is not one anyone should install, so **1.3.2 is superseded by this
one**. This release is 1.3.2 with that check satisfied and nothing else changed: the plugin
behaves exactly as the **1.3.2 release notes** describe, and that document remains the reference
for what `obs-trig` does.

## The fix

The eight findings were one defect repeated, not eight different problems: **styling that never
changes, written as inline strings in the code instead of as rules in the stylesheet**. The rule
asks for CSS classes, `setCssStyles` or `setCssProps`, and all eight cases could simply be
replaced with CSS classes. What stayed in the host is what genuinely depends on values computed
at runtime: the chip's side, the box's width and the handle's position. That is why the review
never flagged them.

- **The slider's focus ring left the TypeScript entirely.** A `focus` listener and a `blur`
  listener that painted an outline became a single `:focus-visible` rule in `styles.css`. That
  also fixes an accessibility detail: the ring used to appear on mouse clicks too, which is
  precisely when nobody needs it. `:focus-visible` lets the browser make that distinction. The
  inline `outline: none` had to disappear with those listeners, otherwise it would have overridden
  the stylesheet rule and the focus ring would never have appeared.

- **The trig controls' two layouts became two CSS classes**, toggled at the width threshold
  instead of swapping style strings over one another. The height of the bottom strip now reaches
  the stylesheet through `setCssProps` as a custom property, so `ALTO_CONTROLES_TRIG` remains the
  single source of truth for that measurement. Copying the value into the stylesheet would have
  created two sources of truth for the same layout, and that dimension is shared with the canvas.

- **The remaining four findings** were static pieces: the reading band, the component row, the
  live value itself — the large number the whole panel revolves around — and one row of the ratio
  table. They are now ordinary CSS classes. The row that holds that value (θ on the left, the
  number on the right) was converted as well, even though the review did not flag it, because it
  was the same kind of rule one line away. Converting only half of a block is how a stylesheet
  becomes harder to maintain.

## What did not change

No behavior, no syntax, no rendering and no settings changed. `minAppVersion` remains
**1.13.0**. If any block, including `obs-trig`, behaves or renders differently after updating,
that is a defect and should be reported.

## Validation

- Main suite: **486 passed, 0 failed**.
- Zoom suite: **12 passed, 0 failed**.
- Typecheck and build: clean.
- Review audit: **0 findings**, down from the eight this release exists to remove.
- CSS audit: clean.

**What the tests do not cover.** The block host still has no automated DOM tests, and this
release only moved presentation code, which is exactly the part no automated suite can see. Two
things were therefore verified manually: that the slider shows its focus ring when reached with
`Tab` but not when clicked, and that the controls transition correctly across the **520 px**
breakpoint in both directions.
