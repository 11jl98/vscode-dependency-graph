import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { getWebviewContent } from "../src/webview";

suite("Webview Test Suite", () => {
  let tempDir: string;
  let context: vscode.ExtensionContext;
  let sandbox: sinon.SinonSandbox;

  suiteSetup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-webview-test-"));
  });

  suiteTeardown(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  setup(() => {
    sandbox = sinon.createSandbox();

    context = {
      subscriptions: [],
      workspaceState: {} as any,
      globalState: {} as any,
      extensionUri: vscode.Uri.file(tempDir),
      extensionPath: tempDir,
      asAbsolutePath: (relativePath: string) =>
        path.join(tempDir, relativePath),
      storageUri: vscode.Uri.file(path.join(tempDir, "storage")),
      globalStorageUri: vscode.Uri.file(path.join(tempDir, "global-storage")),
      logUri: vscode.Uri.file(path.join(tempDir, "log")),
      extensionMode: vscode.ExtensionMode.Test,
      environmentVariableCollection: {} as any,
      secrets: {} as any,
      extension: {} as any,
      languageModelAccessInformation: {} as any,
    } as vscode.ExtensionContext;
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Should read and return HTML content from graph.html", () => {
    const mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
	<title>Dependency Graph</title>
	<script src="https://unpkg.com/cytoscape@3.21.2/dist/cytoscape.min.js"></script>
</head>
<body>
	<div id="cy"></div>
	<script>
		// Dependency graph visualization
		const cy = cytoscape({
			container: document.getElementById('cy'),
			elements: []
		});
	</script>
</body>
</html>`;

    const htmlPath = path.join(mediaDir, "graph.html");
    fs.writeFileSync(htmlPath, htmlContent);

    const result = getWebviewContent(context);

    assert.strictEqual(typeof result, "string");
    assert.ok(result.includes("<!DOCTYPE html>"));
    assert.ok(result.includes("Dependency Graph"));
    assert.ok(result.includes("cytoscape"));
  });

  test("Should preserve external script tags", () => {
    const mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
	<script src="https://unpkg.com/cytoscape@3.21.2/dist/cytoscape.min.js"></script>
	<script src="https://unpkg.com/cytoscape-dagre@2.3.2/cytoscape-dagre.js"></script>
</head>
<body>
	<div id="cy"></div>
</body>
</html>`;

    const htmlPath = path.join(mediaDir, "graph.html");
    fs.writeFileSync(htmlPath, htmlContent);

    const result = getWebviewContent(context);

    assert.ok(
      result.includes(
        'src="https://unpkg.com/cytoscape@3.21.2/dist/cytoscape.min.js"'
      )
    );
    assert.ok(
      result.includes(
        'src="https://unpkg.com/cytoscape-dagre@2.3.2/cytoscape-dagre.js"'
      )
    );
  });

  test("Should handle HTML without cytoscape scripts", () => {
    const mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
	<title>Simple Graph</title>
</head>
<body>
	<div id="content">No cytoscape here</div>
</body>
</html>`;

    const htmlPath = path.join(mediaDir, "graph.html");
    fs.writeFileSync(htmlPath, htmlContent);

    const result = getWebviewContent(context);

    assert.strictEqual(typeof result, "string");
    assert.ok(result.includes("Simple Graph"));
    assert.ok(result.includes("No cytoscape here"));
  });

  test("Should handle empty HTML file", () => {
    const mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });

    const htmlPath = path.join(mediaDir, "graph.html");
    fs.writeFileSync(htmlPath, "");

    const result = getWebviewContent(context);

    assert.strictEqual(result, "");
  });

  test("Should handle complex HTML with multiple script tags", () => {
    const mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
	<title>Complex Graph</title>
	<script src="https://unpkg.com/cytoscape@3.21.2/dist/cytoscape.min.js"></script>
	<script src="https://unpkg.com/cytoscape-dagre@2.3.2/cytoscape-dagre.js"></script>
	<script src="https://unpkg.com/cytoscape-cola@2.4.0/cytoscape-cola.js"></script>
	<script>
		console.log('Local script');
	</script>
</head>
<body>
	<div id="cy" style="width: 100%; height: 100%;"></div>
	<script>
		// Initialize cytoscape
		const cy = cytoscape({
			container: document.getElementById('cy'),
			elements: [],
			style: [{
				selector: 'node',
				style: {
					'background-color': '#666',
					'label': 'data(id)'
				}
			}],
			layout: {
				name: 'dagre'
			}
		});
	</script>
</body>
</html>`;

    const htmlPath = path.join(mediaDir, "graph.html");
    fs.writeFileSync(htmlPath, htmlContent);

    const result = getWebviewContent(context);

    assert.ok(
      result.includes(
        'src="https://unpkg.com/cytoscape@3.21.2/dist/cytoscape.min.js"'
      )
    );
    assert.ok(
      result.includes(
        'src="https://unpkg.com/cytoscape-dagre@2.3.2/cytoscape-dagre.js"'
      )
    );
    assert.ok(
      result.includes(
        'src="https://unpkg.com/cytoscape-cola@2.4.0/cytoscape-cola.js"'
      )
    );

    assert.ok(result.includes("console.log('Local script')"));
    assert.ok(result.includes("cytoscape({"));
  });

  test("Should handle missing graph.html file gracefully", () => {
    assert.throws(() => {
      getWebviewContent(context);
    }, /ENOENT/);
  });

  test("Should handle missing media directory gracefully", () => {
    assert.throws(() => {
      getWebviewContent(context);
    }, /ENOENT/);
  });

  test("Should handle malformed HTML", () => {
    const mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
	<title>Malformed</title>
	<script src="https://unpkg.com/cytoscape@3.21.2/dist/cytoscape.min.js"
</head>
<body>
	<div id="cy"
	<script>
		// Unclosed script
		const cy = cytoscape({
		});
</body>`;

    const htmlPath = path.join(mediaDir, "graph.html");
    fs.writeFileSync(htmlPath, htmlContent);

    const result = getWebviewContent(context);

    assert.strictEqual(typeof result, "string");
    assert.ok(result.includes("Malformed"));
    assert.ok(result.includes("cytoscape"));
  });

  test("Should preserve original content when no cytoscape scripts are found", () => {
    const mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
	<title>No Cytoscape</title>
	<script src="https://example.com/other-library.js"></script>
</head>
<body>
	<div id="content">Regular content</div>
	<script>
		console.log('Regular script');
	</script>
</body>
</html>`;

    const htmlPath = path.join(mediaDir, "graph.html");
    fs.writeFileSync(htmlPath, htmlContent);

    const result = getWebviewContent(context);

    assert.strictEqual(result, htmlContent);
  });
});
