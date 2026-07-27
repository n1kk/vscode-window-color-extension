# Window Color

Give each project window its own color. Pick a color, and the extension tints the
title bar and the command center (the pill in the middle of the title bar showing
the project name), saving it to the project's `.vscode/settings.json`.

## Commands

| Command | Description |
| --- | --- |
| `Window Color: Set Window Color…` | Opens the picker. Colors preview live and are saved on Apply. |
| `Window Color: Clear Window Color` | Removes the colors this extension wrote. |

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
pnpm run vsix          # vsce package --no-dependencies
```

`--no-dependencies` is required because pnpm's symlinked `node_modules` confuses
`vsce`'s dependency walk. It's safe here: esbuild bundles everything into
`dist/extension.js` and there are no runtime dependencies.

## What gets written

Everything lands under `workbench.colorCustomizations` at the workspace level.
Keys not owned by this extension are preserved on write and clear.

Given a picked color `C`, `F` is whichever of white / near-black has the better
WCAG contrast against `C`. Everything else is derived, so the title bar stays a
single hue — see [buildCustomizations](src/windowColor.ts#L33):

| Key | Value |
| --- | --- |
| `titleBar.activeBackground` | `C` |
| `titleBar.activeForeground` | `F` |
| `titleBar.inactiveBackground` | `C` mixed 30% toward mid gray |
| `titleBar.inactiveForeground` | `F` at 60% alpha |
| `titleBar.border` | `C` mixed 20% toward `F` |
| `commandCenter.background` | `C` mixed 10% toward `F` |
| `commandCenter.foreground` | `F` |
| `commandCenter.border` | `C` mixed 25% toward `F` |
| `commandCenter.activeBackground` | `C` mixed 20% toward `F` |
| `commandCenter.activeForeground` | `F` |
| `commandCenter.activeBorder` | `C` mixed 40% toward `F` |
| `commandCenter.inactiveForeground` | `F` at 70% alpha |
| `commandCenter.inactiveBorder` | `C` mixed 15% toward `F` |

## Notes

- `window.titleBarStyle` must be `custom` (VS Code's default). With `native`, the
  OS draws the title bar and ignores these colors — the extension offers to switch.
- The command center is only visible when `window.commandCenter` is enabled.
