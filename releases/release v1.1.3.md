# 1.1.3

## Maintenance

Maintenance release with **no user-facing feature changes**. This release
focuses on internal code-quality improvements addressing a subset of warnings
identified by Obsidian's automated review:

- Timers now use `window.requestAnimationFrame` / `window.clearTimeout` for
  pop-out window compatibility.
- Element creation now uses Obsidian's `createDiv` helper.
- Removed redundant type assertions and leftover debug logging.
- Updated click handlers to avoid returning promises where a void return is
  expected.

The README now documents installation from the **Community plugins** store.

No changes were made to graphing, equation solving, or existing feature behavior.