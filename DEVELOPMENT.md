# Development

```sh
pnpm install
pnpm run watch         # esbuild, both bundles
pnpm run check-types   # tsc over the extension and the webview separately
pnpm run vsix          # installable .vsix
pnpm run vsix:dev      # .vsix installable next to the published extension
```

<kbd>F5</kbd> launches an Extension Development Host. Open a folder in it, or the
commands refuse to run.

Packaging is safe with watch running — see [Packaging](#packaging) for why that
took effort.

## Layout

`esbuild.js` builds two bundles: the extension (CJS, Node, `vscode` external) and
the webview (IIFE, browser). They have separate `tsconfig.json` files because the
webview needs `DOM` and must not see Node or the `vscode` API; `check-types` runs
`tsc` twice for that reason.

| File                    |                                                                            |
| ----------------------- | -------------------------------------------------------------------------- |
| `media/picker.html`     | Source. Static, with `{{nonce}}`-style placeholders                        |
| `media/picker.css`      | Source                                                                     |
| `src/webview/picker.ts` | Source. Builds the DOM from the injected state                             |
| `media/picker.js`       | **Generated**; git-ignored, but must stay in `.vscodeignore`'s shipped set |

`src/shared.ts` holds the types crossing the boundary. Both sides use
`import type`, so it never reaches either bundle at runtime.

Editing the html or css needs no rebuild, only reopening the panel — they are
read each time. The webview `.ts` needs the watch rebuild.

## Webview gotchas

- **`renderHtml` substitutes five placeholders** — nonce, `cspSource`, two asset
  URLs, and the `state` blob. `<` is escaped in that JSON so a value cannot close
  the surrounding script tag.
- **Mock-window classes are prefixed `w-`.** The page and the mock both want
  `row`, `head`, `tabs`; a shared name lets page rules apply inside the mock —
  a page-level `.row` once leaked its `margin-bottom` into the file tree.
- **No `unsafe-inline` in the CSP, deliberately.** Styles set through the CSSOM
  (`el.style.setProperty`) aren't covered by `style-src`, so swatch colors and the
  mock's custom properties work without loosening it.
- `localResourceRoots` is limited to `media/`.

## Colors

Everything lands in `workbench.colorCustomizations` at workspace level. Each
selected part contributes a block: background is the picked color, foreground is
whichever of white / near-black has better WCAG contrast, borders and hover
states are mixed a little toward the foreground.

`MANAGED_KEYS` (what a clear removes) and `KEYS_BY_TARGET` (how the panel infers
which parts are colored) are both derived from `buildCustomizations` itself, so
they can't drift from it. **There is no setting storing the selection** — the
written colors are the only state.

`withColor` is pure and strips this extension's keys before adding new ones,
which is what lets the panel write on every change without accumulating.

### The panel writes as you go

No apply step: every click sends `change`, which goes straight to `applyColor`.
No snapshot, no rollback; `Esc` just closes.

Two consequences that look like bugs but aren't:

- `clear` sets the webview's `selected` to `null` and `commit()` no-ops while it
  is null — otherwise toggling anything afterwards would write the cleared color
  back.
- Unticking every part sends empty `targets` and writes no keys, i.e. the same
  end state as clearing.

## Dark/light pairs

`colorCustomizations` can scope a block by theme **name**, but not by theme
_kind_, so kind-matching has to be done by the extension:

- `themePair(hex, variant)` expands one color into `{ dark, light }` via
  `counterpart()`, which keeps hue and saturation and moves lightness to the same
  relative position in the other band.
- The pair lives in `windowColor.themeColors` because only the half matching the
  current theme is ever written to `colorCustomizations` — **the other half has
  nowhere else to be recovered from.**
- `syncToActiveTheme()` repaints on theme change and once at activation (the
  theme may have changed while the window was closed). The extension activates
  `onStartupFinished` so that listener actually exists.

The **Adaptive** checkbox defaults on, decided by `isAdaptive()`:

```ts
readPair() !== undefined || currentColor(colors) === undefined;
```

A stored pair means it was on; a project with no color yet hasn't said otherwise.
Only a color written _without_ a pair is an explicit opt-out — exactly what
unticking and picking leaves behind. Both the panel and the status bar use it.

### Swatch grid

`buildSwatchGrid(hueSteps, rows, variant)` walks the wheel for columns and ramps
lightness for rows, within one band:

| Variant | Top row | Bottom row |
| ------- | ------- | ---------- |
| `dark`  | 0.44    | 0.08       |
| `light` | 0.52    | 0.92       |

Both bands **start at their most saturated row** and fade downward. Since
`counterpart` maps by position within the band, that also pairs base with base
and extreme with extreme — reversing one band silently pairs a vivid color with a
near-white one. Neither end reaches 0 or 1, so nothing comes out black or white.
Values live in `SWATCH_BANDS`; dimensions are `HUE_STEPS` / `BRIGHTNESS_ROWS` in
[src/picker.ts](src/picker.ts), and the CSS column count follows `HUE_STEPS`.

The band follows the active theme, but only a change of theme _kind_ is posted,
so swapping between two dark themes leaves a hand-picked band alone.

## Legacy per-theme blocks

A pre-release version scoped colors as `"[Theme Name]": { … }`. VS Code applies
such a block **over** the plain keys, so a leftover one silently overrides every
color picked afterwards — settings appear to change while the window doesn't.

`migrateLegacyThemeBlocks()` clears them at activation, and `withColor` on every
write. Both keep whatever the user put in a block themselves. The activation pass
is the one that matters: without it a stale block survives until the user happens
to pick a color.

## Status bar hover

Hover opens swatches, click opens the panel — because it has to. A click can only
run a command, and **the hover tooltip is the only popover an extension can
anchor to the status bar**; there is no `showHover` equivalent anywhere in the
API.

The tooltip is a `MarkdownString` with `supportHtml`:

- No scripts, so each swatch is a `command:` link carrying the hex as a
  URI-encoded JSON argument.
- `isTrusted` lists enabled commands rather than trusting the string wholesale.
- The sanitizer **does** allow `style`, so `background-color` renders — that is
  what makes real swatches possible. It cannot draw a border, which is why the
  current color is marked with a tick _inside_ the block.

Only one row fits, so `rowForColor()` picks the row nearest the applied color's
lightness. Rebuilt on theme change and on `colorCustomizations` changing.

## Packaging

`pnpm run vsix` → `window-color-<version>.vsix`, then
`code --install-extension <file>.vsix`. Reinstalling the same version needs
`--force`.

Both `vsix` and `vsix:dev` go through `scripts/package.js` rather than calling
`vsce` directly, because **`pnpm run watch` owns `dist/extension.js` and restores
it whenever anything else writes there** — including a production build, moments
before `vsce` reads it. Packaging with watch running would ship the unminified
dev bundle.

Rather than requiring the task to be stopped, the script sidesteps the file:

1. Builds to `dist/extension.pkg.js` (or `.dev.js`), which watch does not own.
2. Points `main` at it and drops `vscode:prepublish`, which would rebuild to the
   watched path.
3. Adds `dist/extension.js` to `.vscodeignore` so the watched copy stays out.
4. Restores `package.json` and `.vscodeignore` in a `finally`.

`--no-dependencies` is passed because pnpm's symlinked `node_modules` confuses
`vsce`'s dependency walk; safe here since esbuild bundles everything and there
are no runtime dependencies.

Two things this does **not** cover:

- `media/picker.js` is also watch-owned, so with watch running the packaged copy
  may be unminified. Same code, ~3 KB larger.
- `vsce publish` on its own still runs `vscode:prepublish` into the watched path.
  Publish the built file instead: `vsce publish --packagePath <file>.vsix`, which
  is what the script prints when it finishes.

### Dev build alongside the published one

`pnpm run vsix:dev` additionally rewrites the `windowColor.` prefix in both
manifest and bundle. That is not cosmetic: **VS Code throws when two extensions
register the same command id**, so a dev build keeping them fails to activate
whenever the published one is installed. Both builds still write the same
`colorCustomizations` keys, so run one at a time.

### README images

The Marketplace renders the README on its own domain and does **not** serve files
from the `.vsix`. `vsce` rewrites relative links against the `repository` field:

```
assets/preview.gif → https://github.com/n1kk/…/raw/HEAD/assets/preview.gif
```

So images must be **committed and pushed** before publishing. Never pass
`--no-rewrite-relative-links` — it ships raw relative paths that break on the
extension page. (The extension icon is unaffected; it comes from the `.vsix`.)

### Rebuilding the preview GIF

```sh
ffmpeg -i assets/preview.mov \
  -vf "fps=12,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 -y assets/preview.gif
```

## Publishing

1. Publisher at <https://marketplace.visualstudio.com/manage>.
2. Azure DevOps PAT (<https://dev.azure.com>) with **Marketplace → Manage**, for
   **All accessible organizations**.
3. Push README images first.

```sh
export VSCE_PAT=<your-token>
pnpm exec vsce publish --no-dependencies
```

`vsce publish patch` bumps the version for you; the Marketplace rejects a version
that already exists. For VSCodium and friends, publish the same `.vsix` with
[`ovsx`](https://github.com/eclipse/openvsx): `ovsx publish *.vsix -p <token>`.
