# Window Color

Give every project window its own color, so you can tell them apart at a glance.

Pick a color and the window is tinted immediately — title bar, activity bar, side
bar, status bar, editor, or any combination. The choice is saved to the project's
`.vscode/settings.json`, so it follows the folder, not your editor.

![Window color demo](assets/preview.gif)

## Features

- **Live preview.** The real window recolors as you drag the picker; closing
  without applying puts it back.
- **Generated palette.** A 16-hue × 9-brightness grid, split into Dark and Light
  tabs so the whole grid is spent on the range you actually want.
- **Any hex color.** Use the swatches, the system color picker, or type a hex value.
- **Pick what gets colored.** Full window, or tick individual parts.
- **Readable by construction.** Foreground colors are chosen for WCAG contrast
  against your color, and the editor tint is muted so syntax highlighting survives.
- **Per project.** Written to workspace settings, so each folder keeps its own color.
- **Tidy.** Only the keys it wrote are touched; your own color customizations are
  left alone. **Reset** removes them.

<!-- TODO: screenshot of the picker panel -->
<!-- ![The color picker](images/picker.png) -->

## Getting started

1. Open a folder.
2. Run **Window Color: Set Window Color…** from the command palette
   (<kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).
3. Pick a color — the window updates as you go.
4. Under **Apply to**, choose **Full window** or **Parts**.
5. Click **Apply**.

**Reset** removes the color, and **Cancel** (or <kbd>Esc</kbd>) discards the preview.
There is also a **Window Color: Clear Window Color** command if you just want the
color gone without opening the picker.

## Commands

| Command                            | Description                                                     |
| ---------------------------------- | --------------------------------------------------------------- |
| `Window Color: Set Window Color…`  | Open the picker.                                                |
| `Window Color: Clear Window Color` | Remove the colors this extension wrote, without opening the picker. |

## What gets colored

| Part             | Covers                                                         |
| ---------------- | -------------------------------------------------------------- |
| **Title bar**    | Title bar and the command center pill showing the project name |
| **Activity bar** | The icon strip along the window edge                           |
| **Side bar**     | The panel body next to it — explorer, search, source control   |
| **Status bar**   | The bar along the bottom                                       |
| **Editor**       | Editor, tabs, panel and terminal                               |

The activity bar and side bar toggle independently, so you can tint the icon
strip alone and leave the explorer as your theme has it.

**Editor** is deliberately subtle: its surfaces are mixed 90% toward your theme's
own background, because a saturated editor background wrecks syntax-highlighting
contrast. Every other part uses your color at full strength.

## Extension settings

None. Everything lives in `workbench.colorCustomizations` in the project's
`.vscode/settings.json`, and the picker reads its state back from there — so
hand-edits are picked up, and deleting the block resets it.

## Requirements

- VS Code 1.90 or newer.
- `window.titleBarStyle` must be `custom` (the default). With `native`, the OS
  draws the title bar and ignores custom colors — the extension offers to switch.
- The command center pill is only visible when `window.commandCenter` is enabled.

## Known issues

- If **Editor** is the only part selected, reopening the picker shows the default
  color rather than yours. The editor colors are a muted blend, so the original
  can't be recovered from them accurately. Selecting any other part alongside it
  avoids this.
- Colors are written at the workspace level, so a folder with no `.vscode`
  directory will get one.

## Release notes

### 0.0.1

Initial release: color picker with live preview, generated Dark/Light swatch
grids, per-part selection, and reset.

---

Building from source, installing the `.vsix` locally, and publishing are covered
in `DEVELOPMENT.md` in the repository.
