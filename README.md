# Window Color

Give each project window its own color. Pick a color, and the extension tints the
window — at minimum the title bar and the command center (the pill in the middle
of the title bar showing the project name) — saving it to the project's
`.vscode/settings.json`.

## Commands

| Command                            | Description                                                   |
| ---------------------------------- | ------------------------------------------------------------- |
| `Window Color: Set Window Color…`  | Opens the picker. Colors preview live and are saved on Apply. |
| `Window Color: Clear Window Color` | Removes the colors this extension wrote.                      |

## Targets

The picker's **Apply to** section offers **Full window** or **Parts**. Choosing
Parts activates a row of checkboxes; each one previews live as you tick it, so
there is no need to describe what they cover.

There is no setting recording the choice. On open, the picker infers it from the
color keys already in `.vscode/settings.json` — a target counts as on when its
keys are present. So the written colors are the only state, hand-edits to
`settings.json` are picked up, and deleting the block resets everything. "Full
window" is simply all five targets being present.

| Target               | Covers                                                        |
| -------------------- | ------------------------------------------------------------- |
| `titleBar` (default) | Title bar and the command center pill.                        |
| `activityBar`        | The icon strip along the window edge.                         |
| `sideBar`            | The panel body next to it — explorer, search, source control. |
| `statusBar`          | The bar along the bottom.                                     |
| `editor`             | Editor, tabs, panel and terminal.                             |

The activity bar and side bar are separate keys in VS Code, so they toggle
independently — you can tint the icon strip alone and leave the explorer as the
theme has it.

`editor` mutes its surfaces heavily — mixed 90% toward the active theme's own
light or dark end — because a saturated editor background destroys
syntax-highlighting contrast. Every other target uses the color at full strength.

Unticking a target removes the keys it had written. **Reset** in the picker
removes all of them, same as the `Clear Window Color` command.

## Swatch grid

The presets are generated, not hard-coded:
[buildSwatchGrid](src/colors.ts#L157) walks the color wheel for the columns, and
ramps the rows evenly from a start lightness down to an end lightness.

```ts
buildSwatchGrid(hueSteps, rows, variant);
```

`hueSteps` is the number of columns. `rows` is the total number of rows, counting
the start and end colors — so the grid is exactly `hueSteps × rows`, and the last
row lands exactly on the band's end lightness.

**Dark / Light tabs.** `variant` picks which band to ramp through, so the whole
grid is spent on one band rather than straddling both:

| Variant | Top row | Bottom row |
| ------- | ------- | ---------- |
| `dark`  | 0.44    | 0.08       |
| `light` | 0.92    | 0.52       |

Neither end touches 0 or 1, so no swatch comes out black or white. Saturation and
both lightness ends live in `SWATCH_BANDS` — edit them there.

The picker builds both grids up front and switches between them client-side. It
opens on the band that already contains the current color, falling back to the
tone of the active theme.

Dimensions are set by `HUE_STEPS` / `BRIGHTNESS_ROWS` at the top of
[src/picker.ts](src/picker.ts#L17) — currently a 16-column, 9-row grid of 144
swatches per band. The CSS column count follows `HUE_STEPS` automatically.

## Development

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
- Reinstalling the *same* version is a no-op unless you pass `--force`. During
  iteration it's easier to bump `version` in [package.json](package.json) or just
  use <kbd>F5</kbd>.
- To remove it: `code --uninstall-extension local.window-color`. That identifier is
  `<publisher>.<name>` from [package.json](package.json).

### Why those `vsce` flags

`pnpm run vsix` is `vsce package --no-dependencies --no-rewrite-relative-links`.

- `--no-dependencies` — pnpm's symlinked `node_modules` confuses `vsce`'s
  dependency walk. Safe here: esbuild bundles everything into
  `dist/extension.js` and there are no runtime dependencies.
- `--no-rewrite-relative-links` — this README links to source files, and without a
  `repository` field `vsce` refuses to package rather than emit links it can't
  resolve. The links are meant for reading the repo, not a marketplace page.

`vsce` also warns about the missing `repository` field and missing `LICENSE` file.
Both are harmless for a local install; fix them before publishing.

## Publishing

Only needed if you want this on the Marketplace rather than installed from a file.

1. Create a publisher at <https://marketplace.visualstudio.com/manage>.
2. Create an Azure DevOps personal access token (<https://dev.azure.com>) with
   **Marketplace → Manage** scope, for **All accessible organizations**.
3. Update [package.json](package.json): set `publisher` to your publisher ID
   (currently `local`), drop `"private": true`, and add `repository`, a `LICENSE`
   file and an `icon` — `vsce` warns about the missing ones.
4. Publish:

```sh
export VSCE_PAT=<your-token>
pnpm exec vsce publish --no-dependencies --no-rewrite-relative-links
```

`vsce publish patch` (or `minor` / `major`) bumps the version for you, otherwise
bump it yourself — the Marketplace rejects a version that already exists.

For the open-source registry used by VSCodium and others, publish the same
`.vsix` with [`ovsx`](https://github.com/eclipse/openvsx): `ovsx publish *.vsix -p <token>`.

## What gets written

Everything lands under `workbench.colorCustomizations` at the workspace level.
Keys not owned by this extension are preserved on write and clear.

Given a picked color `C`, `F` is whichever of white / near-black has the better
WCAG contrast against `C`. Everything else is derived, so the title bar stays a
single hue — see [buildCustomizations](src/windowColor.ts#L23). Each ticked target
contributes its own block of keys; the `titleBar` block is:

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

The other targets follow the same pattern — background `C`, foreground `F`,
borders and hover states mixed a little toward `F`. The set of keys the extension
considers its own is derived from the builder itself (`MANAGED_KEYS`), so the two
can't drift apart.

## Notes

- `window.titleBarStyle` must be `custom` (VS Code's default). With `native`, the
  OS draws the title bar and ignores these colors — the extension offers to switch.
- The command center is only visible when `window.commandCenter` is enabled.
