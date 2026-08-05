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
  color: string;
  mode: "full" | "parts";
  targets: readonly Target[];
  allTargets: { value: Target; label: string }[];
  variants: { value: SwatchVariant; label: string }[];
  variant: SwatchVariant;
  matched: boolean;
  pair: ThemePair | undefined;
  preview: PreviewColors;
  grids: Record<SwatchVariant, string[][]>;
  hueSteps: number;
}

export type FromWebview =
  | {
      type: "preview";
      color: string;
      targets: unknown;
      variant: string;
      matched: boolean;
    }
  | {
      type: "apply";
      color: string;
      targets: unknown;
      variant: string;
      matched: boolean;
    }
  | { type: "reset" }
  | { type: "cancel" };

export type ToWebview =
  /** Sent back so the panel can show what each theme kind will get. */
  | { type: "pair"; pair: ThemePair | undefined; preview: PreviewColors }
  /** Sent when the active theme changes, so the tabs can follow it. */
  | { type: "variant"; variant: SwatchVariant };
