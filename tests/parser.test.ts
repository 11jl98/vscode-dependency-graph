import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { analyzeDependencies } from '../src/parser';
import { GraphNode, GraphEdge, NodeData, EdgeData } from './types';

suite('Parser Test Suite', () => {
	let tempDir: string;

	suiteSetup(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-dep-test-'));
	});

	suiteTeardown(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('Should return empty array for empty project', async () => {
		const tsConfigPath = path.join(tempDir, 'tsconfig.json');
		fs.writeFileSync(tsConfigPath, JSON.stringify({
			compilerOptions: {
				target: "ES2020",
				module: "commonjs"
			}
		}));

		const result = await analyzeDependencies(tempDir);
		assert.ok(Array.isArray(result));
		assert.strictEqual(result.length, 0);
	});

	test('Should analyze simple class without dependencies', async () => {
		const tsConfigPath = path.join(tempDir, 'tsconfig.json');
		fs.writeFileSync(tsConfigPath, JSON.stringify({
			compilerOptions: {
				target: "ES2020",
				module: "commonjs",
				experimentalDecorators: true,
				emitDecoratorMetadata: true
			},
			include: ["*.ts"]
		}));

		const classFile = path.join(tempDir, 'SimpleClass.ts');
		fs.writeFileSync(classFile, `
			export class SimpleClass {
				constructor() {}
				
				public doSomething(): void {
					console.log('doing something');
				}
			}
		`);
		const result = await analyzeDependencies(tempDir);
		
		const nodes = result.filter(item => 'id' in item.data) as GraphNode[];
		assert.strictEqual(nodes.length, 1);
		assert.strictEqual(nodes[0].data.id, 'SimpleClass');
		assert.strictEqual(nodes[0].data.in, 0);
		assert.strictEqual(nodes[0].data.out, 0);
	});

	test('Should analyze class with constructor dependency', async () => {
		const tsConfigPath = path.join(tempDir, 'tsconfig.json');
		fs.writeFileSync(tsConfigPath, JSON.stringify({
			compilerOptions: {
				target: "ES2020",
				module: "commonjs",
				experimentalDecorators: true,
				emitDecoratorMetadata: true
			},
			include: ["*.ts"]
		}));

		const depFile = path.join(tempDir, 'Dependency.ts');
		fs.writeFileSync(depFile, `
			export class DatabaseService {
				connect(): void {}
			}
		`);

		const mainFile = path.join(tempDir, 'MainClass.ts');
		fs.writeFileSync(mainFile, `
			import { DatabaseService } from './Dependency';
			
			export class UserService {
				constructor(private db: DatabaseService) {}
				
				getUsers(): void {
					this.db.connect();
				}
			}
		`);
		const result = await analyzeDependencies(tempDir);
		
		const nodes = result.filter(item => 'id' in item.data) as GraphNode[];
		const edges = result.filter(item => 'source' in item.data) as GraphEdge[];
		
		assert.strictEqual(nodes.length, 2);
		
		assert.strictEqual(edges.length, 1);
		assert.strictEqual(edges[0].data.source, 'UserService');
		assert.strictEqual(edges[0].data.target, 'DatabaseService');
		
		const userService = nodes.find(n => n.data.id === 'UserService');
		const dbService = nodes.find(n => n.data.id === 'DatabaseService');
		
		assert.ok(userService);
		assert.ok(dbService);
		assert.strictEqual(userService.data.out, 1);
		assert.strictEqual(userService.data.in, 0);
		assert.strictEqual(dbService.data.in, 1);
		assert.strictEqual(dbService.data.out, 0);
	});

	test('Should handle @inject decorator', async () => {
		const tsConfigPath = path.join(tempDir, 'tsconfig.json');
		fs.writeFileSync(tsConfigPath, JSON.stringify({
			compilerOptions: {
				target: "ES2020",
				module: "commonjs",
				experimentalDecorators: true,
				emitDecoratorMetadata: true
			},
			include: ["*.ts"]
		}));

		const serviceFile = path.join(tempDir, 'Services.ts');
		fs.writeFileSync(serviceFile, `
			export class EmailService {
				sendEmail(): void {}
			}
			
			export class NotificationService {
				constructor(@inject('EmailService') private emailService: EmailService) {}
				
				notify(): void {
					this.emailService.sendEmail();
				}
			}
			
			function inject(token: string) {
				return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {};
			}
		`);
		const result = await analyzeDependencies(tempDir);
		
		const nodes = result.filter(item => 'id' in item.data) as GraphNode[];
		const edges = result.filter(item => 'source' in item.data) as GraphEdge[];
		
		assert.ok(nodes.length >= 2);
		assert.ok(edges.length >= 1);
		
		const notificationService = nodes.find(n => n.data.id === 'NotificationService');
		const emailService = nodes.find(n => n.data.id === 'EmailService');
		
		assert.ok(notificationService);
		assert.ok(emailService);
	});

	test('Should handle interface implementations', async () => {
		const tsConfigPath = path.join(tempDir, 'tsconfig.json');
		fs.writeFileSync(tsConfigPath, JSON.stringify({
			compilerOptions: {
				target: "ES2020",
				module: "commonjs",
				experimentalDecorators: true,
				emitDecoratorMetadata: true
			},
			include: ["*.ts"]
		}));

		const interfaceFile = path.join(tempDir, 'Interfaces.ts');
		fs.writeFileSync(interfaceFile, `
			export interface ILogger {
				log(message: string): void;
			}
			
			export class ConsoleLogger implements ILogger {
				log(message: string): void {
					console.log(message);
				}
			}
			
			export class FileLogger implements ILogger {
				log(message: string): void {
					// write to file
				}
			}
			
			export class AppService {
				constructor(private logger: ILogger) {}
				
				run(): void {
					this.logger.log('App started');
				}
			}
		`);
		const result = await analyzeDependencies(tempDir);
		
		const nodes = result.filter(item => 'id' in item.data) as GraphNode[];
		const edges = result.filter(item => 'source' in item.data) as GraphEdge[];
		
		const appService = nodes.find(n => n.data.id === 'AppService');
		const consoleLogger = nodes.find(n => n.data.id === 'ConsoleLogger');
		const fileLogger = nodes.find(n => n.data.id === 'FileLogger');
		
		assert.ok(appService);
		assert.ok(consoleLogger || fileLogger);
	});

	test('Should avoid duplicate edges', async () => {
		const tsConfigPath = path.join(tempDir, 'tsconfig.json');
		fs.writeFileSync(tsConfigPath, JSON.stringify({
			compilerOptions: {
				target: "ES2020",
				module: "commonjs",
				experimentalDecorators: true,
				emitDecoratorMetadata: true
			},
			include: ["*.ts"]
		}));

		const testFile = path.join(tempDir, 'DuplicateTest.ts');
		fs.writeFileSync(testFile, `
			export class SharedService {
				process(): void {}
			}
			
			export class MainService {
				constructor(
					private service1: SharedService,
					private service2: SharedService
				) {}
				
				execute(): void {
					this.service1.process();
					this.service2.process();
				}
			}
		`);
		const result = await analyzeDependencies(tempDir);
		
		const edges = result.filter(item => 'source' in item.data) as GraphEdge[];
		
		const mainToSharedEdges = edges.filter(
			e => e.data.source === 'MainService' && e.data.target === 'SharedService'
		);
		
		assert.strictEqual(mainToSharedEdges.length, 1);
	});

	test('Should handle property injection', async () => {
		const tsConfigPath = path.join(tempDir, 'tsconfig.json');
		fs.writeFileSync(tsConfigPath, JSON.stringify({
			compilerOptions: {
				target: "ES2020",
				module: "commonjs",
				experimentalDecorators: true,
				emitDecoratorMetadata: true
			},
			include: ["*.ts"]
		}));

		const propFile = path.join(tempDir, 'PropertyInjection.ts');
		fs.writeFileSync(propFile, `
			export class ConfigService {
				getConfig(): any {}
			}
			
			export class ApiService {
				@inject('ConfigService')
				private config: ConfigService;
				
				getData(): void {
					this.config.getConfig();
				}
			}
			
			function inject(token: string) {
				return function (target: any, propertyKey: string) {};
			}
		`);
		const result = await analyzeDependencies(tempDir);
		
		const edges = result.filter(item => 'source' in item.data) as GraphEdge[];
		
		const apiToConfigEdges = edges.filter(
			e => e.data.source === 'ApiService' && e.data.target === 'ConfigService'
		);
		
		assert.ok(apiToConfigEdges.length > 0);
	});

	test('Should handle missing tsconfig.json gracefully', async () => {
		const nonExistentPath = path.join(tempDir, 'nonexistent');
		
		try {
			const result = await analyzeDependencies(nonExistentPath);
			assert.ok(Array.isArray(result));
		} catch (error) {
			assert.ok(error instanceof Error);
		}
	});
});
