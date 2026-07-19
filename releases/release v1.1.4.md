# 1.1.4

## Maintenance

Maintenance release with **no user-facing feature changes**. This release
continues the internal code-quality cleanup of warnings identified by
Obsidian's automated review:

- Removed unused type imports from the engine composition root.
- Documented the intentional developer console (`lmath.*` in DevTools) and the
  terminal tracer CLI with justified, targeted `eslint-disable` comments instead
  of removing the output they produce.
- Silenced a false-positive `no-misleading-character-class` warning on the
  regex that strips zero-width Unicode characters from pasted LaTeX; the regex
  behavior is unchanged.

No changes were made to graphing, equation solving, or existing feature behavior.
