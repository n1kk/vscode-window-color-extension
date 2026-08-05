/**
 * Runs inside the webview. Everything variable arrives in the JSON state block
 * the extension injects, so this file needs nothing from the page but the DOM.
 *
 * Bundled separately to `media/picker.js` — see esbuild.js.
 */
import type { SwatchVariant } from "../colors";
import type { FromWebview, PickerState, PreviewColors, ToWebview } from "../shared";

declare function acquireVsCodeApi(): { postMessage(message: FromWebview): void };

const vscode = acquireVsCodeApi();

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`picker.html is missing #${id}`);
  }
  return element as T;
}

const STATE: PickerState = JSON.parse(byId("state").textContent ?? "{}");

/** One grid per brightness band; rows run lightest to darkest, columns are hues. */
const grids = STATE.grids;

const swatches = byId("swatches");
const pairNote = byId("pairNote");
const parts = byId("parts");
const sync = byId<HTMLInputElement>("sync");

/** The chosen color. The swatches are the only way to set it, so it lives here. */
let selected = STATE.color;

// ---------------------------------------------------------------- build the DOM

swatches.style.setProperty("--hue-steps", String(STATE.hueSteps));
sync.checked = STATE.matched;

for (const { value, label } of STATE.variants) {
  const button = document.createElement("button");
  button.className = "tab";
  button.setAttribute("role", "tab");
  button.dataset.variant = value;
  button.setAttribute("aria-selected", String(value === STATE.variant));
  button.textContent = label;
  byId("tabs").appendChild(button);
}
const tabs = [...document.querySelectorAll<HTMLButtonElement>(".tab")];

for (const { value, label } of STATE.allTargets) {
  const wrapper = document.createElement("label");
  wrapper.className = "choice";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.name = "target";
  box.value = value;
  box.checked = STATE.targets.includes(value);
  wrapper.append(box, " ", label);
  parts.appendChild(wrapper);
}
const boxes = [...document.querySelectorAll<HTMLInputElement>('input[name="target"]')];

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
  radio.checked = radio.value === STATE.mode;
}

/** One mock per theme kind, cloned from the template in the page. */
const mocks: Record<SwatchVariant, HTMLElement> = (() => {
  const template = byId<HTMLTemplateElement>("mockTemplate");
  const made = {} as Record<SwatchVariant, HTMLElement>;
  for (const kind of ["dark", "light"] as const) {
    const mock = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    mock.classList.add(`on-${kind}`);
    document.querySelector(`.frame.on-${kind}`)!.appendChild(mock);
    made[kind] = mock;
  }
  return made;
})();

// ------------------------------------------------------------------- previewing

/**
 * Each property falls back in CSS when the part is not selected, so unsetting is
 * how the mock shows a part keeping its theme's own color.
 */
const PREVIEW_VARS: Record<string, string> = {
  "--tb-bg": "titleBar.activeBackground",
  "--tb-fg": "titleBar.activeForeground",
  "--cc-bg": "commandCenter.background",
  "--cc-fg": "commandCenter.foreground",
  "--cc-bd": "commandCenter.border",
  "--ab-bg": "activityBar.background",
  "--ab-fg": "activityBar.foreground",
  "--sb-bg": "sideBar.background",
  "--sb-fg": "sideBar.foreground",
  "--ed-bg": "editor.background",
};

function paintPreview(preview: PreviewColors): void {
  for (const kind of ["dark", "light"] as const) {
    const colors = preview[kind] ?? {};
    for (const [property, key] of Object.entries(PREVIEW_VARS)) {
      const value = colors[key];
      if (typeof value === "string") {
        mocks[kind].style.setProperty(property, value);
      } else {
        mocks[kind].style.removeProperty(property);
      }
    }
  }
}

/** Shows the pair when there is one; the static note beside it covers the rest. */
function showPair(pair: PickerState["pair"]): void {
  pairNote.textContent = "";
  if (!pair) {
    return;
  }
  const dark = document.createElement("b");
  dark.textContent = pair.dark;
  const light = document.createElement("b");
  light.textContent = pair.light;
  pairNote.append("Dark themes ", dark, " · Light themes ", light);
}

/**
 * The extension's own mapping of the current color, refreshed after every
 * preview. Used to move between bands when the color is not a grid swatch.
 */
let lastPair = STATE.pair;
let activeVariant: SwatchVariant = STATE.variant;

// ------------------------------------------------------------------ swatch grid

/** The swatch at the same grid position in the other band, or null if not a swatch. */
function samePosition(color: string, from: SwatchVariant, to: SwatchVariant): string | null {
  const needle = color.toLowerCase();
  for (let row = 0; row < grids[from].length; row++) {
    const column = grids[from][row].indexOf(needle);
    if (column !== -1) {
      return grids[to][row][column];
    }
  }
  return null;
}

function renderGrid(variant: SwatchVariant): void {
  activeVariant = variant;
  swatches.classList.toggle("on-dark", variant === "dark");
  swatches.replaceChildren();
  for (const row of grids[variant]) {
    for (const preset of row) {
      const button = document.createElement("button");
      button.className = "swatch";
      button.dataset.color = preset;
      button.style.background = preset;
      button.title = preset;
      button.setAttribute("aria-label", `Use ${preset}`);
      button.addEventListener("click", () => select(preset));
      swatches.appendChild(button);
    }
  }
  for (const tab of tabs) {
    tab.setAttribute("aria-selected", String(tab.dataset.variant === variant));
  }
  markSelected(current());
}

/**
 * @param carry move the selection to the equivalent swatch in the new band, so
 *   the counterpart is shown rather than the old color reinterpreted. Off when
 *   following a theme change with matching disabled, where the one chosen color
 *   is meant to stay exactly as it is.
 */
function switchVariant(next: SwatchVariant, carry: boolean): void {
  if (next === activeVariant) {
    return;
  }
  // Prefer the exact grid position, which round-trips without drift. Fall back
  // to the extension's pair, so a typed or carried-over color still moves to
  // its counterpart instead of being reread as belonging to the new band.
  const mapped = carry
    ? (samePosition(current(), activeVariant, next) ?? lastPair?.[next])
    : undefined;
  renderGrid(next);
  if (mapped) {
    select(mapped);
  } else {
    preview(current());
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => switchVariant(tab.dataset.variant as SwatchVariant, true));
}

function markSelected(color: string): void {
  const match = color.toLowerCase();
  for (const button of swatches.children) {
    button.classList.toggle("selected", (button as HTMLElement).dataset.color === match);
  }
}

// ---------------------------------------------------------------- current state

const mode = () =>
  document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value;
const matched = () => sync.checked;
const targets = () => boxes.filter((box) => box.checked).map((box) => box.value);
const current = () => selected;
const preview = (color: string) =>
  vscode.postMessage({
    type: "preview",
    color,
    targets: targets(),
    variant: activeVariant,
    matched: matched(),
  });

window.addEventListener("message", (event: MessageEvent<ToWebview>) => {
  const message = event.data;
  if (message.type === "variant") {
    switchVariant(message.variant, matched());
  } else if (message.type === "pair") {
    lastPair = message.pair;
    paintPreview(message.preview);
    showPair(message.pair);
  }
});

function select(color: string): void {
  selected = color;
  markSelected(color);
  preview(color);
}

// --------------------------------------------------------------------- controls

const applyButton = byId<HTMLButtonElement>("apply");
const cancelButton = byId<HTMLButtonElement>("cancel");
const resetButton = byId<HTMLButtonElement>("reset");

/** With nothing ticked there is nothing to write, so Apply would be a no-op. */
function syncApplyState(): void {
  applyButton.disabled = targets().length === 0;
}

/** Remembers the part selection while "Full window" overrides the boxes. */
let rememberedParts = targets();

function syncMode(): void {
  const full = mode() === "full";
  if (full) {
    rememberedParts = targets();
  }
  for (const box of boxes) {
    box.disabled = full;
    box.checked = full || rememberedParts.includes(box.value);
  }
  parts.classList.toggle("inactive", full);
  syncApplyState();
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", () => {
    syncMode();
    preview(current());
  });
}

for (const box of boxes) {
  box.addEventListener("change", () => {
    rememberedParts = targets();
    syncApplyState();
    preview(current());
  });
}

sync.addEventListener("change", () => preview(current()));

function apply(): void {
  if (!applyButton.disabled) {
    vscode.postMessage({
      type: "apply",
      color: current(),
      targets: targets(),
      variant: activeVariant,
      matched: matched(),
    });
  }
}

applyButton.addEventListener("click", apply);
cancelButton.addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
resetButton.addEventListener("click", () => vscode.postMessage({ type: "reset" }));

document.addEventListener("keydown", (event) => {
  // Buttons handle Enter themselves. Intercepting it here would fire before the
  // resulting click, so a swatch would apply the previously selected color.
  const onButton = (event.target as HTMLElement | null)?.tagName === "BUTTON";
  if (event.key === "Enter" && !onButton) {
    apply();
  } else if (event.key === "Escape") {
    vscode.postMessage({ type: "cancel" });
  }
});

syncMode();
showPair(STATE.pair);
paintPreview(STATE.preview);
// The band follows the active theme, not the current color's own band.
renderGrid(activeVariant);
// With no text field, the grid is the only input — start the keyboard there.
swatches.querySelector<HTMLButtonElement>(".swatch.selected, .swatch")?.focus();
