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
pnpm run vsix:dev      # same, but installable next to the published extension
```

> **Stop the watch task before packaging.** esbuild's watch mode owns
> `dist/extension.js` and rewrites it — in dev mode, unminified — whenever it
> changes, including right after a production build. A release packaged while
> watch is running can end up with the wrong bundle.

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

`withColor(base, hex, targets)` is a **pure** function returning the new color
map. That is what makes the live preview safe: the picker snapshots
`colorCustomizations` when it opens and computes every preview from that
snapshot, so nothing accumulates across previews and cancelling is just writing
the snapshot back.

### Matched dark/light colors

`workbench.colorCustomizations` can scope a block to a theme by **name**
(`"[Default Dark Modern]"`), but not to a theme *kind*. Matching by kind
therefore can't be expressed in settings alone, and is done by the extension:

- `themePair(hex, variant)` expands one color into `{ dark, light }`.
  `counterpart()` does the work — it keeps hue and saturation and moves lightness
  to the same relative position in the other band. Since the grid ramps lightness
  the same way, a swatch maps exactly onto the swatch at the same grid position;
  a hand-typed color gets the nearest equivalent, clamped into the target band.
- The pair is stored in `windowColor.themeColors`, because only the half matching
  the current theme is ever written to `colorCustomizations` — the other half has
  nowhere to be recovered from.
- `syncToActiveTheme()` repaints on `onDidChangeActiveColorTheme`, and once at
  activation in case the theme changed while the window was closed. It returns
  early when no pair is stored, so single-color setups are never rewritten. The
  extension activates `onStartupFinished` so the listener is actually registered.

The webview maps a tab switch by index lookup in the embedded grids rather than
recomputing the color, so the highlighted position stays put.

### The webview

The panel's markup, styles and behaviour are real files rather than template
literals:

| File                    | Notes                                                       |
| ----------------------- | ----------------------------------------------------------- |
| `media/picker.html`     | Source. Static skeleton with `{{nonce}}`-style placeholders  |
| `media/picker.css`      | Source. Plain stylesheet, linked through `asWebviewUri`      |
| `src/webview/picker.ts` | Source. Builds the DOM from the injected state               |
| `media/picker.js`       | **Generated** from the above by esbuild; git-ignored         |

`esbuild.js` produces two bundles: the extension (CJS, Node, `vscode` external)
and the webview (IIFE, browser). Both are type-checked, but under separate
`tsconfig.json` files — the webview needs `DOM` and must not see Node or the
`vscode` API, so `src/webview` is excluded from the root config and
`pnpm run check-types` runs `tsc` twice.

`src/shared.ts` holds the types crossing the boundary — `PickerState` and the two
message unions. Both sides import them with `import type`, so nothing from it
reaches either bundle at runtime; it exists to keep the two ends of `postMessage`
from drifting apart.

`renderHtml` reads the HTML, then substitutes exactly five values: the nonce, the
webview's `cspSource`, the two asset URLs, and a JSON `state` blob. Anything that
varies per session travels in that blob (`PickerState`), so nothing else in the
page needs generating. `<` is escaped in the JSON so a value cannot close the
surrounding script tag.

Editing `picker.html` or `picker.css` needs no rebuild — only reopening the
panel, since they are read each time it opens. Editing `src/webview/picker.ts`
needs the usual watch rebuild first. `localResourceRoots` is limited to `media/`,
and `.vscodeignore` must keep shipping it.

Two conventions worth keeping:

- Classes inside the mock window are prefixed `w-`. The page and the mock both
  want names like `row`, `head` and `tabs`, and a collision means page rules
  apply inside the mock — that is how `.row`'s `margin-bottom` once leaked into
  the file tree. The nested `.previews` block and its blanket margin reset are
  the second line of defence.
- The CSP has no `unsafe-inline`. Setting styles through the CSSOM
  (`el.style.setProperty`) is not covered by `style-src`, so the swatch colors and
  the mock's custom properties keep working without loosening it.

### Legacy per-theme blocks

A pre-release version scoped colors with `"[Theme Name]": { … }` blocks instead
of the current dark/light pair. VS Code applies such a block **over** the plain
keys whenever that theme is active, so one left in a user's `settings.json`
silently overrides every color picked afterwards — the colors appear to change in
the file while the window keeps showing the stale one.

Two things clear them, and both keep any customizations the user put in a block
themselves:

- `migrateLegacyThemeBlocks()` on activation, so an upgrade fixes itself before
  anything reads the colors.
- `withColor` on every write, so a block added later cannot take hold.

The activation pass matters on its own: without it the stale block would survive
until the user applied a color, and cancelling the picker would restore it.

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
| `light` | 0.52    | 0.92       |

Both bands start at their most saturated row and fade away from it, so the tabs
read the same way down the grid. Because `counterpart` maps by position within
the band, that also pairs base with base and extreme with extreme. Neither end
touches 0 or 1, so no swatch comes out black or white. Saturation and
both lightness ends live in `SWATCH_BANDS`. Grid dimensions are `HUE_STEPS` /
`BRIGHTNESS_ROWS` at the top of [src/picker.ts](src/picker.ts) — currently 16 × 9.
The CSS column count follows `HUE_STEPS` automatically.

The picker builds both grids up front and switches between them client-side. The
band follows the active theme: it opens on the matching one, and an
`onDidChangeActiveColorTheme` subscription posts a `variant` message so the tabs
keep up while the panel is open. Only a change of theme *kind* is posted, so
swapping between two dark themes leaves a band the user picked by hand alone.

Switching bands carries the selection to the swatch at the same grid position, so
the counterpart shade is shown rather than the old color reinterpreted. That is
skipped when a theme change arrives with matching off, since the single chosen
color is then meant to stay exactly as it is.

## Dev build alongside the published one

```sh
pnpm run vsix:dev
code --install-extension window-color-dev-<version>.vsix --force
```

`scripts/package-dev.js` produces the same build under a separate identity, so it
can be installed without uninstalling the real extension:

| | Published | Dev |
| --- | --- | --- |
| id | `window-color` | `window-color-dev` |
| Display name | Unique Window Colors | Unique Window Colors `[DEV]` |
| Commands | `windowColor.*` | `windowColorDev.*` |
| Setting | `windowColor.themeColors` | `windowColorDev.themeColors` |

Renaming the commands is not cosmetic: VS Code throws when two extensions
register the same command id, so a dev build that kept them would fail to
activate whenever the published one is installed. Renaming the setting also keeps
the two builds from fighting over the same stored color pair.

The script rewrites the `windowColor.` prefix in both the manifest and the
bundle, builds to `dist/extension.dev.js` so `pnpm run watch` cannot clobber it,
and restores `package.json` and `.vscodeignore` in a `finally` block.

Both builds contribute the same colors to the same `workbench.colorCustomizations`
keys, so run only one of them at a time to avoid confusing results.

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

### Why that `vsce` flag

`pnpm run vsix` is `vsce package --no-dependencies`. pnpm's symlinked
`node_modules` confuses `vsce`'s dependency walk; skipping it is safe here
because esbuild bundles everything into `dist/extension.js` and there are no
runtime dependencies.

### README images

The Marketplace renders the README on its own domain and does **not** serve files
out of the `.vsix`, so a relative path like `assets/preview.gif` resolves to
nothing there. `vsce` handles this by rewriting relative links against the
`repository` field at package time:

```
assets/preview.gif
  → https://github.com/n1kk/vscode-window-color-extension/raw/HEAD/assets/preview.gif
```

So images must be **committed and pushed** to the default branch of a public repo
before publishing — the Marketplace fetches them from GitHub, not from the package.

Do not pass `--no-rewrite-relative-links`. It suppresses that rewriting and ships
the raw relative paths, which show up broken on the extension page. (It was needed
only before `repository` was set, when `vsce` refused to package at all.)

The extension icon is different: it comes from the `icon` field inside the `.vsix`,
so it works regardless of any of this.

## Publishing

Only needed if you want this on the Marketplace rather than installed from a file.

1. Create a publisher at <https://marketplace.visualstudio.com/manage>.
2. Create an Azure DevOps personal access token (<https://dev.azure.com>) with
   **Marketplace → Manage** scope, for **All accessible organizations**.
3. Push any README images to the default branch first — see
   [README images](#readme-images) above.
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
