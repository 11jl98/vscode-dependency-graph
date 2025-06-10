import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { activate } from '../src/extension';

suite('Extension Test Suite', () => {
	let context: vscode.ExtensionContext;
	let sandbox: sinon.SinonSandbox;

	suiteSetup(async () => {
		vscode.window.showInformationMessage('Starting Extension tests.');
	});

	setup(() => {
		sandbox = sinon.createSandbox();
		
		// Mock ExtensionContext
		context = {
			subscriptions: [],
			workspaceState: {} as any,
			globalState: {} as any,
			extensionUri: vscode.Uri.file('/test/path'),
			extensionPath: '/test/path',
			asAbsolutePath: (relativePath: string) => `/test/path/${relativePath}`,
			storageUri: vscode.Uri.file('/test/storage'),
			globalStorageUri: vscode.Uri.file('/test/global-storage'),
			logUri: vscode.Uri.file('/test/log'),
			extensionMode: vscode.ExtensionMode.Test,
			environmentVariableCollection: {} as any,
			secrets: {} as any,
			extension: {} as any,
			languageModelAccessInformation: {} as any
		} as vscode.ExtensionContext;
	});

	teardown(() => {
		sandbox.restore();
		// Clear subscriptions
		context.subscriptions.forEach(subscription => {
			if (subscription && typeof subscription.dispose === 'function') {
				subscription.dispose();
			}
		});
		context.subscriptions.length = 0;
	});

	test('Should activate extension successfully', () => {
		assert.doesNotThrow(() => {
			activate(context);
		});
		
		// Verify that a command was registered
		assert.strictEqual(context.subscriptions.length, 1);
	});

	test('Should register showDependencyGraph command', () => {
		const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
		
		activate(context);
		
		assert.ok(registerCommandStub.calledOnce);
		assert.strictEqual(registerCommandStub.firstCall.args[0], 'extension.showDependencyGraph');
		assert.strictEqual(typeof registerCommandStub.firstCall.args[1], 'function');
	});

	test('Should create webview panel when command is executed', async () => {
		const createWebviewPanelStub = sandbox.stub(vscode.window, 'createWebviewPanel');
		const mockPanel = {
			webview: {
				html: '',
				onDidReceiveMessage: sandbox.stub(),
				postMessage: sandbox.stub()
			}
		};
		createWebviewPanelStub.returns(mockPanel as any);

		// Mock workspace
		const mockWorkspace = {
			workspaceFolders: [{
				uri: vscode.Uri.file('/test/workspace'),
				name: 'test',
				index: 0
			}]
		};
		sandbox.stub(vscode.workspace, 'workspaceFolders').value(mockWorkspace.workspaceFolders);

		activate(context);
		
		// Execute the command
		const commandCallback = (vscode.commands.registerCommand as any).firstCall.args[1];
		await commandCallback();

		assert.ok(createWebviewPanelStub.calledOnce);
		assert.strictEqual(createWebviewPanelStub.firstCall.args[0], 'dependencyGraph');
		assert.strictEqual(createWebviewPanelStub.firstCall.args[1], 'Dependency Graph');
		assert.strictEqual(createWebviewPanelStub.firstCall.args[2], vscode.ViewColumn.One);
	});

	test('Should configure webview panel with correct options', async () => {
		const createWebviewPanelStub = sandbox.stub(vscode.window, 'createWebviewPanel');
		const mockPanel = {
			webview: {
				html: '',
				onDidReceiveMessage: sandbox.stub(),
				postMessage: sandbox.stub()
			}
		};
		createWebviewPanelStub.returns(mockPanel as any);

		activate(context);
				const commandCallback = (vscode.commands.registerCommand as any).firstCall.args[1];
		await commandCallback();

		const options = createWebviewPanelStub.firstCall.args[3];
		assert.ok(options);
		assert.strictEqual(options.enableScripts, true);
		assert.ok(Array.isArray(options.localResourceRoots));
	});

	test('Should handle webview message correctly', async () => {
		const mockPanel = {
			webview: {
				html: '',
				onDidReceiveMessage: sandbox.stub(),
				postMessage: sandbox.stub()
			}
		};
		sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel as any);

		// Mock workspace
		sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
			uri: vscode.Uri.file('/test/workspace'),
			name: 'test',
			index: 0
		}]);

		activate(context);
		
		const commandCallback = (vscode.commands.registerCommand as any).firstCall.args[1];
		await commandCallback();

		// Verify that onDidReceiveMessage was called
		assert.ok(mockPanel.webview.onDidReceiveMessage.calledOnce);
		assert.strictEqual(typeof mockPanel.webview.onDidReceiveMessage.firstCall.args[0], 'function');
	});

	test('Should handle empty workspace gracefully', async () => {
		const mockPanel = {
			webview: {
				html: '',
				onDidReceiveMessage: sandbox.stub(),
				postMessage: sandbox.stub()
			}
		};
		sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel as any);
		sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);

		activate(context);
		
		const commandCallback = (vscode.commands.registerCommand as any).firstCall.args[1];
		
		assert.doesNotThrow(async () => {
			await commandCallback();
		});
	});
});
