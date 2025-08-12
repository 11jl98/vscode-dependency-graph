// Minimal shims for proposed chat output renderer APIs used here.
// These declarations allow compilation when using the proposed API flag.
import 'vscode';
declare module 'vscode' {
	namespace chat {
		function registerChatOutputRenderer(viewType: string, renderer: ChatOutputRenderer): Disposable;
	}

	interface ChatOutputRenderer {
		renderChatOutput(data: { value: Uint8Array }, webview: Webview, ctx: unknown, token: CancellationToken): Thenable<void> | void;
		mimeTypes?: string[];
	}

	interface ExtendedLanguageModelToolResult2 {
		toolResultDetails2?: {
			mime: string;
			value: Uint8Array;
		};
	}
}
