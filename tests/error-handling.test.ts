import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { activate } from "../src/extension";
import { analyzeDependencies } from "../src/parser";
import { getWebviewContent } from "../src/webview";
import { GraphNode, GraphEdge } from "./types";

suite("Error Handling and Edge Cases Test Suite", () => {
  let tempDir: string;
  let context: vscode.ExtensionContext;
  let sandbox: sinon.SinonSandbox;

  suiteSetup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-error-test-"));
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

  test("Should handle invalid tsconfig.json gracefully", async () => {
    const projectDir = path.join(tempDir, "invalid-tsconfig");
    fs.mkdirSync(projectDir, { recursive: true });

    const tsConfigPath = path.join(projectDir, "tsconfig.json");
    fs.writeFileSync(tsConfigPath, "{ invalid json content }");

    try {
      const result = await analyzeDependencies(projectDir);
      assert.ok(Array.isArray(result));
    } catch (error) {
      assert.ok(error instanceof Error);
    }
  });

  test("Should handle circular dependencies correctly", async () => {
    const projectDir = path.join(tempDir, "circular-deps");
    fs.mkdirSync(projectDir, { recursive: true });

    const tsConfigPath = path.join(projectDir, "tsconfig.json");
    fs.writeFileSync(
      tsConfigPath,
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
        include: ["*.ts"],
      })
    );

    const classAFile = path.join(projectDir, "ClassA.ts");
    fs.writeFileSync(
      classAFile,
      `
			import { ClassB } from './ClassB';
			
			export class ClassA {
				constructor(private b: ClassB) {}
			}
		`
    );

    const classBFile = path.join(projectDir, "ClassB.ts");
    fs.writeFileSync(
      classBFile,
      `
			import { ClassA } from './ClassA';
			
			export class ClassB {
				constructor(private a: ClassA) {}
			}
		`
    );

    const result = await analyzeDependencies(projectDir);

    const nodes = result.filter((item) => "id" in item.data);
    const edges = result.filter((item) => "source" in item.data);

    assert.strictEqual(nodes.length, 2);
    assert.ok(edges.length >= 2);
  });

  test("Should handle files with syntax errors", async () => {
    const projectDir = path.join(tempDir, "syntax-errors");
    fs.mkdirSync(projectDir, { recursive: true });

    const tsConfigPath = path.join(projectDir, "tsconfig.json");
    fs.writeFileSync(
      tsConfigPath,
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
        },
        include: ["*.ts"],
      })
    );
    const errorFile = path.join(projectDir, "SyntaxError.ts");
    fs.writeFileSync(
      errorFile,
      `
			export class SyntaxError {
				constructor( // Missing closing parenthesis
					private service: SomeService
				
				doSomething() { // Missing closing brace
					console.log('test');
			}
		`
    );

    const validFile = path.join(projectDir, "ValidClass.ts");
    fs.writeFileSync(
      validFile,
      `
			export class ValidClass {
				constructor() {}
			}
		`
    );

    const result = await analyzeDependencies(projectDir);

    const nodes = result.filter((item) => "id" in item.data);
    assert.ok(nodes.length >= 1);
  });

  test("Should handle extension activation errors gracefully", () => {
    const registerCommandStub = sandbox.stub(
      vscode.commands,
      "registerCommand"
    );
    registerCommandStub.throws(new Error("Command registration failed"));

    assert.doesNotThrow(() => {
      activate(context);
    });
  });

  test("Should handle webview creation errors", async () => {
    const createWebviewPanelStub = sandbox.stub(
      vscode.window,
      "createWebviewPanel"
    );
    createWebviewPanelStub.throws(new Error("Webview creation failed"));

    sandbox.stub(vscode.workspace, "workspaceFolders").value([
      {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test",
        index: 0,
      },
    ]);

    activate(context);

    const registerCommandStub = sandbox.stub(
      vscode.commands,
      "registerCommand"
    );
    activate(context);

    const commandCallback = registerCommandStub.firstCall.args[1];

    try {
      await commandCallback();
    } catch (error) {
      assert.ok(error instanceof Error);
    }
  });

  test("Should handle missing HTML file for webview", () => {
    assert.throws(() => {
      getWebviewContent(context);
    }, /ENOENT/);
  });

  test("Should handle corrupted HTML file", () => {
    const mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });

    const htmlPath = path.join(mediaDir, "graph.html");
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
    fs.writeFileSync(htmlPath, binaryData);

    const result = getWebviewContent(context);
    assert.strictEqual(typeof result, "string");
  });

  test("Should handle projects with no classes", async () => {
    const projectDir = path.join(tempDir, "no-classes");
    fs.mkdirSync(projectDir, { recursive: true });

    const tsConfigPath = path.join(projectDir, "tsconfig.json");
    fs.writeFileSync(
      tsConfigPath,
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
        },
        include: ["*.ts"],
      })
    );

    const utilsFile = path.join(projectDir, "utils.ts");
    fs.writeFileSync(
      utilsFile,
      `
			export interface IUtility {
				process(): void;
			}
			
			export function processData(data: any): any {
				return data.map((item: any) => item.value);
			}
			
			export const CONSTANT_VALUE = 42;
		`
    );

    const result = await analyzeDependencies(projectDir);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  test("Should handle deeply nested class hierarchies", async () => {
    const projectDir = path.join(tempDir, "deep-hierarchy");
    fs.mkdirSync(projectDir, { recursive: true });

    const tsConfigPath = path.join(projectDir, "tsconfig.json");
    fs.writeFileSync(
      tsConfigPath,
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
        include: ["*.ts"],
      })
    );

    const classes = [
      "BaseService",
      "MiddleService",
      "BusinessService",
      "ApiService",
      "ControllerService",
    ];

    for (let i = 0; i < classes.length; i++) {
      const className = classes[i];
      const prevClass = i > 0 ? classes[i - 1] : null;
      const importLine = prevClass
        ? `import { ${prevClass} } from './${prevClass}';`
        : "";
      const constructorParam = prevClass
        ? `private ${prevClass.toLowerCase()}: ${prevClass}`
        : "";

      const classFile = path.join(projectDir, `${className}.ts`);
      fs.writeFileSync(
        classFile,
        `
				${importLine}
				
				export class ${className} {
					constructor(${constructorParam}) {}
					
					process(): void {
						console.log('${className} processing');
						${prevClass ? `this.${prevClass.toLowerCase()}.process();` : ""}
					}
				}
			`
      );
    }
    const result = await analyzeDependencies(projectDir);

    const nodes = result.filter((item) => "id" in item.data) as GraphNode[];
    const edges = result.filter((item) => "source" in item.data) as GraphEdge[];

    assert.strictEqual(nodes.length, 5);
    assert.strictEqual(edges.length, 4);

    const controllerNode = nodes.find((n) => n.data.id === "ControllerService");
    const baseNode = nodes.find((n) => n.data.id === "BaseService");

    assert.ok(controllerNode);
    assert.ok(baseNode);
    assert.strictEqual(controllerNode.data.out, 1);
    assert.strictEqual(baseNode.data.in, 1);
    assert.strictEqual(baseNode.data.out, 0);
  });

  test("Should handle mixed decorator types", async () => {
    const projectDir = path.join(tempDir, "mixed-decorators");
    fs.mkdirSync(projectDir, { recursive: true });

    const tsConfigPath = path.join(projectDir, "tsconfig.json");
    fs.writeFileSync(
      tsConfigPath,
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
        include: ["*.ts"],
      })
    );

    const serviceFile = path.join(projectDir, "ComplexService.ts");
    fs.writeFileSync(
      serviceFile,
      `
			export class DatabaseService {
				connect(): void {}
			}
			
			export class LoggerService {
				log(msg: string): void {}
			}
			
			export class ComplexService {
				@inject('DatabaseService')
				private db: DatabaseService;
				
				@Injectable
				private logger: LoggerService;
				
				constructor(
					@Inject('DatabaseService') private database: DatabaseService,
					@injectable private log: LoggerService
				) {}
			}
			
			function inject(token: string) { return function(target: any, key: string) {}; }
			function Injectable(target: any, key: string) {}
			function Inject(token: string) { return function(target: any, key: string, index: number) {}; }
			function injectable(target: any, key: string, index: number) {}
		`
    );

    const result = await analyzeDependencies(projectDir);
    const nodes = result.filter((item) => "id" in item.data) as GraphNode[];
    const edges = result.filter((item) => "source" in item.data) as GraphEdge[];

    assert.ok(nodes.length >= 3);
    assert.ok(edges.length >= 2);

    const complexService = nodes.find((n) => n.data.id === "ComplexService");
    assert.ok(complexService);
    assert.ok(complexService.data.out > 0);
  });

  test("Should handle concurrent webview operations", async () => {
    const mockPanel1 = {
      webview: {
        html: "",
        onDidReceiveMessage: sandbox.stub(),
        postMessage: sandbox.stub(),
      },
    };

    const mockPanel2 = {
      webview: {
        html: "",
        onDidReceiveMessage: sandbox.stub(),
        postMessage: sandbox.stub(),
      },
    };

    const createWebviewPanelStub = sandbox.stub(
      vscode.window,
      "createWebviewPanel"
    );
    createWebviewPanelStub.onFirstCall().returns(mockPanel1 as any);
    createWebviewPanelStub.onSecondCall().returns(mockPanel2 as any);

    sandbox.stub(vscode.workspace, "workspaceFolders").value([
      {
        uri: vscode.Uri.file("/test/workspace"),
        name: "test",
        index: 0,
      },
    ]);

    activate(context);

    const registerCommandStub = sandbox.stub(
      vscode.commands,
      "registerCommand"
    );
    activate(context);

    const commandCallback = registerCommandStub.firstCall.args[1];

    const promises = [commandCallback(), commandCallback()];

    await Promise.all(promises);

    assert.strictEqual(createWebviewPanelStub.callCount, 2);
  });
});
