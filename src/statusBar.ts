import * as vscode from "vscode";
import { buildSwatchGrid, readableForeground, rowForColor, themePair } from "./colors";
import { BRIGHTNESS_ROWS, defaultVariant, HUE_STEPS } from "./picker";
import {
  applyColor,
  colorForActiveTheme,
  currentColor,
  currentTargets,
  hasWorkspace,
  readCustomizations,
  readPair,
} from "./windowColor";

/**
 * A status bar button: hover for a strip of swatches, click for the full picker.
 *
 * The hover is the only popover an extension can anchor to the status bar, and
 * it cannot be opened by clicking — `StatusBarItem` has no API for that, and a
 * click can only run a command. So the two gestures do different jobs.
 */
export function registerStatusBar(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(
    "windowColor.swatches",
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.name = "Window Color";
  item.text = "$(symbol-color)";
  item.command = "windowColor.pick";
  item.show();

  const refresh = () => {
    item.tooltip = swatchTooltip();
  };
  refresh();

  context.subscriptions.push(
    item,
    // The band follows the theme, and both the row and the highlight follow the
    // applied color — so rebuild whenever either changes.
    vscode.window.onDidChangeActiveColorTheme(refresh),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("workbench.colorCustomizations")) {
        refresh();
      }
    }),
    vscode.commands.registerCommand("windowColor.setColor", async (hex: unknown) => {
      if (typeof hex === "string") {
        await commit(hex);
      }
    }),
  );
}

/**
 * The hues to offer. Only one row of the grid fits in a hover, so it is the one
 * closest to the brightness already in use — switching hue is a quick change,
 * switching brightness is a trip to the picker.
 */
function paletteRow(applied: string | undefined): string[] {
  const variant = defaultVariant();
  const grid = buildSwatchGrid(HUE_STEPS, BRIGHTNESS_ROWS, variant);
  return grid[applied ? rowForColor(applied, variant, BRIGHTNESS_ROWS) : 0];
}

/**
 * Applies a picked color the same way the picker does: the parts already being
 * colored stay the parts being colored, and a stored pair keeps pairing.
 */
async function commit(hex: string): Promise<void> {
  if (!hasWorkspace()) {
    vscode.window.showErrorMessage("Open a folder before setting a window color.");
    return;
  }
  const colors = readCustomizations();
  const pair = readPair() ? themePair(hex, defaultVariant()) : undefined;
  const visible = pair ? colorForActiveTheme(pair) : hex;
  await applyColor(visible, currentTargets(colors), pair);
}

/**
 * A hover panel of real swatches. Each is a `command:` link, since a Markdown
 * tooltip cannot carry scripts. The colored block relies on the `style`
 * attribute, which VS Code's sanitiser does allow through.
 */
function swatchTooltip(): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.supportHtml = true;
  tooltip.supportThemeIcons = true;
  // Scoped to these two rather than trusting the string wholesale, which would
  // let any command in the tooltip's markdown be run.
  tooltip.isTrusted = {
    enabledCommands: ["windowColor.setColor", "windowColor.clear", "windowColor.pick"],
  };

  const applied = currentColor(readCustomizations());
  const swatches = paletteRow(applied)
    .map((color) => {
      const current = color === applied;
      // The tick has to sit inside the block: a Markdown tooltip has no way to
      // draw a border or outline around one.
      const label = current
        ? `<span style="color:${readableForeground(color)};">&nbsp;✓&nbsp;</span>`
        : "&nbsp;&nbsp;&nbsp;";
      const block = `<span style="background-color:${color};">${label}</span>`;
      const argument = encodeURIComponent(JSON.stringify(color));
      const title = current ? `${color} (current)` : color;
      return `[${block}](command:windowColor.setColor?${argument} "${title}")`;
    })
    // Non-breaking, so the gap survives markdown's whitespace collapsing.
    .join("&nbsp;");

  // No background: the block reads as "none", which is what clearing leaves.
  const clear =
    `[<span title="No color">&nbsp;✕&nbsp;</span>](command:windowColor.clear "Clear window color")`;

  tooltip.appendMarkdown(`**Window color**\n\n${swatches}&nbsp;&nbsp;${clear}\n\n`);
  tooltip.appendMarkdown("[$(paintcan) All colors and options…](command:windowColor.pick)");
  return tooltip;
}
