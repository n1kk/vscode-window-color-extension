import * as vscode from 'vscode';
import { mix, normalizeHex, readableForeground, withAlpha } from './colors';

const SECTION = 'workbench.colorCustomizations';

/** An independently toggleable part of the window. */
export type Target = 'titleBar' | 'activityBar' | 'sideBar' | 'statusBar' | 'editor';

export const TARGETS: readonly Target[] = [
  'titleBar',
  'activityBar',
  'sideBar',
  'statusBar',
  'editor',
];

const DEFAULT_TARGETS: readonly Target[] = ['titleBar'];

export type Customizations = Record<string, string>;

/** Derives the colors for the selected targets from one base color. */
export function buildCustomizations(hex: string, targets: readonly Target[]): Customizations {
  const bg = normalizeHex(hex) ?? '#000000';
  const fg = readableForeground(bg);
  const colors: Customizations = {};

  // Surfaces layered on top of the base get nudged toward the foreground, so the
  // window stays a single hue instead of introducing a second one.
  if (targets.includes('titleBar')) {
    Object.assign(colors, {
      'titleBar.activeBackground': bg,
      'titleBar.activeForeground': fg,
      'titleBar.inactiveBackground': mix(bg, '#7f7f7f', 0.3),
      'titleBar.inactiveForeground': withAlpha(fg, 0.6),
      'titleBar.border': mix(bg, fg, 0.2),

      // The command center is the pill in the middle showing the project name.
      'commandCenter.background': mix(bg, fg, 0.1),
      'commandCenter.foreground': fg,
      'commandCenter.border': mix(bg, fg, 0.25),
      'commandCenter.activeBackground': mix(bg, fg, 0.2),
      'commandCenter.activeForeground': fg,
      'commandCenter.activeBorder': mix(bg, fg, 0.4),
      'commandCenter.inactiveForeground': withAlpha(fg, 0.7),
      'commandCenter.inactiveBorder': mix(bg, fg, 0.15),
    });
  }

  if (targets.includes('activityBar')) {
    Object.assign(colors, {
      'activityBar.background': bg,
      'activityBar.foreground': fg,
      'activityBar.inactiveForeground': withAlpha(fg, 0.6),
      'activityBar.border': mix(bg, fg, 0.2),
      // The badge has to read against the bar, so it inverts instead of tinting.
      'activityBarBadge.background': fg,
      'activityBarBadge.foreground': bg,
    });
  }

  if (targets.includes('sideBar')) {
    Object.assign(colors, {
      'sideBar.background': bg,
      'sideBar.foreground': fg,
      'sideBar.border': mix(bg, fg, 0.2),
      'sideBarTitle.foreground': fg,
      'sideBarSectionHeader.background': mix(bg, fg, 0.08),
      'sideBarSectionHeader.foreground': fg,
      'sideBarSectionHeader.border': mix(bg, fg, 0.2),
    });
  }

  if (targets.includes('statusBar')) {
    Object.assign(colors, {
      'statusBar.background': bg,
      'statusBar.foreground': fg,
      'statusBar.border': mix(bg, fg, 0.2),
      'statusBarItem.hoverBackground': mix(bg, fg, 0.15),
      'statusBarItem.activeBackground': mix(bg, fg, 0.22),
      'statusBarItem.remoteBackground': mix(bg, fg, 0.15),
      'statusBarItem.remoteForeground': fg,
    });
  }

  if (targets.includes('editor')) {
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
  }

  return colors;
}

/**
 * The keys each target owns, derived from the builder itself so the two can
 * never drift. Any key outside this set is left untouched.
 */
const KEYS_BY_TARGET = new Map<Target, readonly string[]>(
  TARGETS.map((target) => [target, Object.keys(buildCustomizations('#000000', [target]))]),
);

const MANAGED_KEYS: readonly string[] = [...KEYS_BY_TARGET.values()].flat();

/** Reads the current workspace-level customizations, if any. */
export function readCustomizations(): Customizations {
  const inspected = vscode.workspace.getConfiguration().inspect<Customizations>(SECTION);
  return { ...(inspected?.workspaceValue ?? {}) };
}

/**
 * Current window color, as previously written by this extension. These keys hold
 * the picked color unmodified, so whichever target is enabled, one of them has it.
 */
const COLOR_SOURCE_KEYS = [
  'titleBar.activeBackground',
  'activityBar.background',
  'sideBar.background',
  'statusBar.background',
] as const;

export function currentColor(): string | undefined {
  const colors = readCustomizations();
  for (const key of COLOR_SOURCE_KEYS) {
    const value = colors[key];
    if (value) {
      return normalizeHex(value);
    }
  }
  return undefined;
}

/**
 * Which targets are currently colored, inferred from the keys present in
 * settings rather than from a separate stored list — the colors are the single
 * source of truth, so hand-edits to `settings.json` are picked up too.
 *
 * A block counts as on if any of its keys is there, so a partially hand-edited
 * block is treated as enabled and gets completed on the next apply.
 */
export function currentTargets(): Target[] {
  const colors = readCustomizations();
  const detected = TARGETS.filter((target) =>
    KEYS_BY_TARGET.get(target)?.some((key) => key in colors),
  );
  return detected.length > 0 ? detected : [...DEFAULT_TARGETS];
}

/** Narrows unknown input from the webview to valid targets. */
export function toTargets(value: unknown): Target[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return TARGETS.filter((target) => value.includes(target));
}

/**
 * Writes the derived colors into the workspace's `.vscode/settings.json`.
 * Passing `undefined` removes only the keys this extension manages.
 */
export async function applyColor(
  hex: string | undefined,
  targets: readonly Target[] = currentTargets(),
): Promise<void> {
  const merged = readCustomizations();
  for (const key of MANAGED_KEYS) {
    delete merged[key];
  }
  if (hex) {
    Object.assign(merged, buildCustomizations(hex, targets));
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

/** True when the active color theme is a dark or high-contrast one. */
export function isDarkTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
}
