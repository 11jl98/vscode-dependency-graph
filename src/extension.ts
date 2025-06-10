import * as vscode from 'vscode';
import { analyzeDependencies } from './parser';
import { getWebviewContent } from './webview';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('extension.showDependencyGraph', async () => {
    const panel = vscode.window.createWebviewPanel(
      'dependencyGraph',
      'Dependency Graph',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );

    panel.webview.html = getWebviewContent(context);

    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'webviewReady') {
        const dependencies = await analyzeDependencies(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '');
        panel.webview.postMessage({ elements: dependencies });
      }
    });
  }));
}