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
