import * as vscode from 'vscode';
import { analyzeDependencies } from './parser';

// Mime type e viewType para o renderer no chat
export const CHAT_GRAPH_VIEWTYPE = 'vscode-dependency-graph.graph';
export const CHAT_GRAPH_MIME = 'application/vnd.chat-output-renderer.dependency-graph';

// Tool result cast para proposta
type ExtendedToolResult = vscode.LanguageModelToolResult & {
	toolResultDetails2?: {
		mime: string;
		value: Uint8Array;
	}
};

export function registerChatRenderer(context: vscode.ExtensionContext) {
	// Ferramenta LM: gera os dados do grafo e retorna como binary com nosso mime
	try {
		if (!(vscode as unknown as { lm?: unknown }).lm || !vscode.lm.registerTool) {
			console.warn('[DependencyGraph] vscode.lm API indisponível. Certifique-se de usar VS Code 1.103+ com Chat e rodar em modo dev.');
		} else {
			const disposable = vscode.lm.registerTool<{ workspaceRoot?: string }>('dependency-graph-render', {
				async invoke(options, _token) {
				const root = options.input.workspaceRoot
					|| vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
					|| '';

				const elements = await analyzeDependencies(root);
				const payload = new TextEncoder().encode(JSON.stringify({ elements }));

				const result = new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart('Dependency graph generated')
				]) as ExtendedToolResult;

				result.toolResultDetails2 = {
					mime: CHAT_GRAPH_MIME,
					value: payload,
				};

				return result;
				}
			});
			context.subscriptions.push(disposable);
			console.log('[DependencyGraph] LM tool registrada: dependency-graph-render');
			vscode.window.setStatusBarMessage('Dependency Graph: ferramenta de chat registrada', 3000);
		}
	} catch (err) {
		console.error('[DependencyGraph] Falha ao registrar LM tool', err);
	}

	// Renderer: recebe o payload e mostra um webview com o Cytoscape
		context.subscriptions.push(
			vscode.chat.registerChatOutputRenderer(CHAT_GRAPH_VIEWTYPE, {
				async renderChatOutput({ value }, webview, _ctx, _token) {
				// value = Uint8Array
				const decoded = new TextDecoder().decode(value);
				let data: { elements: unknown } | undefined;
				try {
					data = JSON.parse(decoded);
				} catch {
					// no-op; mostra erro simples
				}

						// Permitir scripts; Cytoscape local em node_modules
						const cytoscapeDist = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'cytoscape', 'dist');
						webview.options = {
							enableScripts: true,
							localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media'), cytoscapeDist]
						};

				const nonce = getNonce();
				const elementsJson = escapeForScriptBlock(JSON.stringify(data?.elements ?? []));

			  const cytoscapeUri = webview.asWebviewUri(vscode.Uri.joinPath(cytoscapeDist, 'cytoscape.min.js'));
			  webview.html = `<!DOCTYPE html>
					<html>
						<head>
							<meta charset="UTF-8">
							<meta name="viewport" content="width=device-width, initial-scale=1.0">
							<title>Dependency Graph</title>
				  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; img-src data:; connect-src 'none';" />
							<style>
								html, body, #cy { height: 360px; margin: 0; }
								body { background: transparent; }
								#legend { font-size: 12px; color: var(--vscode-foreground); margin-bottom: 8px; }
							</style>
						</head>
						<body>
							<div id="legend">
								🔵 baixo | 🟠 médio | 🔴 alto acoplamento — clique em um nó p/ ver dependências/impactos
							</div>
							<div id="cy"></div>
				  <script nonce="${nonce}" src="${cytoscapeUri}"></script>
							<script nonce="${nonce}">
								const elements = ${elementsJson};
								const cy = cytoscape({
									container: document.getElementById('cy'),
									elements,
									style: [
										{ selector: 'node', style: {
											'background-color': ele => {
												const score = (ele.data('in')||0) + (ele.data('out')||0);
												if (score >= 6) return '#ff6b6b';
												if (score >= 3) return '#ffa726';
												return '#58a6ff';
											},
											'label': ele => ele.data('id'),
											'color': '#fff',
											'text-valign': 'center',
											'text-halign': 'center',
											'font-size': 12,
											'width': 32, 'height': 32
										}},
										{ selector: 'edge', style: {
											'width': 1.5,
											'line-color': 'rgba(136,136,136,0.6)',
											'target-arrow-color': 'rgba(136,136,136,0.6)',
											'target-arrow-shape': 'triangle',
											'curve-style': 'bezier'
										}}
									],
									layout: { name: 'cose', idealEdgeLength: 80, padding: 10, animate: true, animationDuration: 600 }
								});

								cy.on('tap', 'node', evt => {
									const node = evt.target;
									cy.elements().removeClass('highlighted');
									node.addClass('highlighted');
								});
							</script>
						</body>
					</html>`;
			},
			mimeTypes: [CHAT_GRAPH_MIME]
		})
	);
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
	return text;
}

function escapeForScriptBlock(str: string): string {
	return str
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/<\/(script)>/gi, '<\\/$1>');
}

