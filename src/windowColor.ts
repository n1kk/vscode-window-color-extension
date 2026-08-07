import * as vscode from 'vscode';
import { mix, normalizeHex, readableForeground, ThemePair, withAlpha } from './colors';

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

/**
 * Color keys, plus any `[Theme Name]` blocks VS Code applies only under that
 * theme. This extension writes plain keys, but an earlier version wrote blocks,
 * and users upgrading from it still have them.
 */
export type Customizations = Record<string, string | Record<string, string>>;

/** Derives the colors for the selected targets from one base color. */
export function buildCustomizations(
  hex: string,
  targets: readonly Target[],
  /** Which end the editor tint mixes toward. The preview needs both, so it is
   * passed in rather than always read from the theme that happens to be active. */
  dark: boolean = isDarkTheme(),
): Customizations {
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
    const neutral = dark ? '#1e1e1e' : '#ffffff';
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

/**
 * The dark/light pair, stored because only one half of it is ever visible in
 * `workbench.colorCustomizations` — the color for the theme kind you are not
 * currently using cannot be recovered from what is written.
 */
const PAIR_SETTING = 'windowColor.themeColors';

/** Reads the stored pair, or undefined when one color is used for every theme. */
export function readPair(): ThemePair | undefined {
  const value = vscode.workspace.getConfiguration().get<unknown>(PAIR_SETTING);
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { dark, light } = value as Record<string, unknown>;
  if (typeof dark !== 'string' || typeof light !== 'string') {
    return undefined;
  }
  const [darkHex, lightHex] = [normalizeHex(dark), normalizeHex(light)];
  return darkHex && lightHex ? { dark: darkHex, light: lightHex } : undefined;
}

/**
 * Whether a new pick should claim its counterpart in the other band. On by
 * default, since one color rarely suits both theme kinds.
 *
 * A stored pair means yes, and a project with no color yet has not said
 * otherwise. Only a color written *without* a pair is an explicit opt-out —
 * which is exactly what unticking the box and picking a color leaves behind.
 */
export function isAdaptive(colors: Customizations): boolean {
  return readPair() !== undefined || currentColor(colors) === undefined;
}

async function savePair(pair: ThemePair | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration()
    .update(PAIR_SETTING, pair, vscode.ConfigurationTarget.Workspace);
}

/** Whichever half of the pair suits the theme that is active right now. */
export function colorForActiveTheme(pair: ThemePair): string {
  return isDarkTheme() ? pair.dark : pair.light;
}

/** Reads the current workspace-level customizations. */
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

export function currentColor(colors: Customizations): string | undefined {
  for (const key of COLOR_SOURCE_KEYS) {
    const value = colors[key];
    if (typeof value === 'string') {
      return normalizeHex(value);
    }
  }
  return undefined;
}

/**
 * Which targets are colored, inferred from the keys present rather than from a
 * stored list — so hand-edits to `settings.json` are picked up too.
 *
 * A block counts as on if any of its keys is there, so a partially hand-edited
 * block is treated as enabled and gets completed on the next apply.
 */
export function currentTargets(colors: Customizations): Target[] {
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
 * Returns `base` with this extension's keys replaced, leaving any other color
 * customizations alone. Pure, so the picker can compute every preview from the
 * snapshot it took when it opened and cancelling is just writing that back.
 */
export function withColor(
  base: Customizations,
  hex: string | undefined,
  targets: readonly Target[],
): Customizations {
  const colors = { ...base };
  stripManaged(colors);
  stripLegacyThemeBlocks(colors);
  if (hex) {
    Object.assign(colors, buildCustomizations(hex, targets));
  }
  return colors;
}

function stripManaged(colors: Record<string, unknown>): void {
  for (const key of MANAGED_KEYS) {
    delete colors[key];
  }
}

function isThemeBlock(key: string): boolean {
  return key.startsWith('[') && key.endsWith(']');
}

/**
 * Clears this extension's keys out of `[Theme Name]` blocks left by an earlier
 * version. VS Code applies a block *over* the plain keys whenever that theme is
 * active, so a stale one silently overrides every color picked afterwards.
 * Anything the user put in a block themselves is kept.
 */
function stripLegacyThemeBlocks(colors: Customizations): void {
  for (const [key, value] of Object.entries(colors)) {
    if (!isThemeBlock(key) || typeof value !== 'object' || value === null) {
      continue;
    }
    const block = { ...value };
    stripManaged(block);
    if (Object.keys(block).length > 0) {
      colors[key] = block;
    } else {
      delete colors[key];
    }
  }
}

/** True when a legacy block still holds any of this extension's keys. */
export function hasLegacyThemeBlocks(colors: Customizations): boolean {
  return Object.entries(colors).some(
    ([key, value]) =>
      isThemeBlock(key) &&
      typeof value === 'object' &&
      value !== null &&
      MANAGED_KEYS.some((managed) => managed in value),
  );
}

/**
 * One-time cleanup on activation. Without it the stale block keeps winning until
 * the user happens to apply a color, and cancelling the picker would restore it.
 */
export async function migrateLegacyThemeBlocks(): Promise<void> {
  if (!hasWorkspace()) {
    return;
  }
  const base = readCustomizations();
  if (!hasLegacyThemeBlocks(base)) {
    return;
  }
  const colors = { ...base };
  stripLegacyThemeBlocks(colors);
  await writeCustomizations(colors);
}

/** Writes computed colors back to the workspace's `.vscode/settings.json`. */
export async function writeCustomizations(colors: Customizations): Promise<void> {
  const value = Object.keys(colors).length > 0 ? colors : undefined;
  await vscode.workspace
    .getConfiguration()
    .update(SECTION, value, vscode.ConfigurationTarget.Workspace);
}

/**
 * Stores the pair and writes the half that matches the active theme. Passing
 * `undefined` for `pair` means one color for every theme.
 */
export async function applyColor(
  hex: string | undefined,
  targets?: readonly Target[],
  pair?: ThemePair,
): Promise<void> {
  const base = readCustomizations();
  await savePair(hex ? pair : undefined);
  await writeCustomizations(withColor(base, hex, targets ?? currentTargets(base)));
}

/**
 * Repaints for the theme that just became active. Does nothing unless a pair is
 * stored, so a single-color setup is never rewritten behind the user's back.
 */
export async function syncToActiveTheme(): Promise<void> {
  const pair = readPair();
  if (!pair || !hasWorkspace()) {
    return;
  }
  const base = readCustomizations();
  const wanted = colorForActiveTheme(pair);
  if (currentColor(base) === wanted) {
    return;
  }
  await writeCustomizations(withColor(base, wanted, currentTargets(base)));
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
