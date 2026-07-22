# 1.2.5

## Maintenance

Maintenance release with **no user-facing changes**. It reorganises the test
suite, which had grown into a single 4838-line file, and restores the type
check, which had been silently disabled by an invalid compiler option — closing
the two type holes it had been hiding. No graphing, equation-solving,
derivative, integral, or parsing behavior was changed: the shipped `main.js` is
**byte-for-byte identical** to the one built before these changes, verified with
a full rebuild and a binary comparison.

- **The test suite is split by topic.** `tests/motor.test.ts` held 60 blocks in
  one 4838-line file, which made a failing block hard to locate and every edit a
  conflict magnet. It is now an index that loads eight modules from
  `tests/modulos/` — `trazado`, `carril`, `implicitas`, `despeje`,
  `parser-latex`, `calculo`, `parametricas`, `escena` — plus a `comun.ts` with
  the shared viewport, tolerances and helpers. The runner keeps a module-level
  pass/fail count, so the modules are imported for their side effects and the
  summary is still printed exactly once; the suite remains a single bundle and a
  single `npm run test`. Purely a move: the body of every block is unchanged,
  and the 334 test names and results are identical to before the split, verified
  by diffing the runner output of both versions.

- **The type check was not running at all.** `tsconfig.json` carried
  `"ignoreDeprecations": "6.0"`, a value TypeScript 5.9 rejects outright
  (`error TS5103`), so `tsc --noEmit` aborted on the config before checking a
  single file — and since the build is esbuild, which does not type-check, no
  type error had been visible for some time. That option was silencing two
  options deprecated for removal in TypeScript 7.0, so rather than silence them
  the options themselves were retired: `baseUrl` was dead weight (there are no
  `paths`, and the only non-relative imports are the `obsidian` and `mathjs`
  packages), and `moduleResolution` moved from the deprecated `node` (`node10`)
  to `bundler`, which is what esbuild actually does. With nothing deprecated
  left, `ignoreDeprecations` was dropped. `skipLibCheck` was enabled so that
  three pre-existing errors inside `obsidian.d.ts` itself do not keep the
  command red. `npx tsc --noEmit` now reports zero errors and is usable as a
  gate again, in the editor as well as on the command line.

- **`FontFaceSet.add` was untyped: `"DOM.Iterable"` added to `lib`.** The
  set-like methods of `FontFaceSet` are declared in `lib.dom.iterable.d.ts`
  (`interface FontFaceSet extends Set<FontFace>`), not in `lib.dom.d.ts`, so
  `document.fonts.add(cara)` in the font loader resolved to nothing —
  `error TS2339: Property 'add' does not exist on type 'FontFaceSet'`, which is
  also what ESLint reported as `no-unsafe-call`. The method exists at runtime, so
  font loading always worked; only the types were blind to it. Fixed in the
  compiler options rather than at the call site, so the whole DOM surface is
  typed consistently.

- **`explicita()` returned a type wider than what it builds.** It is annotated
  as returning the union `ObjetoMatematico`, so `{ ...f, salida: "x" }` — the
  tumbled reading of an `x(t)` parametric component — was checked against every
  member of the union and rejected for excess property, even though `salida` is
  declared on `ObjetoExplicito`. The return type is narrowed to
  `ObjetoExplicito`, which is what the function actually constructs. Type-only:
  annotations are erased on emit and the bundle is unchanged.

- **Known and left alone: the `display()` deprecation.** Obsidian deprecated
  `PluginSettingTab.display()` in 1.13.0 in favour of `getSettingDefinitions()`,
  and the settings tab still calls it. This is deliberate — the manifest declares
  `minAppVersion: 1.12.7`, and the API documents `display()` as the fallback for
  plugins supporting earlier versions. It will be revisited when the minimum
  version moves to 1.13.

Existing behavior is unchanged: the full suite (334 tests), the zoom suite (12)
and the graduated battery (220 generated towers, 0 failures) pass exactly as
before.
