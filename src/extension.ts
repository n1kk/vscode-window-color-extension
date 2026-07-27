import * as vscode from 'vscode';
import { showPicker } from './picker';
import { applyColor, hasWorkspace, warnIfNativeTitleBar } from './windowColor';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('windowColor.pick', async () => {
      if (!requireWorkspace()) {
        return;
      }
      await warnIfNativeTitleBar();
      showPicker();
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
