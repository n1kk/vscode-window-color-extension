/**
 * Types crossing the extension/webview boundary. Imported with `import type` on
 * both sides, so nothing here reaches either bundle at runtime — it exists to
 * keep the two ends of `postMessage` from drifting apart.
 */
import type { SwatchVariant, ThemePair } from "./colors";
import type { Customizations, Target } from "./windowColor";

/** Both halves' colors, so the mock windows can show each side by side. */
export interface PreviewColors {
  dark: Customizations;
  light: Customizations;
}

/** Everything the page needs to render itself, serialised into the HTML. */
export interface PickerState {
  /** The applied color, or null when the project has none yet. */
  color: string | null;
  mode: "full" | "parts";
  targets: readonly Target[];
  allTargets: { value: Target; label: string }[];
  variants: { value: SwatchVariant; label: string }[];
  variant: SwatchVariant;
  adaptive: boolean;
  pair: ThemePair | undefined;
  preview: PreviewColors;
  grids: Record<SwatchVariant, string[][]>;
  hueSteps: number;
}

/**
 * The panel edits live — every change is written straight to settings, so there
 * is no apply step and nothing to roll back.
 */
export type FromWebview =
  | {
      type: "change";
      color: string;
      targets: unknown;
      variant: string;
      adaptive: boolean;
    }
  | { type: "clear" }
  | { type: "close" };

export type ToWebview =
  /** Sent back so the panel can show what each theme kind will get. */
  | { type: "pair"; pair: ThemePair | undefined; preview: PreviewColors }
  /** Sent when the active theme changes, so the tabs can follow it. */
  | { type: "variant"; variant: SwatchVariant };
