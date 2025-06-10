import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function getWebviewContent(context: vscode.ExtensionContext) {
  const htmlPath = path.join(context.extensionPath, 'media', 'graph.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  return html.replace(/<script src="https:\/\/unpkg.com\/cytoscape[^"]+"><\/script>/, match => {
    return match;
  });
}