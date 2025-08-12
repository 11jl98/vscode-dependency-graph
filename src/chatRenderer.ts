import * as vscode from "vscode";
import { analyzeDependencies } from "./parser";

export const CHAT_GRAPH_VIEWTYPE = "vscode-dependency-graph.graph";
export const CHAT_GRAPH_MIME =
  "application/vnd.chat-output-renderer.dependency-graph";

type ExtendedToolResult = vscode.LanguageModelToolResult & {
  toolResultDetails2?: {
    mime: string;
    value: Uint8Array;
  };
};

export function registerChatRenderer(context: vscode.ExtensionContext) {
  try {
    if (
      !(vscode as unknown as { lm?: unknown }).lm ||
      !vscode.lm.registerTool
    ) {
      console.warn(
        "[DependencyGraph] vscode.lm API indisponível. Certifique-se de usar VS Code 1.103+ com Chat e rodar em modo dev."
      );
    } else {
      const disposable = vscode.lm.registerTool<{ workspaceRoot?: string }>(
        "dependency-graph-render",
        {
          async invoke(options, _token) {
            const root =
              options.input.workspaceRoot ||
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
              "";

            const elements = await analyzeDependencies(root);
            const payload = new TextEncoder().encode(
              JSON.stringify({ elements })
            );

            const result = new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart("Dependency graph generated"),
            ]) as ExtendedToolResult;

            result.toolResultDetails2 = {
              mime: CHAT_GRAPH_MIME,
              value: payload,
            };

            return result;
          },
        }
      );
      context.subscriptions.push(disposable);
      console.log(
        "[DependencyGraph] LM tool registrada: dependency-graph-render"
      );
      vscode.window.setStatusBarMessage(
        "Dependency Graph: ferramenta de chat registrada",
        3000
      );
    }
  } catch (err) {
    console.error("[DependencyGraph] Falha ao registrar LM tool", err);
  }

  context.subscriptions.push(
    vscode.chat.registerChatOutputRenderer(CHAT_GRAPH_VIEWTYPE, {
      async renderChatOutput({ value }, webview, _ctx, _token) {
        const decoded = new TextDecoder().decode(value);
        let data: { elements: unknown } | undefined;
        data = JSON.parse(decoded);

        const cytoscapeDist = vscode.Uri.joinPath(
          context.extensionUri,
          "node_modules",
          "cytoscape",
          "dist"
        );
        webview.options = {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "media"),
            cytoscapeDist,
          ],
        };

        const nonce = getNonce();
        const elementsJson = JSON.stringify(data?.elements ?? []);

        const cytoscapeUri = webview.asWebviewUri(
          vscode.Uri.joinPath(cytoscapeDist, "cytoscape.min.js")
        );
        webview.html = `<!DOCTYPE html>
					<html>
						<head>
							<meta charset="UTF-8">
							<meta name="viewport" content="width=device-width, initial-scale=1.0">
							<title>Dependency Graph</title>
								<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; img-src data:;" />
											<style>
									html, body { margin: 0; padding: 0; }
									body { background: var(--vscode-editor-background); color: var(--vscode-foreground); }
									#legend { font-size: 12px; margin-bottom: 8px; }
									#container { width: 100%; }
												#cy { width: 100%; height: 520px; border-radius: 6px; }
									#msg { font-size: 12px; opacity: 0.8; }
												.tooltip { position: absolute; background: rgba(13,17,23,0.95); border: 1px solid rgba(56,139,253,0.2); color: #fff; padding: 8px 10px; border-radius: 6px; font-size: 12px; pointer-events: none; display: none; z-index: 10; }
							</style>
						</head>
						<body>
								<div id="legend">🔵 baixo | 🟠 médio | 🔴 alto — clique em um nó para ver dependências/impactos</div>
								<div id="container">
									<div id="cy"></div>
									<div id="msg"></div>
												<div class="tooltip" id="tooltip"></div>
								</div>
			  <script nonce="${nonce}" src="${cytoscapeUri}"></script>
			  <script id="dg-elements" type="application/json">${elementsJson}</script>
			  <script nonce="${nonce}">
									(function(){
													const msg = document.getElementById('msg');
													const tooltip = document.getElementById('tooltip');
										try {
				  const jsonTag = document.getElementById('dg-elements');
				  const elements = JSON.parse(jsonTag.textContent || '[]');
											if (!Array.isArray(elements) || elements.length === 0) {
												msg.textContent = 'Nenhum nó/aresta para exibir. Verifique se o workspace tem tsconfig.json e classes detectáveis.';
												return;
											}

											if (typeof cytoscape === 'undefined') {
												msg.textContent = 'Falha ao carregar Cytoscape.';
												return;
											}

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
																	'width': 38, 'height': 38,
																	'text-wrap': 'wrap',
																	'text-max-width': '120px',
																	'text-outline-width': 2,
																	'text-outline-color': 'rgba(0,0,0,0.6)'
													}},
													{ selector: 'edge', style: {
														'width': 1.5,
														'line-color': 'rgba(136,136,136,0.6)',
														'target-arrow-color': 'rgba(136,136,136,0.6)',
														'target-arrow-shape': 'triangle',
														'curve-style': 'bezier'
													}}
																,{ selector: 'node.highlighted', style: {
																	'border-width': 3,
																	'border-color': '#ffffff'
																}}
																,{ selector: 'edge.highlighted', style: {
																	'line-color': '#ffffff',
																	'target-arrow-color': '#ffffff',
																	'width': 2.5,
																	'opacity': 1
																}}
																,{ selector: 'node.dependency', style: {
																	'border-width': 3,
																	'border-color': '#00ff88'
																}}
																,{ selector: 'node.dependent', style: {
																	'border-width': 3,
																	'border-color': '#ff4757'
																}}
																,{ selector: 'edge.dependency-edge', style: {
																	'line-color': '#00ff88',
																	'target-arrow-color': '#00ff88',
																	'width': 2.5
																}}
																,{ selector: 'edge.dependent-edge', style: {
																	'line-color': '#ff4757',
																	'target-arrow-color': '#ff4757',
																	'width': 2.5
																}}
												],
															layout: { name: 'cose', idealEdgeLength: 120, padding: 20, animate: true, animationDuration: 600 }
											});
																cy.one('layoutstop', () => {
																	msg.textContent = 'Nós: ' + cy.nodes().length + ' | Arestas: ' + cy.edges().length;
																});

														// Clique em nó: destacar dependências e dependentes
														cy.on('tap', 'node', evt => {
															const node = evt.target;
															cy.elements().removeClass('highlighted dependency dependent dependency-edge dependent-edge');
															node.addClass('highlighted');

															const dependencies = cy.edges().filter(e => e.data('source') === node.id()).map(e => e.target());
															const dependents = cy.edges().filter(e => e.data('target') === node.id()).map(e => e.source());

															dependencies.forEach(dep => {
																dep.addClass('highlighted dependency');
																dep.connectedEdges().forEach(e => {
																	if (e.source().id() === node.id() && e.target().id() === dep.id()) {
																		e.addClass('highlighted dependency-edge');
																	}
																});
															});

															dependents.forEach(dep => {
																dep.addClass('highlighted dependent');
																dep.connectedEdges().forEach(e => {
																	if (e.source().id() === dep.id() && e.target().id() === node.id()) {
																		e.addClass('highlighted dependent-edge');
																	}
																});
															});
														});

														// Tooltip em hover
														cy.on('mouseover', 'node', evt => {
															const n = evt.target; const d = n.data();
															tooltip.innerHTML = '🔗 <strong>' + d.id + '</strong><br>In: ' + (d.in||0) + '<br>Out: ' + (d.out||0);
															tooltip.style.display = 'block';
														});
														cy.on('mouseout', 'node', () => { tooltip.style.display = 'none'; });
														cy.on('mousemove', evt => {
															const m = evt.originalEvent;
															if (!m) return;
															tooltip.style.left = (m.pageX + 10) + 'px';
															tooltip.style.top = (m.pageY + 10) + 'px';
														});

														// Limpar seleção ao clicar fora
														cy.on('tap', evt => { if (evt.target === cy) { cy.elements().removeClass('highlighted dependency dependent dependency-edge dependent-edge'); } });

														// Zoom/pan e atalhos
														cy.userZoomingEnabled(true);
														cy.userPanningEnabled(true);
														document.addEventListener('keydown', evt => {
															if (evt.key === 'Escape') {
																cy.elements().removeClass('highlighted dependency dependent dependency-edge dependent-edge');
															} else if (evt.key === '+' || evt.key === '=') {
																cy.zoom(cy.zoom() * 1.15); cy.center();
															} else if (evt.key === '-') {
																cy.zoom(cy.zoom() * 0.85); cy.center();
															} else if (evt.key === 'r' || evt.key === 'R') {
																cy.fit();
																setTimeout(() => { cy.zoom(1); cy.center(); }, 50);
															}
														});
										} catch (e) {
											msg.textContent = 'Erro ao renderizar grafo: ' + (e && e.message ? e.message : e);
										}
									})();
							</script>
						</body>
					</html>`;
      },
      mimeTypes: [CHAT_GRAPH_MIME],
    })
  );
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeForScriptBlock(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/<\/(script)>/gi, "<\\/$1>");
}
