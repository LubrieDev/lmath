# 1.1.1

## Maintenance

Maintenance release with **no user-facing changes**. It resolves the issues
flagged by Obsidian's automated plugin review:

- Rendering no longer uses the plugin instance as a component — each block now
  has its own render lifecycle (prevents potential memory leaks).
- Direct inline style assignments were replaced with Obsidian's `setCssStyles` API.
- Removed an invalid `main` field from the manifest and a disallowed lint suppression.

No changes to graphing, equation solving, or any feature behavior.
