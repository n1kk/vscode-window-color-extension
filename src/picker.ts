import * as vscode from "vscode";
import {
  buildSwatchGrid,
  normalizeHex,
  SwatchVariant,
  SWATCH_VARIANTS,
  ThemePair,
  themePair,
} from "./colors";
import type {
  FromWebview,
  PickerState,
  PreviewColors,
  ToWebview,
} from "./shared";
import {
  applyColor,
  buildCustomizations,
  colorForActiveTheme,
  currentColor,
  currentTargets,
  isAdaptive,
  isDarkTheme,
  readCustomizations,
  readPair,
  Target,
  TARGETS,
  toTargets,
} from "./windowColor";

const VIEW_TYPE = "windowColor.picker";

/** Nothing tinted: every mock falls back to its own theme's stand-in colors. */
const NO_PREVIEW: PreviewColors = { dark: {}, light: {} };

/** Swatch grid dimensions: hues across, brightness rows down. */
export const HUE_STEPS = 16;
export const BRIGHTNESS_ROWS = 9;

const VARIANT_LABELS: Record<SwatchVariant, string> = {
  dark: "Dark",
  light: "Light",
};

/**
 * Typed as a full record so a new target cannot be silently missing from the UI.
 * Names only — the live preview shows what each one covers as it is ticked.
 */
const TARGET_LABELS: Record<Target, string> = {
  titleBar: "Title bar",
  activityBar: "Activity bar",
  sideBar: "Side bar",
  statusBar: "Status bar",
  editor: "Editor",
};

/**
 * The colors each theme kind would get. Derived by the same builder that writes
 * the real settings, so the mock cannot drift from the result.
 */
function previewColors(
  color: string,
  pair: ThemePair | undefined,
  targets: readonly Target[],
): PreviewColors {
  return {
    dark: buildCustomizations(pair?.dark ?? color, targets, true),
    light: buildCustomizations(pair?.light ?? color, targets, false),
  };
}

let openPanel: vscode.WebviewPanel | undefined;

/**
 * Opens the color picker. Changes are previewed live on the real title bar and
 * rolled back if the panel is closed without applying.
 */
export async function showPicker(extensionUri: vscode.Uri): Promise<void> {
  if (openPanel) {
    openPanel.reveal();
    return;
  }

  const settings = readCustomizations();
  const storedPair = readPair();
  const applied = currentColor(settings);
  const appliedTargets = currentTargets(settings);

  /**
   * The pair a picked color implies, and the half to show right now. Without
   * adaptive mode, the color is used as-is under every theme.
   */
  const resolve = (color: string, variant: SwatchVariant, adaptive: boolean) => {
    const pair = adaptive ? themePair(color, variant) : undefined;
    return { pair, visible: pair ? colorForActiveTheme(pair) : color };
  };

  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    "Window Color",
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      // The page loads its stylesheet and script from there.
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
    },
  );
  openPanel = panel;
  panel.webview.html = await renderHtml(panel.webview, extensionUri, {
    color: applied ?? null,
    targets: appliedTargets,
    variant: defaultVariant(),
    adaptive: isAdaptive(settings),
    pair: storedPair,
    preview: applied
      ? previewColors(applied, storedPair, appliedTargets)
      : NO_PREVIEW,
  });

  const post = (message: ToWebview) => panel.webview.postMessage(message);

  // Follow the theme while the panel is open: the tabs switch band, and the
  // webview echoes back a preview so the color shown is the one for the new kind.
  // Only a change of *kind* counts, so swapping between two dark themes leaves a
  // band the user picked by hand alone.
  let postedVariant = defaultVariant();
  const themeListener = vscode.window.onDidChangeActiveColorTheme(() => {
    const variant = defaultVariant();
    if (variant !== postedVariant) {
      postedVariant = variant;
      post({ type: "variant", variant });
    }
  });

  panel.webview.onDidReceiveMessage(async (message: FromWebview) => {
    switch (message.type) {
      // Written straight through: the panel has no apply step, so each change
      // is the final state. `applyColor` clears its own keys first, so repeated
      // changes replace rather than accumulate.
      case "change": {
        const color = normalizeHex(message.color);
        if (!color) {
          return;
        }
        const targets = toTargets(message.targets) ?? [];
        const { pair, visible } = resolve(
          color,
          toVariant(message.variant),
          message.adaptive,
        );
        await applyColor(visible, targets, pair);
        post({
          type: "pair",
          pair,
          preview: previewColors(visible, pair, targets),
        });
        break;
      }
      case "clear": {
        await applyColor(undefined);
        post({ type: "pair", pair: undefined, preview: NO_PREVIEW });
        vscode.window.setStatusBarMessage("Window color cleared", 3000);
        break;
      }
      case "close":
        panel.dispose();
        break;
    }
  });

  panel.onDidDispose(() => {
    openPanel = undefined;
    themeListener.dispose();
  });
}

function toVariant(value: string): SwatchVariant {
  return SWATCH_VARIANTS.includes(value as SwatchVariant)
    ? (value as SwatchVariant)
    : "dark";
}

/** Which swatch band to open on, matching the tone of the active theme. */
export function defaultVariant(): SwatchVariant {
  return isDarkTheme() ? "dark" : "light";
}

interface RenderOptions {
  color: string | null;
  targets: readonly Target[];
  variant: SwatchVariant;
  adaptive: boolean;
  pair: ThemePair | undefined;
  preview: PreviewColors;
}

function buildState({
  color,
  targets,
  variant,
  adaptive,
  pair,
  preview,
}: RenderOptions): PickerState {
  return {
    color,
    // Everything ticked is indistinguishable from "full window", so open on that.
    mode: targets.length === TARGETS.length ? "full" : "parts",
    targets,
    allTargets: TARGETS.map((value) => ({ value, label: TARGET_LABELS[value] })),
    variants: SWATCH_VARIANTS.map((value) => ({
      value,
      label: VARIANT_LABELS[value],
    })),
    variant,
    adaptive,
    pair,
    preview,
    grids: Object.fromEntries(
      SWATCH_VARIANTS.map((v) => [v, buildSwatchGrid(HUE_STEPS, BRIGHTNESS_ROWS, v)]),
    ) as Record<SwatchVariant, string[][]>,
    hueSteps: HUE_STEPS,
  };
}

/**
 * Loads the page from `media/` and fills in the four things it cannot know:
 * the nonce, the two asset URLs, and the state blob. The markup, styles and
 * behaviour all live in real files there rather than in template literals.
 */
async function renderHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  options: RenderOptions,
): Promise<string> {
  const asset = (name: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", name));
  const html = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(extensionUri, "media", "picker.html"),
  );

  const replacements: Record<string, string> = {
    nonce: createNonce(),
    cspSource: webview.cspSource,
    styleUri: asset("picker.css").toString(),
    scriptUri: asset("picker.js").toString(),
    // `<` is escaped so a value can never close the surrounding script tag.
    state: JSON.stringify(buildState(options)).replace(/</g, "\\u003c"),
  };
  return Buffer.from(html)
    .toString("utf8")
    .replace(/{{(\w+)}}/g, (whole: string, key: string) => replacements[key] ?? whole);
}

function createNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
