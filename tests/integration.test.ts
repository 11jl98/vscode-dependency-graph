import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { activate } from "../src/extension";
import { analyzeDependencies } from "../src/parser";
import { getWebviewContent } from "../src/webview";

suite("Integration Test Suite", () => {
  let tempDir: string;
  let context: vscode.ExtensionContext;
  let sandbox: sinon.SinonSandbox;

  suiteSetup(async () => {
    vscode.window.showInformationMessage("Starting Integration tests.");
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "vscode-integration-test-")
    );
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
    context.subscriptions.forEach((subscription) => {
      if (subscription && typeof subscription.dispose === "function") {
        subscription.dispose();
      }
    });
    context.subscriptions.length = 0;
  });

  test("Full extension workflow with real TypeScript project", async () => {
    const projectDir = path.join(tempDir, "test-project");
    fs.mkdirSync(projectDir, { recursive: true });

    const tsConfigPath = path.join(projectDir, "tsconfig.json");
    fs.writeFileSync(
      tsConfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            module: "commonjs",
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            strict: true,
          },
          include: ["src/**/*"],
        },
        null,
        2
      )
    );

    const srcDir = path.join(projectDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    const interfacesFile = path.join(srcDir, "interfaces.ts");
    fs.writeFileSync(
      interfacesFile,
      `
export interface ILogger {
	log(message: string): void;
}

export interface IDatabase {
	connect(): Promise<void>;
	query(sql: string): Promise<any>;
}

export interface IEmailService {
	sendEmail(to: string, subject: string, body: string): Promise<void>;
}
		`
    );

    const servicesFile = path.join(srcDir, "services.ts");
    fs.writeFileSync(
      servicesFile,
      `
import { ILogger, IDatabase, IEmailService } from './interfaces';

export class ConsoleLogger implements ILogger {
	log(message: string): void {
		console.log(message);
	}
}

export class PostgreSQLDatabase implements IDatabase {
	async connect(): Promise<void> {
		// Connect to PostgreSQL
	}
	
	async query(sql: string): Promise<any> {
		// Execute query
	}
}

export class SMTPEmailService implements IEmailService {
	async sendEmail(to: string, subject: string, body: string): Promise<void> {
		// Send email via SMTP
	}
}
		`
    );

    const businessFile = path.join(srcDir, "business.ts");
    fs.writeFileSync(
      businessFile,
      `
import { ILogger, IDatabase, IEmailService } from './interfaces';
import { ConsoleLogger, PostgreSQLDatabase, SMTPEmailService } from './services';

export class UserService {
	constructor(
		private logger: ILogger,
		private database: IDatabase
	) {}
	
	async createUser(userData: any): Promise<void> {
		this.logger.log('Creating user');
		await this.database.query('INSERT INTO users...');
	}
}

export class NotificationService {
	constructor(
		private logger: ILogger,
		private emailService: IEmailService
	) {}
	
	async sendWelcomeEmail(userEmail: string): Promise<void> {
		this.logger.log('Sending welcome email');
		await this.emailService.sendEmail(userEmail, 'Welcome!', 'Welcome to our app');
	}
}

export class ApplicationController {
	constructor(
		private userService: UserService,
		private notificationService: NotificationService,
		private logger: ILogger
	) {}
	
	async registerUser(userData: any): Promise<void> {
		this.logger.log('Starting user registration');
		await this.userService.createUser(userData);
		await this.notificationService.sendWelcomeEmail(userData.email);
		this.logger.log('User registration completed');
	}
}
		`
    );

    // Create main application file
    const mainFile = path.join(srcDir, "main.ts");
    fs.writeFileSync(
      mainFile,
      `
import { ApplicationController, UserService, NotificationService } from './business';
import { ConsoleLogger, PostgreSQLDatabase, SMTPEmailService } from './services';

export class Application {
	private controller: ApplicationController;
	
	constructor() {
		// Manual dependency injection
		const logger = new ConsoleLogger();
		const database = new PostgreSQLDatabase();
		const emailService = new SMTPEmailService();
		
		const userService = new UserService(logger, database);
		const notificationService = new NotificationService(logger, emailService);
		
		this.controller = new ApplicationController(userService, notificationService, logger);
	}
	
	async start(): Promise<void> {
		await this.controller.registerUser({
			name: 'John Doe',
			email: 'john@example.com'
		});
	}
}
		`
    );

    // Create media directory and HTML file for webview
    const mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });

    const htmlFile = path.join(mediaDir, "graph.html");
    fs.writeFileSync(
      htmlFile,
      `
<!DOCTYPE html>
<html>
<head>
	<title>Dependency Graph</title>
	<script src="https://unpkg.com/cytoscape@3.21.2/dist/cytoscape.min.js"></script>
	<script src="https://unpkg.com/cytoscape-dagre@2.3.2/cytoscape-dagre.js"></script>
</head>
<body>
	<div id="cy" style="width: 100%; height: 100vh;"></div>
	<script>
		const vscode = acquireVsCodeApi();
		
		let cy;
		
		window.addEventListener('message', event => {
			const message = event.data;
			if (message.elements) {
				initializeGraph(message.elements);
			}
		});
		
		function initializeGraph(elements) {
			cy = cytoscape({
				container: document.getElementById('cy'),
				elements: elements,
				style: [
					{
						selector: 'node',
						style: {
							'background-color': '#666',
							'label': 'data(id)',
							'width': 'mapData(in, 0, 5, 20, 50)',
							'height': 'mapData(out, 0, 5, 20, 50)',
							'color': '#fff',
							'text-outline-width': 2,
							'text-outline-color': '#666'
						}
					},
					{
						selector: 'edge',
						style: {
							'width': 3,
							'line-color': '#ccc',
							'target-arrow-color': '#ccc',
							'target-arrow-shape': 'triangle',
							'curve-style': 'bezier'
						}
					}
				],
				layout: {
					name: 'dagre',
					directed: true,
					padding: 10
				}
			});
		}
		
		// Signal webview is ready
		vscode.postMessage({ command: 'webviewReady' });
	</script>
</body>
</html>
		`
    );

    const dependencies = await analyzeDependencies(projectDir);

    assert.ok(Array.isArray(dependencies));
    assert.ok(dependencies.length > 0);

    const nodes = dependencies.filter((item) => "id" in item.data);
    const edges = dependencies.filter((item) => "source" in item.data);

    assert.ok(nodes.length >= 5);
    assert.ok(edges.length >= 3);

    const webviewContent = getWebviewContent(context);
    assert.ok(typeof webviewContent === "string");
    assert.ok(webviewContent.includes("cytoscape"));
    assert.ok(webviewContent.includes("webviewReady"));

    const createWebviewPanelStub = sandbox.stub(
      vscode.window,
      "createWebviewPanel"
    );
    const mockPanel = {
      webview: {
        html: "",
        onDidReceiveMessage: sandbox.stub(),
        postMessage: sandbox.stub(),
      },
    };
    createWebviewPanelStub.returns(mockPanel as any);

    sandbox.stub(vscode.workspace, "workspaceFolders").value([
      {
        uri: vscode.Uri.file(projectDir),
        name: "test-project",
        index: 0,
      },
    ]);

    activate(context);

    const registerCommandStub = sandbox.stub(
      vscode.commands,
      "registerCommand"
    );
    activate(context);

    assert.ok(registerCommandStub.calledOnce);

    const commandCallback = registerCommandStub.firstCall.args[1];
    await commandCallback();

    assert.ok(createWebviewPanelStub.calledOnce);
    assert.strictEqual(
      createWebviewPanelStub.firstCall.args[0],
      "dependencyGraph"
    );
    assert.strictEqual(
      createWebviewPanelStub.firstCall.args[1],
      "Dependency Graph"
    );

    assert.ok(mockPanel.webview.onDidReceiveMessage.calledOnce);

    const messageHandler =
      mockPanel.webview.onDidReceiveMessage.firstCall.args[0];
    await messageHandler({ command: "webviewReady" });

    assert.ok(mockPanel.webview.postMessage.calledOnce);
    const sentMessage = mockPanel.webview.postMessage.firstCall.args[0];
    assert.ok("elements" in sentMessage);
    assert.ok(Array.isArray(sentMessage.elements));
    assert.ok(sentMessage.elements.length > 0);
  });

  test("Extension handles empty workspace gracefully", async () => {
    sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);

    const createWebviewPanelStub = sandbox.stub(
      vscode.window,
      "createWebviewPanel"
    );
    const mockPanel = {
      webview: {
        html: "",
        onDidReceiveMessage: sandbox.stub(),
        postMessage: sandbox.stub(),
      },
    };
    createWebviewPanelStub.returns(mockPanel as any);

    activate(context);

    const registerCommandStub = sandbox.stub(
      vscode.commands,
      "registerCommand"
    );
    activate(context);

    const commandCallback = registerCommandStub.firstCall.args[1];

    assert.doesNotThrow(async () => {
      await commandCallback();
    });
  });

  test("Extension handles project without TypeScript files", async () => {
    const emptyProjectDir = path.join(tempDir, "empty-project");
    fs.mkdirSync(emptyProjectDir, { recursive: true });

    const tsConfigPath = path.join(emptyProjectDir, "tsconfig.json");
    fs.writeFileSync(
      tsConfigPath,
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
        },
      })
    );

    sandbox.stub(vscode.workspace, "workspaceFolders").value([
      {
        uri: vscode.Uri.file(emptyProjectDir),
        name: "empty-project",
        index: 0,
      },
    ]);

    const createWebviewPanelStub = sandbox.stub(
      vscode.window,
      "createWebviewPanel"
    );
    const mockPanel = {
      webview: {
        html: "",
        onDidReceiveMessage: sandbox.stub(),
        postMessage: sandbox.stub(),
      },
    };
    createWebviewPanelStub.returns(mockPanel as any);

    activate(context);

    const registerCommandStub = sandbox.stub(
      vscode.commands,
      "registerCommand"
    );
    activate(context);

    const commandCallback = registerCommandStub.firstCall.args[1];
    await commandCallback();

    const messageHandler =
      mockPanel.webview.onDidReceiveMessage.firstCall.args[0];
    await messageHandler({ command: "webviewReady" });

    assert.ok(mockPanel.webview.postMessage.calledOnce);
    const sentMessage = mockPanel.webview.postMessage.firstCall.args[0];
    assert.ok("elements" in sentMessage);
    assert.ok(Array.isArray(sentMessage.elements));
    assert.strictEqual(sentMessage.elements.length, 0);
  });

  test("Extension performance with large project", async () => {
    const largeProjectDir = path.join(tempDir, "large-project");
    fs.mkdirSync(largeProjectDir, { recursive: true });

    const srcDir = path.join(largeProjectDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    const tsConfigPath = path.join(largeProjectDir, "tsconfig.json");
    fs.writeFileSync(
      tsConfigPath,
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
        include: ["src/**/*"],
      })
    );

    for (let i = 0; i < 20; i++) {
      const serviceFile = path.join(srcDir, `Service${i}.ts`);
      const dependencies = i > 0 ? [`Service${i - 1}`] : [];
      const dependencyImports = dependencies
        .map((dep) => `import { ${dep} } from './${dep}';`)
        .join("\n");
      const dependencyParams = dependencies
        .map((dep) => `private ${dep.toLowerCase()}: ${dep}`)
        .join(", ");

      fs.writeFileSync(
        serviceFile,
        `
${dependencyImports}

export class Service${i} {
	constructor(${dependencyParams}) {}
	
	execute(): void {
		console.log('Service${i} executing');
		${dependencies
      .map((dep) => `this.${dep.toLowerCase()}.execute();`)
      .join("\n\t\t")}
	}
}
			`
      );
    }

    const startTime = Date.now();
    const dependencies = await analyzeDependencies(largeProjectDir);
    const endTime = Date.now();

    const executionTime = endTime - startTime;
    assert.ok(
      executionTime < 5000,
      `Analysis took too long: ${executionTime}ms`
    );

    const nodes = dependencies.filter((item) => "id" in item.data);
    const edges = dependencies.filter((item) => "source" in item.data);

    assert.strictEqual(nodes.length, 20);
    assert.strictEqual(edges.length, 19);
  });
});
