# Development

```sh
pnpm install
pnpm run watch     # esbuild in watch mode
```

Then press <kbd>F5</kbd> ("Run Extension") to launch an Extension Development Host,
open a folder in it, and run **Set Window Color…** from the command palette.

Other scripts:

```sh
pnpm run check-types   # tsc --noEmit
pnpm run package       # type-check + production bundle into dist/
pnpm run vsix          # build the installable .vsix
```

### Colors written

Everything lands under `workbench.colorCustomizations` at the workspace level.
Given a picked color `C`, `F` is whichever of white / near-black has the better
WCAG contrast against `C`. Each selected part contributes its own block of keys;
the title bar block is:

| Key                                | Value                         |
| ---------------------------------- | ----------------------------- |
| `titleBar.activeBackground`        | `C`                           |
| `titleBar.activeForeground`        | `F`                           |
| `titleBar.inactiveBackground`      | `C` mixed 30% toward mid gray |
| `titleBar.inactiveForeground`      | `F` at 60% alpha              |
| `titleBar.border`                  | `C` mixed 20% toward `F`      |
| `commandCenter.background`         | `C` mixed 10% toward `F`      |
| `commandCenter.foreground`         | `F`                           |
| `commandCenter.border`             | `C` mixed 25% toward `F`      |
| `commandCenter.activeBackground`   | `C` mixed 20% toward `F`      |
| `commandCenter.activeForeground`   | `F`                           |
| `commandCenter.activeBorder`       | `C` mixed 40% toward `F`      |
| `commandCenter.inactiveForeground` | `F` at 70% alpha              |
| `commandCenter.inactiveBorder`     | `C` mixed 15% toward `F`      |

The other parts follow the same pattern — background `C`, foreground `F`, borders
and hover states mixed a little toward `F`.

Two things are derived from `buildCustomizations` itself rather than maintained
by hand, so they can't drift from it: `MANAGED_KEYS` (what a clear removes) and
`KEYS_BY_TARGET` (how the picker infers which parts are currently colored).
There is no setting storing the selection — the written colors are the only state.

### Swatch grid

The presets are generated, not hard-coded. `buildSwatchGrid` walks the color
wheel for the columns and ramps the rows evenly from a start lightness to an end
lightness:

```ts
buildSwatchGrid(hueSteps, rows, variant);
```

`variant` picks the band to ramp through, so the whole grid is spent on one band
rather than straddling both:

| Variant | Top row | Bottom row |
| ------- | ------- | ---------- |
| `dark`  | 0.44    | 0.08       |
| `light` | 0.92    | 0.52       |

Neither end touches 0 or 1, so no swatch comes out black or white. Saturation and
both lightness ends live in `SWATCH_BANDS`. Grid dimensions are `HUE_STEPS` /
`BRIGHTNESS_ROWS` at the top of [src/picker.ts](src/picker.ts) — currently 16 × 9.
The CSS column count follows `HUE_STEPS` automatically.

The picker builds both grids up front and switches between them client-side. It
opens on the band that already contains the current color, falling back to the
tone of the active theme.

## Build and install locally

```sh
pnpm install
pnpm run vsix
```

That runs the `vscode:prepublish` hook (type-check + production bundle) and writes
`window-color-<version>.vsix` in the project root. Install it either way:

```sh
code --install-extension window-color-0.0.1.vsix
```

…or from the UI: **Extensions** view → **⋯** menu → **Install from VSIX…**.

Then reload the window (**Developer: Reload Window**) and run
**Set Window Color…** from the command palette.

Notes:

- If `code` isn't on your `PATH`, run **Shell Command: Install 'code' command in PATH**
  from the command palette first.
- Reinstalling the _same_ version is a no-op unless you pass `--force`. During
  iteration it's easier to bump `version` in [package.json](package.json) or just
  use <kbd>F5</kbd>.
- To remove it: `code --uninstall-extension local.window-color`. That identifier is
  `<publisher>.<name>` from [package.json](package.json).

### Why those `vsce` flags

`pnpm run vsix` is `vsce package --no-dependencies --no-rewrite-relative-links`.

- `--no-dependencies` — pnpm's symlinked `node_modules` confuses `vsce`'s
  dependency walk. Safe here: esbuild bundles everything into
  `dist/extension.js` and there are no runtime dependencies.
- `--no-rewrite-relative-links` — without a `repository` field, `vsce` refuses to
  package a README containing relative links rather than emit ones it can't
  resolve. Once `repository` is set this flag can be dropped.

`vsce` also warns about the missing `repository` field and missing `LICENSE` file.
Both are harmless for a local install; fix them before publishing.

## Publishing

Only needed if you want this on the Marketplace rather than installed from a file.

1. Create a publisher at <https://marketplace.visualstudio.com/manage>.
2. Create an Azure DevOps personal access token (<https://dev.azure.com>) with
   **Marketplace → Manage** scope, for **All accessible organizations**.
3. Update [package.json](package.json): set `publisher` to your publisher ID
   (currently `local`), drop `"private": true`, and add `repository`, a `LICENSE`
   file and an `icon`.
4. Publish:

```sh
export VSCE_PAT=<your-token>
pnpm exec vsce publish --no-dependencies
```

`vsce publish patch` (or `minor` / `major`) bumps the version for you, otherwise
bump it yourself — the Marketplace rejects a version that already exists.

For the open-source registry used by VSCodium and others, publish the same
`.vsix` with [`ovsx`](https://github.com/eclipse/openvsx):
`ovsx publish *.vsix -p <token>`.
