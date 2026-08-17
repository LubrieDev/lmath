# 1.5.0

The block syntax changes. `obs-graph` becomes `_graph`, and the same for the other five.

**Nothing you already wrote breaks in this release.** Both names render, side by side, so notes
written before today keep working after you update.

> ### ⚠️ Read this before skipping the update
>
> **1.5.0 is the only release that can convert your notes for you.**
>
> In **2.0.0** the old `obs-*` names stop being accepted **completely** — a note still written
> `obs-graph` will not render, it will sit there as a plain code block — **and the *Update notes*
> button is removed in that same release**. There will be nothing left to convert your notes
> automatically; the alternative will be editing every fence by hand.
>
> If you have blocks written the old way, open **Settings → LMath → Update notes** while you are
> on 1.5.0. It takes one click and asks before writing anything.

That warning is the whole reason this version exists. The migration — the button, the startup
notice, the tool behind them — is temporary scaffolding to get from the old syntax to the new one,
and it is all removed in 2.0.0 together with the syntax it exists to leave behind.

---

## The rename

| Until 1.4.0 | From 1.5.0 |
|---|---|
| `obs-graph` | `_graph` |
| `obs-system` | `_system` |
| `obs-derivate` | `_derivate` |
| `obs-integral` | `_integral` |
| `obs-trig` | `_trig` |
| `obs-vector` | `_vector` |

**Why change them at all.** A code-block identifier is a global key shared by every plugin you
have installed. `graph` bare is among the easiest names for someone else to have taken, and
whoever loses that draw stops rendering with no warning to anybody. The names needed a prefix that
marks them as this plugin's without being a word another plugin would want.

**Why an underscore, specifically.** The first attempt was `graph*`, and it did not work: Obsidian
does not preserve the asterisk from a fence's info string, so the key the plugin registered never
matched what was written in the note. `\graph` and `.graph` fail the same way — the identifier has
to stay inside the character set Obsidian accepts. The underscore does, and still marks the block
at a glance.

**Both names work for now, and that ordering is deliberate.** If the old identifier stopped
rendering in the same release that introduces the new one, notes would break *before* anyone could
press the button that fixes them. The migration button only makes sense on a plugin that already
accepts both syntaxes.

## Updating your notes

Settings → LMath → **Update notes**. It scans the vault, shows you what it found — how many notes,
how many blocks, which files — and asks before writing anything. Files are written one at a time
through Obsidian's own atomic path, and only the fence line changes; nothing inside a block is
touched. If you cancel at the summary, nothing has been written.

You do not have to run it the moment you update — the old names keep rendering for as long as
1.5.0 is what you have installed. But 1.5.0 is the last release where the button exists, so
running it before you move on to 2.0.0 is the difference between one click and editing every
fence by hand.

It has been run by hand over a vault containing **300 LMath blocks**, and all 300 were rewritten
correctly. That is a check on real notes, not part of the automated suite quoted at the end of
these notes; the scanner underneath it has 19 tests of its own.

There is also a notice at startup describing the change. **It appears on every load**, which is
deliberate and not a bug: it used to appear once per install, and start-up is exactly the moment
when several notices are stacked on top of each other, so the only one there was got spent without
anyone reading it and never came back. It goes away with the rest of the migration in 2.0.0.

## A system written with `±` was listing half its solutions

`y = ±⁴√(1−x⁴)` is not one curve, it is two. The plot always knew that — it draws both halves —
but the solver behind the ⓘ panel paired the equations as written and only ever crossed one of
them. Against `y = ∛x`, whose two curves are odd and therefore meet in a symmetric pair, the panel
named one point while the plot drew the crossing of the other.

The double sign is now expanded before any pairing happens, through the same code the plot uses.
Branches stay grouped by the equation they came from and are crossed group against group, never a
branch against its own sibling: where the two halves meet — the radicand at zero — the curve is
closing on itself, not crossing another one, and listing that point would be inventing a solution.

Measured over 162 hand-written blocks from a real vault, this changed that one system and no
other.

## `\sin{…}` now accepts braces inside its argument

`\cos{\sin{x}}`, `\sin{\sqrt{x}}` and anything else with a braced group inside a trigonometric
function's braced argument did not render at all — the block came up empty, with no error.

The rule that converts `\sin{ARG}` could not match an argument containing braces, and it ran once,
outward in: in `\cos{\tan{x}}` it converted the inner `\tan` and left the outer `\cos{` broken.
Repeating the pass would not have helped, because radicals are converted *later* in the pipeline,
so `\sin{\sqrt{x}}` still has the root's braces at that point. It now counts brace levels, which
is what `\ln{…}` and `\log{…}` have done for a while.

The same change covers the **hyperbolic** family, which had never been in that rule at all:
`\sinh{x}`, `\cosh{x}`, `\tanh{x}`, `\sech{x}`, `\csch{x}` and `\coth{x}` with braces did not work
either. Their arguments are *not* converted to degrees, unlike the trigonometric ones — `\sinh{30}`
is 30, `\sin{30}` is 30°.

## The ⓘ box no longer jumps when you open it

Opening an ⓘ panel showed it briefly stretched to full height with a scrollbar, which then
collapsed to the right size a moment later. Its lines are typeset with KaTeX, and until that
finished each line was still a paragraph carrying its own margins — enough to push five lines past
the box's maximum height. The box now measures the same before and after, so it opens at its final
size.

## Colour

The block used to take its panel colour from the theme's *secondary* background, which is lighter
than the primary in some themes and darker in others — so depending on your theme, the same
release rendered either as a recessed card or as a pale grey box around a dark plot.

The chrome is now three layers, all defined against the note itself: the plot surface is the note's
background, the area around the formula sits a step above it, and the formula card and the ⓘ box
sit a step below. It follows any theme, light or dark, and the relationship between the layers
stays the same in all of them.

## Also in this release

- A `_derivate` or `_integral` block still shows its formula; the ⓘ panels of every block continue
  to typeset their mathematics with KaTeX rather than as plain text.
- Documentation rewritten for 1.5.0: the technical reference gains sections on the rename and its
  tool, on the colour tokens, and on the `±` expansion.

## Known limitations

These are real and not fixed in this release:

- **A `_derivate` block does not understand the `{0 ≤ x ≤ 2π}` domain restriction**, which
  `_graph` does. Written with one, the block reports no function.
- **A `_derivate` or `_integral` block with a parameter declaration** (`A = 2` on its own line)
  does not work: parameters are a `_graph`/`_system` feature, and in these two blocks the
  declaration is taken as the block's first equation.
- **A parameter cannot be defined from another parameter.** `B = 2A` is not read as a
  declaration, and the block draws nothing.
- **An integral whose interval contains two poles that cancel** reports `0` rather than
  divergent. `∫₀^π cot x dx` is the case: each half diverges — the plugin says so if you ask for
  either half on its own — but over the whole interval the two infinities cancel into a Cauchy
  principal value, which is not the value of the integral.

## Compatibility

`minAppVersion` stays at 1.13.0. Blocks written with `obs-*` render exactly as before.
