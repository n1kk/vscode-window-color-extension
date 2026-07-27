import * as vscode from 'vscode';
import { mix, normalizeHex, readableForeground, withAlpha } from './colors';

const SECTION = 'workbench.colorCustomizations';

/**
 * Every key this extension owns. Anything else already in
 * `workbench.colorCustomizations` is left untouched.
 */
const MANAGED_KEYS = [
  // Title bar.
  'titleBar.activeBackground',
  'titleBar.activeForeground',
  'titleBar.inactiveBackground',
  'titleBar.inactiveForeground',
  'titleBar.border',
  // Command center — the pill in the middle of the title bar showing the project name.
  'commandCenter.background',
  'commandCenter.foreground',
  'commandCenter.border',
  'commandCenter.activeBackground',
  'commandCenter.activeForeground',
  'commandCenter.activeBorder',
  'commandCenter.inactiveForeground',
  'commandCenter.inactiveBorder',
] as const;

export type Customizations = Record<string, string>;

/** Derives the full set of title bar + command center colors from one base color. */
export function buildCustomizations(hex: string): Customizations {
  const bg = normalizeHex(hex) ?? '#000000';
  const fg = readableForeground(bg);

  // The command center sits on top of the title bar, so it is nudged toward the
  // foreground to stay visible without introducing a second hue.
  return {
    'titleBar.activeBackground': bg,
    'titleBar.activeForeground': fg,
    'titleBar.inactiveBackground': mix(bg, '#7f7f7f', 0.3),
    'titleBar.inactiveForeground': withAlpha(fg, 0.6),
    'titleBar.border': mix(bg, fg, 0.2),

    'commandCenter.background': mix(bg, fg, 0.1),
    'commandCenter.foreground': fg,
    'commandCenter.border': mix(bg, fg, 0.25),
    'commandCenter.activeBackground': mix(bg, fg, 0.2),
    'commandCenter.activeForeground': fg,
    'commandCenter.activeBorder': mix(bg, fg, 0.4),
    'commandCenter.inactiveForeground': withAlpha(fg, 0.7),
    'commandCenter.inactiveBorder': mix(bg, fg, 0.15),
  };
}

/** Reads the current workspace-level customizations, if any. */
export function readCustomizations(): Customizations {
  const inspected = vscode.workspace.getConfiguration().inspect<Customizations>(SECTION);
  return { ...(inspected?.workspaceValue ?? {}) };
}

/** Current window color, as previously written by this extension. */
export function currentColor(): string | undefined {
  const value = readCustomizations()['titleBar.activeBackground'];
  return value ? normalizeHex(value) : undefined;
}

/**
 * Writes the derived colors into the workspace's `.vscode/settings.json`.
 * Passing `undefined` removes only the keys this extension manages.
 */
export async function applyColor(hex: string | undefined): Promise<void> {
  const merged = readCustomizations();
  for (const key of MANAGED_KEYS) {
    delete merged[key];
  }
  if (hex) {
    Object.assign(merged, buildCustomizations(hex));
  }

  const value = Object.keys(merged).length > 0 ? merged : undefined;
  await vscode.workspace
    .getConfiguration()
    .update(SECTION, value, vscode.ConfigurationTarget.Workspace);
}

/** True when a folder or `.code-workspace` is open, i.e. workspace settings can be written. */
export function hasWorkspace(): boolean {
  return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
}

/**
 * On a native title bar the custom colors are silently ignored, so offer to
 * switch. Returns without waiting on the user — this is advisory only.
 */
export async function warnIfNativeTitleBar(): Promise<void> {
  const config = vscode.workspace.getConfiguration('window');
  if (config.get<string>('titleBarStyle') !== 'native') {
    return;
  }
  const switchIt = 'Use Custom Title Bar';
  const choice = await vscode.window.showWarningMessage(
    'The title bar is set to "native", which ignores custom colors.',
    switchIt,
  );
  if (choice === switchIt) {
    await config.update('titleBarStyle', 'custom', vscode.ConfigurationTarget.Global);
  }
}
