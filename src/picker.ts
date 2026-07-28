import * as vscode from 'vscode';
import { normalizeHex } from './colors';
import { applyColor, currentColor, currentScope, saveScope, Scope, SCOPES } from './windowColor';

const VIEW_TYPE = 'windowColor.picker';
const DEFAULT_COLOR = '#3b6ea5';

const SCOPE_CHOICES: readonly { value: Scope; label: string; detail: string }[] = [
  {
    value: 'titleBar',
    label: 'Title bar',
    detail: 'Title bar and the command center pill.',
  },
  {
    value: 'chrome',
    label: 'Whole window',
    detail: 'Adds the activity bar, side bar and status bar.',
  },
  {
    value: 'everything',
    label: 'Whole window, including editor',
    detail: 'Also tints the editor, tabs, panel and terminal — heavily muted to keep code readable.',
  },
];

type FromWebview =
  | { type: 'preview'; color: string; scope: string }
  | { type: 'apply'; color: string; scope: string }
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
  const originalScope = currentScope();
  let committed = false;

  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'Window Color',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true },
  );
  openPanel = panel;
  panel.webview.html = renderHtml(original ?? DEFAULT_COLOR, originalScope);

  panel.webview.onDidReceiveMessage(async (message: FromWebview) => {
    switch (message.type) {
      case 'preview': {
        const color = normalizeHex(message.color);
        if (color) {
          await applyColor(color, toScope(message.scope));
        }
        break;
      }
      case 'apply': {
        const color = normalizeHex(message.color);
        if (!color) {
          return;
        }
        const scope = toScope(message.scope);
        committed = true;
        await applyColor(color, scope);
        await saveScope(scope);
        panel.dispose();
        vscode.window.setStatusBarMessage(`Window color set to ${color}`, 3000);
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
      await applyColor(original, originalScope);
    }
  });
}

function toScope(value: string): Scope {
  return SCOPES.includes(value as Scope) ? (value as Scope) : 'titleBar';
}

function renderHtml(color: string, scope: Scope): string {
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
  .swatches { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  fieldset { border: none; margin: 0 0 24px; padding: 0; }
  legend { padding: 0 0 8px; font-weight: 600; }
  .scope { display: flex; align-items: flex-start; gap: 8px; padding: 5px 0; cursor: pointer; }
  .scope input { margin: 2px 0 0; cursor: pointer; accent-color: var(--vscode-focusBorder); }
  .scope span.detail { display: block; color: var(--vscode-descriptionForeground); font-size: 0.92em; }
  .swatch {
    width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.35));
  }
  .swatch:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
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
</style>
</head>
<body>
  <h1>Window color</h1>
  <p class="hint">Applied live. Saved to <code>.vscode/settings.json</code> when you click Apply.</p>

  <div class="row">
    <input type="color" id="picker" value="${color}" aria-label="Window color">
    <input type="text" id="hex" value="${color}" spellcheck="false" aria-label="Hex color value">
  </div>

  <div class="swatches" id="swatches"></div>

  <fieldset>
    <legend>Apply to</legend>
    ${SCOPE_CHOICES.map(
      ({ value, label, detail }) => `
    <label class="scope">
      <input type="radio" name="scope" value="${value}"${value === scope ? ' checked' : ''}>
      <span>${label}<span class="detail">${detail}</span></span>
    </label>`,
    ).join('')}
  </fieldset>

  <div class="actions">
    <button id="apply">Apply</button>
    <button id="cancel" class="secondary">Cancel</button>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const picker = document.getElementById('picker');
  const hex = document.getElementById('hex');
  const presets = ['#3b6ea5', '#42883c', '#a5573b', '#7b3ba5', '#a53b6e', '#1f6f6f', '#8a6d1f', '#3f4451'];

  const swatches = document.getElementById('swatches');
  for (const preset of presets) {
    const button = document.createElement('button');
    button.className = 'swatch';
    button.style.background = preset;
    button.title = preset;
    button.setAttribute('aria-label', 'Use ' + preset);
    button.addEventListener('click', () => select(preset));
    swatches.appendChild(button);
  }

  const isValid = (value) => /^#[0-9a-f]{6}$/i.test(value.trim());
  const scope = () => document.querySelector('input[name="scope"]:checked').value;
  const current = () => (isValid(hex.value.trim()) ? hex.value.trim() : picker.value);
  const preview = (color) => vscode.postMessage({ type: 'preview', color, scope: scope() });

  function select(color) {
    picker.value = color;
    hex.value = color;
    hex.classList.remove('invalid');
    preview(color);
  }

  picker.addEventListener('input', () => select(picker.value));

  hex.addEventListener('input', () => {
    const value = hex.value.trim();
    const valid = isValid(value);
    hex.classList.toggle('invalid', !valid);
    if (valid) {
      picker.value = value;
      preview(value);
    }
  });

  for (const radio of document.querySelectorAll('input[name="scope"]')) {
    radio.addEventListener('change', () => preview(current()));
  }

  function apply() {
    vscode.postMessage({ type: 'apply', color: current(), scope: scope() });
  }

  document.getElementById('apply').addEventListener('click', apply);
  document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target !== document.getElementById('cancel')) {
      apply();
    } else if (event.key === 'Escape') {
      vscode.postMessage({ type: 'cancel' });
    }
  });

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
