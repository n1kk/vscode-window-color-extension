import * as vscode from 'vscode';
import { showPicker } from './picker';
import {
  applyColor,
  hasWorkspace,
  migrateLegacyThemeBlocks,
  syncToActiveTheme,
  warnIfNativeTitleBar,
} from './windowColor';

export function activate(context: vscode.ExtensionContext): void {
  // Clear out per-theme blocks written by an earlier version before anything
  // reads the colors — VS Code applies them over the plain keys, so a leftover
  // one overrides every color picked afterwards. No-ops when there are none.
  void migrateLegacyThemeBlocks().then(() => syncToActiveTheme());
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => void syncToActiveTheme()),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('windowColor.pick', async () => {
      if (!requireWorkspace()) {
        return;
      }
      await warnIfNativeTitleBar();
      await showPicker(context.extensionUri);
    }),

    vscode.commands.registerCommand('windowColor.clear', async () => {
      if (!requireWorkspace()) {
        return;
      }
      await applyColor(undefined);
      vscode.window.setStatusBarMessage('Window color cleared', 3000);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up: colors live in workspace settings.
}

function requireWorkspace(): boolean {
  if (hasWorkspace()) {
    return true;
  }
  vscode.window.showErrorMessage('Open a folder before setting a window color.');
  return false;
}
