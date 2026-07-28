import * as vscode from 'vscode';
import { mix, normalizeHex, readableForeground, withAlpha } from './colors';

const SECTION = 'workbench.colorCustomizations';
const SCOPE_SETTING = 'windowColor.scope';

/** How much of the window the picked color covers. */
export type Scope = 'titleBar' | 'chrome' | 'everything';

export const SCOPES: readonly Scope[] = ['titleBar', 'chrome', 'everything'];

/** Keys owned per scope. A scope also owns every key of the scopes before it. */
const TITLE_BAR_KEYS = [
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

const CHROME_KEYS = [
  'activityBar.background',
  'activityBar.foreground',
  'activityBar.inactiveForeground',
  'activityBar.border',
  'activityBarBadge.background',
  'activityBarBadge.foreground',
  'sideBar.background',
  'sideBar.foreground',
  'sideBar.border',
  'sideBarTitle.foreground',
  'sideBarSectionHeader.background',
  'sideBarSectionHeader.foreground',
  'sideBarSectionHeader.border',
  'statusBar.background',
  'statusBar.foreground',
  'statusBar.border',
  'statusBarItem.hoverBackground',
  'statusBarItem.activeBackground',
  'statusBarItem.remoteBackground',
  'statusBarItem.remoteForeground',
] as const;

const EVERYTHING_KEYS = [
  'editor.background',
  'editorGroupHeader.tabsBackground',
  'editorGroupHeader.tabsBorder',
  'tab.activeBackground',
  'tab.inactiveBackground',
  'panel.background',
  'panel.border',
  'terminal.background',
] as const;

/**
 * Everything this extension may have written, across all scopes. Used when
 * clearing or re-applying so switching to a narrower scope leaves nothing behind.
 * Any other key already in `workbench.colorCustomizations` is left untouched.
 */
const MANAGED_KEYS: readonly string[] = [...TITLE_BAR_KEYS, ...CHROME_KEYS, ...EVERYTHING_KEYS];

export type Customizations = Record<string, string>;

/** Derives every color for the given scope from one base color. */
export function buildCustomizations(hex: string, scope: Scope): Customizations {
  const bg = normalizeHex(hex) ?? '#000000';
  const fg = readableForeground(bg);

  // Surfaces layered on top of the base get nudged toward the foreground, so the
  // whole window stays a single hue instead of introducing a second one.
  const colors: Customizations = {
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

  if (scope === 'titleBar') {
    return colors;
  }

  Object.assign(colors, {
    'activityBar.background': bg,
    'activityBar.foreground': fg,
    'activityBar.inactiveForeground': withAlpha(fg, 0.6),
    'activityBar.border': mix(bg, fg, 0.2),
    // The badge has to read against the bar, so it inverts instead of tinting.
    'activityBarBadge.background': fg,
    'activityBarBadge.foreground': bg,

    'sideBar.background': bg,
    'sideBar.foreground': fg,
    'sideBar.border': mix(bg, fg, 0.2),
    'sideBarTitle.foreground': fg,
    'sideBarSectionHeader.background': mix(bg, fg, 0.08),
    'sideBarSectionHeader.foreground': fg,
    'sideBarSectionHeader.border': mix(bg, fg, 0.2),

    'statusBar.background': bg,
    'statusBar.foreground': fg,
    'statusBar.border': mix(bg, fg, 0.2),
    'statusBarItem.hoverBackground': mix(bg, fg, 0.15),
    'statusBarItem.activeBackground': mix(bg, fg, 0.22),
    'statusBarItem.remoteBackground': mix(bg, fg, 0.15),
    'statusBarItem.remoteForeground': fg,
  });

  if (scope === 'chrome') {
    return colors;
  }

  // Content areas get a heavily muted tint — a saturated editor background
  // wrecks syntax highlighting contrast. Mixing toward the theme's own
  // light/dark end keeps text legible.
  const neutral = isDarkTheme() ? '#1e1e1e' : '#ffffff';
  const surface = mix(bg, neutral, 0.9);
  const raised = mix(bg, neutral, 0.82);

  Object.assign(colors, {
    'editor.background': surface,
    'editorGroupHeader.tabsBackground': raised,
    'editorGroupHeader.tabsBorder': mix(bg, fg, 0.2),
    'tab.activeBackground': surface,
    'tab.inactiveBackground': raised,
    'panel.background': surface,
    'panel.border': mix(bg, fg, 0.2),
    'terminal.background': surface,
  });

  return colors;
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

/** The configured scope, falling back to the contributed default. */
export function currentScope(): Scope {
  const value = vscode.workspace.getConfiguration().get<string>(SCOPE_SETTING);
  return SCOPES.includes(value as Scope) ? (value as Scope) : 'titleBar';
}

/**
 * Writes the derived colors into the workspace's `.vscode/settings.json`.
 * Passing `undefined` removes only the keys this extension manages.
 */
export async function applyColor(hex: string | undefined, scope: Scope = currentScope()): Promise<void> {
  const merged = readCustomizations();
  for (const key of MANAGED_KEYS) {
    delete merged[key];
  }
  if (hex) {
    Object.assign(merged, buildCustomizations(hex, scope));
  }

  const value = Object.keys(merged).length > 0 ? merged : undefined;
  await vscode.workspace
    .getConfiguration()
    .update(SECTION, value, vscode.ConfigurationTarget.Workspace);
}

/** Persists the scope alongside the colors so reopening the picker remembers it. */
export async function saveScope(scope: Scope): Promise<void> {
  await vscode.workspace
    .getConfiguration()
    .update(SCOPE_SETTING, scope, vscode.ConfigurationTarget.Workspace);
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

function isDarkTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
}
