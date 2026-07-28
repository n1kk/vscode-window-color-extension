import * as vscode from 'vscode';
import { buildSwatchGrid, normalizeHex, SwatchVariant, SWATCH_VARIANTS } from './colors';
import {
  applyColor,
  currentColor,
  currentTargets,
  isDarkTheme,
  Target,
  TARGETS,
  toTargets,
} from './windowColor';

const VIEW_TYPE = 'windowColor.picker';
const DEFAULT_COLOR = '#3b6ea5';

/** Swatch grid dimensions: hues across, brightness rows down. */
const HUE_STEPS = 16;
const BRIGHTNESS_ROWS = 9;

const VARIANT_LABELS: Record<SwatchVariant, string> = {
  dark: 'Dark',
  light: 'Light',
};

/**
 * Typed as a full record so a new target cannot be silently missing from the UI.
 * Names only — the live preview shows what each one covers as it is ticked.
 */
const TARGET_LABELS: Record<Target, string> = {
  titleBar: 'Title bar',
  activityBar: 'Activity bar',
  sideBar: 'Side bar',
  statusBar: 'Status bar',
  editor: 'Editor',
};

type FromWebview =
  | { type: 'preview'; color: string; targets: unknown }
  | { type: 'apply'; color: string; targets: unknown }
  | { type: 'reset' }
  | { type: 'cancel' };

let openPanel: vscode.WebviewPanel | undefined;

/**
 * Opens the color picker. Changes are previewed live on the real title bar and
 * rolled back if the panel is closed without applying.
 */
export function showPicker(): void {
  if (openPanel) {
    openPanel.reveal();
    return;
  }

  const original = currentColor();
  const originalTargets = currentTargets();
  let committed = false;

  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'Window Color',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true },
  );
  openPanel = panel;
  panel.webview.html = renderHtml(original ?? DEFAULT_COLOR, originalTargets, defaultVariant());

  panel.webview.onDidReceiveMessage(async (message: FromWebview) => {
    switch (message.type) {
      case 'preview': {
        const color = normalizeHex(message.color);
        if (color) {
          await applyColor(color, toTargets(message.targets) ?? []);
        }
        break;
      }
      case 'apply': {
        const color = normalizeHex(message.color);
        const targets = toTargets(message.targets);
        if (!color || !targets?.length) {
          return;
        }
        committed = true;
        await applyColor(color, targets);
        panel.dispose();
        vscode.window.setStatusBarMessage(`Window color set to ${color}`, 3000);
        break;
      }
      case 'reset': {
        committed = true;
        await applyColor(undefined);
        panel.dispose();
        vscode.window.setStatusBarMessage('Window color cleared', 3000);
        break;
      }
      case 'cancel':
        panel.dispose();
        break;
    }
  });

  panel.onDidDispose(async () => {
    openPanel = undefined;
    if (!committed) {
      await applyColor(original, originalTargets);
    }
  });
}

/** Which swatch band to open on, matching the tone of the active theme. */
function defaultVariant(): SwatchVariant {
  return isDarkTheme() ? 'dark' : 'light';
}

function renderHtml(color: string, targets: readonly Target[], variant: SwatchVariant): string {
  // Everything ticked is indistinguishable from "full window", so open on that mode.
  const mode = targets.length === TARGETS.length ? 'full' : 'parts';
  const nonce = createNonce();
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Window Color</title>
<style nonce="${nonce}">
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 24px;
    max-width: 460px;
  }
  h1 { font-size: 1.2em; margin: 0 0 4px; }
  p.hint { margin: 0 0 20px; color: var(--vscode-descriptionForeground); }
  .row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  input[type="color"] {
    width: 72px; height: 44px; padding: 0;
    border: 1px solid var(--vscode-widget-border, transparent);
    border-radius: 4px; background: none; cursor: pointer;
  }
  input[type="text"] {
    flex: 1; font-family: var(--vscode-editor-font-family); font-size: 1em;
    padding: 8px 10px; border-radius: 2px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
  }
  input[type="text"]:focus, input[type="color"]:focus {
    outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px;
  }
  input[type="text"].invalid { border-color: var(--vscode-inputValidation-errorBorder); }
  .tabs {
    display: flex; gap: 2px; margin-bottom: 10px;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.35));
  }
  .tab {
    padding: 5px 12px; background: none; border: none; border-bottom: 1px solid transparent;
    margin-bottom: -1px; color: var(--vscode-descriptionForeground); cursor: pointer;
  }
  .tab:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
  .tab[aria-selected="true"] {
    color: var(--vscode-foreground);
    border-bottom-color: var(--vscode-focusBorder);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(${HUE_STEPS}, 1fr);
    gap: 3px; margin-bottom: 24px; max-width: 336px;
  }
  fieldset { border: none; margin: 0 0 24px; padding: 0; }
  legend { padding: 0 0 8px; font-weight: 600; }
  .modes { display: flex; gap: 18px; margin-bottom: 10px; }
  .parts { display: flex; flex-wrap: wrap; gap: 6px 16px; padding-left: 20px; }
  .parts.inactive { opacity: 0.4; }
  .choice { display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
  .choice input { margin: 0; cursor: pointer; accent-color: var(--vscode-focusBorder); }
  .choice input:disabled, .parts.inactive .choice { cursor: default; }
  .swatch {
    aspect-ratio: 1; padding: 0; border: none; border-radius: 2px; cursor: pointer;
  }
  .swatch:hover { transform: scale(1.25); }
  .swatch:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .swatch.selected { outline: 2px solid var(--vscode-foreground); outline-offset: 1px; }
  .actions { display: flex; gap: 8px; }
  button {
    font-family: inherit; font-size: inherit; padding: 7px 14px;
    border: none; border-radius: 2px; cursor: pointer;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  button:disabled { opacity: 0.4; cursor: default; }
  button:disabled:hover { background: var(--vscode-button-background); }
</style>
</head>
<body>
  <h1>Window color</h1>
  <p class="hint">Applied live. Saved to <code>.vscode/settings.json</code> when you click Apply.</p>

  <div class="row">
    <input type="color" id="picker" value="${color}" aria-label="Window color">
    <input type="text" id="hex" value="${color}" spellcheck="false" aria-label="Hex color value">
  </div>

  <div class="tabs" role="tablist" aria-label="Swatch brightness">
    ${SWATCH_VARIANTS.map(
      (v) => `<button class="tab" role="tab" data-variant="${v}"${
        v === variant ? ' aria-selected="true"' : ' aria-selected="false"'
      }>${VARIANT_LABELS[v]}</button>`,
    ).join('\n    ')}
  </div>

  <div class="swatches" id="swatches"></div>

  <fieldset>
    <legend>Apply to</legend>
    <div class="modes">
      <label class="choice">
        <input type="radio" name="mode" value="full"${mode === 'full' ? ' checked' : ''}>
        Full window
      </label>
      <label class="choice">
        <input type="radio" name="mode" value="parts"${mode === 'parts' ? ' checked' : ''}>
        Parts
      </label>
    </div>
    <div class="parts" id="parts">
      ${TARGETS.map(
        (value) => `<label class="choice">
        <input type="checkbox" name="target" value="${value}"${
          targets.includes(value) ? ' checked' : ''
        }${mode === 'full' ? ' disabled' : ''}>
        ${TARGET_LABELS[value]}
      </label>`,
      ).join('\n      ')}
    </div>
  </fieldset>

  <div class="actions">
    <button id="apply">Apply</button>
    <button id="reset" class="secondary" title="Remove the window color from this project">Reset</button>
    <button id="cancel" class="secondary">Cancel</button>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const picker = document.getElementById('picker');
  const hex = document.getElementById('hex');
  // One grid per brightness band; rows run lightest to darkest, columns are hues.
  const grids = ${JSON.stringify(
    Object.fromEntries(
      SWATCH_VARIANTS.map((v) => [v, buildSwatchGrid(HUE_STEPS, BRIGHTNESS_ROWS, v)]),
    ),
  )};

  const swatches = document.getElementById('swatches');
  const tabs = [...document.querySelectorAll('.tab')];

  function renderGrid(variant) {
    swatches.replaceChildren();
    for (const row of grids[variant]) {
      for (const preset of row) {
        const button = document.createElement('button');
        button.className = 'swatch';
        button.dataset.color = preset;
        button.style.background = preset;
        button.title = preset;
        button.setAttribute('aria-label', 'Use ' + preset);
        button.addEventListener('click', () => select(preset));
        swatches.appendChild(button);
      }
    }
    for (const tab of tabs) {
      tab.setAttribute('aria-selected', String(tab.dataset.variant === variant));
    }
    markSelected(current());
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => renderGrid(tab.dataset.variant));
  }

  function markSelected(color) {
    const match = color.toLowerCase();
    for (const button of swatches.children) {
      button.classList.toggle('selected', button.dataset.color === match);
    }
  }

  /** Opens on whichever band already holds the current color, else the theme's. */
  function initialVariant() {
    const match = current().toLowerCase();
    for (const [variant, grid] of Object.entries(grids)) {
      if (grid.some((row) => row.includes(match))) {
        return variant;
      }
    }
    return ${JSON.stringify(variant)};
  }

  const isValid = (value) => /^#[0-9a-f]{6}$/i.test(value.trim());
  const boxes = [...document.querySelectorAll('input[name="target"]')];
  const mode = () => document.querySelector('input[name="mode"]:checked').value;
  const targets = () => boxes.filter((box) => box.checked).map((box) => box.value);
  const current = () => (isValid(hex.value.trim()) ? hex.value.trim() : picker.value);
  const preview = (color) => vscode.postMessage({ type: 'preview', color, targets: targets() });

  function select(color) {
    picker.value = color;
    hex.value = color;
    hex.classList.remove('invalid');
    markSelected(color);
    preview(color);
  }

  picker.addEventListener('input', () => select(picker.value));

  hex.addEventListener('input', () => {
    const value = hex.value.trim();
    const valid = isValid(value);
    hex.classList.toggle('invalid', !valid);
    if (valid) {
      picker.value = value;
      markSelected(value);
      preview(value);
    }
  });

  const applyButton = document.getElementById('apply');
  const cancelButton = document.getElementById('cancel');
  const resetButton = document.getElementById('reset');

  /** With nothing ticked there is nothing to write, so Apply would be a no-op. */
  function syncApplyState() {
    applyButton.disabled = targets().length === 0;
  }

  const parts = document.getElementById('parts');
  // Remembers the part selection while "Full window" overrides the boxes.
  let rememberedParts = targets();

  function syncMode() {
    const full = mode() === 'full';
    if (full) {
      rememberedParts = targets();
    }
    for (const box of boxes) {
      box.disabled = full;
      box.checked = full || rememberedParts.includes(box.value);
    }
    parts.classList.toggle('inactive', full);
    syncApplyState();
  }

  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', () => {
      syncMode();
      preview(current());
    });
  }

  for (const box of boxes) {
    box.addEventListener('change', () => {
      rememberedParts = targets();
      syncApplyState();
      preview(current());
    });
  }

  function apply() {
    if (!applyButton.disabled) {
      vscode.postMessage({ type: 'apply', color: current(), targets: targets() });
    }
  }

  applyButton.addEventListener('click', apply);
  cancelButton.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
  resetButton.addEventListener('click', () => vscode.postMessage({ type: 'reset' }));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target !== cancelButton && event.target !== resetButton) {
      apply();
    } else if (event.key === 'Escape') {
      vscode.postMessage({ type: 'cancel' });
    }
  });

  syncMode();
  renderGrid(initialVariant());
  hex.focus();
  hex.select();
</script>
</body>
</html>`;
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
