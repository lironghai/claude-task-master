/**
 * @fileoverview Qwen Code Language Model implementation
 */

import { NoSuchModelError } from '@ai-sdk/provider';
import { generateId } from '@ai-sdk/provider-utils';
import { convertToClaudeCodeMessages } from './message-converter.js';
import { extractJson } from './json-extractor.js';
import { createAPICallError, createAuthenticationError } from './errors.js';
import {log} from "../../../../scripts/modules/utils.js";
import {fileURLToPath, fileURLToPath as fileURLToPath2} from "url";
import {join, join as join2} from "path";
import {spawn} from "child_process";
import {createInterface} from "readline";

let query;
let AbortError;

async function loadClaudeCodeModule() {
	query = queryFunction;
	// if (!query || !AbortError) {
	// 	try {
	// 		const mod = await import('@qwen-code/qwen-code');
	// 		query = mod.query;
	// 		AbortError = mod.AbortError;
	// 	} catch (err) {
	// 		throw new Error(
	// 			"Claude Code SDK is not installed. Please install '@anthropic-ai/claude-code' to use the claude-code provider."
	// 		);
	// 	}
	// }
}

/**
 * @typedef {import('./types.js').ClaudeCodeSettings} ClaudeCodeSettings
 * @typedef {import('./types.js').ClaudeCodeModelId} ClaudeCodeModelId
 * @typedef {import('./types.js').ClaudeCodeLanguageModelOptions} ClaudeCodeLanguageModelOptions
 */

const modelMap = {
	plus: 'qwen-coder-plus',
};

// src/utils/abortController.ts
import { setMaxListeners } from "events";
var DEFAULT_MAX_LISTENERS = 50;
function createAbortController(maxListeners = DEFAULT_MAX_LISTENERS) {
	const controller = new AbortController;
	setMaxListeners(maxListeners, controller.signal);
	return controller;
}

// src/transport/ProcessTransport.ts
class ProcessTransport {
	options;
	child;
	childStdin;
	childStdout;
	ready = false;
	abortController;
	exitError;
	exitListeners = [];
	processExitHandler;
	abortHandler;
	isStreaming;
	constructor(options) {
		this.options = options;
		this.abortController = options.abortController || createAbortController();
		this.isStreaming = typeof options.prompt !== "string";
		this.initialize();
	}
	initialize() {
		try {
			const {
				prompt,
				additionalDirectories = [],
				cwd,
				executableArgs = [],
				pathToClaudeCodeExecutable,
				env = { ...process.env },
				stderr,
				customSystemPrompt,
				appendSystemPrompt,
				maxTurns,
				model,
				fallbackModel,
				permissionMode,
				permissionPromptToolName,
				continueConversation,
				resume,
				allowedTools = [],
				disallowedTools = [],
				mcpServers,
				strictMcpConfig,
				canUseTool
			} = this.options;

			const executable = "qwen";
			const args = ["qwen", "--debug", "--openai-logging", "--yolo", "--prompt"];
			// const args = ["--version"];
			args.push("'" + prompt + "'");
			this.logDebug(`Spawning Qwen Code process: ${executable} ${[...args].join(" ")}`);
			const stderrMode = env.DEBUG || stderr ? "pipe" : "ignore";
			this.child = spawn(executable, [...args], {
				shell: true,
				cwd,
				stdio: ["pipe", "pipe", stderrMode],
				signal: this.abortController.signal,
				env
			});
			this.childStdin = this.child.stdin;
			this.childStdout = this.child.stdout;
			if (typeof prompt === "string") {
				this.childStdin.end();
				this.childStdin = undefined;
			}
			if (env.DEBUG || stderr) {
				this.child.stderr.on("data", (data) => {
					this.logDebug(`Qwen Code stderr: ${data.toString()}`);
					if (stderr) {
						stderr(data.toString());
					}
				});
			}
			const cleanup = () => {
				if (this.child && !this.child.killed) {
					this.child.kill("SIGTERM");
				}
			};
			this.processExitHandler = cleanup;
			this.abortHandler = cleanup;
			process.on("exit", this.processExitHandler);
			this.abortController.signal.addEventListener("abort", this.abortHandler);
			this.child.on("error", (error) => {
				this.ready = false;
				if (this.abortController.signal.aborted) {
					this.exitError = new AbortError("Qwen Code process aborted by user");
				} else {
					this.exitError = new Error(`Failed to spawn Qwen Code process: ${error.message}`);
					this.logDebug(this.exitError.message);
				}
			});
			this.child.on("close", (code, signal) => {
				this.ready = false;
				if (this.abortController.signal.aborted) {
					this.exitError = new AbortError("Qwen Code process aborted by user");
				} else {
					const error = this.getProcessExitError(code, signal);
					if (error) {
						this.exitError = error;
						this.logDebug(error.message);
					}
				}
			});
			this.ready = true;
		} catch (error) {
			this.ready = false;
			throw error;
		}
	}
	getProcessExitError(code, signal) {
		if (code !== 0 && code !== null) {
			return new Error(`Qwen Code process exited with code ${code}`);
		} else if (signal) {
			return new Error(`Qwen Code process terminated by signal ${signal}`);
		}
		return;
	}
	getDefaultExecutablePath() {
		const filename = fileURLToPath(import.meta.url);
		const dirname = join(filename, "..", "..");
		return join(dirname, "entrypoints", "cli.js");
	}
	isRunningWithBun() {
		return process.versions.bun !== undefined || process.env.BUN_INSTALL !== undefined;
	}
	logDebug(message) {
		if (process.env.DEBUG) {
			process.stderr.write(`${message}
`);
		}
	}
	write(data) {
		if (this.abortController.signal.aborted) {
			throw new AbortError("Operation aborted");
		}
		if (!this.ready || !this.childStdin) {
			throw new Error("ProcessTransport is not ready for writing");
		}
		if (this.child?.killed || this.child?.exitCode !== null) {
			throw new Error("Cannot write to terminated process");
		}
		if (this.exitError) {
			throw new Error(`Cannot write to process that exited with error: ${this.exitError.message}`);
		}
		if (process.env.DEBUG_SDK) {
			process.stderr.write(`[ProcessTransport] Writing to stdin: ${data.substring(0, 100)}
`);
		}
		try {
			const written = this.childStdin.write(data);
			if (!written && process.env.DEBUG_SDK) {
				console.warn("[ProcessTransport] Write buffer full, data queued");
			}
		} catch (error) {
			this.ready = false;
			throw new Error(`Failed to write to process stdin: ${error.message}`);
		}
	}
	close() {
		if (this.childStdin) {
			this.childStdin.end();
			this.childStdin = undefined;
		}
		if (this.processExitHandler) {
			process.off("exit", this.processExitHandler);
			this.processExitHandler = undefined;
		}
		if (this.abortHandler) {
			this.abortController.signal.removeEventListener("abort", this.abortHandler);
			this.abortHandler = undefined;
		}
		for (const { handler } of this.exitListeners) {
			this.child?.off("exit", handler);
		}
		this.exitListeners = [];
		if (this.child && !this.child.killed) {
			this.child.kill("SIGTERM");
			setTimeout(() => {
				if (this.child && !this.child.killed) {
					this.child.kill("SIGKILL");
				}
			}, 5000);
		}
		this.ready = false;
	}
	isReady() {
		return this.ready;
	}
	async* readMessages() {
		if (!this.childStdout) {
			throw new Error("ProcessTransport output stream not available");
		}
		const rl = createInterface({ input: this.childStdout });
		try {
			for await (const line of rl) {
				if (line.trim()) {
					const message = JSON.parse(line);
					yield message;
				}
			}
			await this.waitForExit();
		} catch (error) {
			throw error;
		} finally {
			rl.close();
		}
	}
	endInput() {
		if (this.childStdin) {
			this.childStdin.end();
		}
	}
	getInputStream() {
		return this.childStdin;
	}
	onExit(callback) {
		if (!this.child)
			return () => {};
		const handler = (code, signal) => {
			const error = this.getProcessExitError(code, signal);
			callback(error);
		};
		this.child.on("exit", handler);
		this.exitListeners.push({ callback, handler });
		return () => {
			if (this.child) {
				this.child.off("exit", handler);
			}
			const index = this.exitListeners.findIndex((l) => l.handler === handler);
			if (index !== -1) {
				this.exitListeners.splice(index, 1);
			}
		};
	}
	async waitForExit() {
		if (!this.child) {
			if (this.exitError) {
				throw this.exitError;
			}
			return;
		}
		if (this.child.exitCode !== null || this.child.killed) {
			if (this.exitError) {
				throw this.exitError;
			}
			return;
		}
		return new Promise((resolve, reject) => {
			const exitHandler = (code, signal) => {
				if (this.abortController.signal.aborted) {
					reject(new AbortError("Operation aborted"));
					return;
				}
				const error = this.getProcessExitError(code, signal);
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			};
			this.child.once("exit", exitHandler);
			const errorHandler = (error) => {
				this.child.off("exit", exitHandler);
				reject(error);
			};
			this.child.once("error", errorHandler);
			this.child.once("exit", () => {
				this.child.off("error", errorHandler);
			});
		});
	}
}


// src/utils/stream.ts
class Stream {
	returned;
	queue = [];
	readResolve;
	readReject;
	isDone = false;
	hasError;
	started = false;
	constructor(returned) {
		this.returned = returned;
	}
	[Symbol.asyncIterator]() {
		if (this.started) {
			throw new Error("Stream can only be iterated once");
		}
		this.started = true;
		return this;
	}
	next() {
		if (this.queue.length > 0) {
			return Promise.resolve({
				done: false,
				value: this.queue.shift()
			});
		}
		if (this.isDone) {
			return Promise.resolve({ done: true, value: undefined });
		}
		if (this.hasError) {
			return Promise.reject(this.hasError);
		}
		return new Promise((resolve, reject) => {
			this.readResolve = resolve;
			this.readReject = reject;
		});
	}
	enqueue(value) {
		if (this.readResolve) {
			const resolve = this.readResolve;
			this.readResolve = undefined;
			this.readReject = undefined;
			resolve({ done: false, value });
		} else {
			this.queue.push(value);
		}
	}
	done() {
		this.isDone = true;
		if (this.readResolve) {
			const resolve = this.readResolve;
			this.readResolve = undefined;
			this.readReject = undefined;
			resolve({ done: true, value: undefined });
		}
	}
	error(error) {
		this.hasError = error;
		if (this.readReject) {
			const reject = this.readReject;
			this.readResolve = undefined;
			this.readReject = undefined;
			reject(error);
		}
	}
	return() {
		this.isDone = true;
		if (this.returned) {
			this.returned();
		}
		return Promise.resolve({ done: true, value: undefined });
	}
}


// src/core/Query.ts
class Query {
	transport;
	isStreamingMode;
	canUseTool;
	hooks;
	abortController;
	pendingControlResponses = new Map;
	cleanupPerformed = false;
	sdkMessages;
	inputStream = new Stream;
	intialization;
	cancelControllers = new Map;
	hookCallbacks = new Map;
	nextCallbackId = 0;
	constructor(transport, isStreamingMode, canUseTool, hooks, abortController) {
		this.transport = transport;
		this.isStreamingMode = isStreamingMode;
		this.canUseTool = canUseTool;
		this.hooks = hooks;
		this.abortController = abortController;
		this.sdkMessages = this.readSdkMessages();
		this.readMessages();
		if (this.isStreamingMode) {
			this.intialization = this.initialize();
		}
	}
	setError(error) {
		this.inputStream.error(error);
	}
	cleanup(error) {
		if (this.cleanupPerformed)
			return;
		this.cleanupPerformed = true;
		try {
			this.transport.close();
			this.pendingControlResponses.clear();
			if (error) {
				this.inputStream.error(error);
			} else {
				this.inputStream.done();
			}
		} catch (_error) {}
	}
	next(...[value]) {
		return this.sdkMessages.next(...[value]);
	}
	return(value) {
		return this.sdkMessages.return(value);
	}
	throw(e) {
		return this.sdkMessages.throw(e);
	}
	[Symbol.asyncIterator]() {
		return this.sdkMessages;
	}
	[Symbol.asyncDispose]() {
		return this.sdkMessages[Symbol.asyncDispose]();
	}
	async readMessages() {
		try {
			for await (const message of this.transport.readMessages()) {
				if (message.type === "control_response") {
					const handler = this.pendingControlResponses.get(message.response.request_id);
					if (handler) {
						handler(message.response);
					}
					continue;
				} else if (message.type === "control_request") {
					this.handleControlRequest(message);
					continue;
				} else if (message.type === "control_cancel_request") {
					this.handleControlCancelRequest(message);
					continue;
				}
				this.inputStream.enqueue(message);
			}
			this.inputStream.done();
			this.cleanup();
		} catch (error) {
			this.inputStream.error(error);
			this.cleanup(error);
		}
	}
	async handleControlRequest(request) {
		const controller = new AbortController;
		this.cancelControllers.set(request.request_id, controller);
		try {
			const response = await this.processControlRequest(request, controller.signal);
			const controlResponse = {
				type: "control_response",
				response: {
					subtype: "success",
					request_id: request.request_id,
					response
				}
			};
			await Promise.resolve(this.transport.write(JSON.stringify(controlResponse) + `
`));
		} catch (error) {
			const controlErrorResponse = {
				type: "control_response",
				response: {
					subtype: "error",
					request_id: request.request_id,
					error: error.message || String(error)
				}
			};
			await Promise.resolve(this.transport.write(JSON.stringify(controlErrorResponse) + `
`));
		} finally {
			this.cancelControllers.delete(request.request_id);
		}
	}
	handleControlCancelRequest(request) {
		const controller = this.cancelControllers.get(request.request_id);
		if (controller) {
			controller.abort();
			this.cancelControllers.delete(request.request_id);
		}
	}
	async processControlRequest(request, signal) {
		if (request.request.subtype === "can_use_tool") {
			if (!this.canUseTool) {
				throw new Error("canUseTool callback is not provided.");
			}
			return this.canUseTool(request.request.tool_name, request.request.input, {
				signal
			});
		} else if (request.request.subtype === "hook_callback") {
			const result = await this.handleHookCallbacks(request.request.callback_id, request.request.input, request.request.tool_use_id, signal);
			return result;
		}
		throw new Error("Unsupported control request subtype: " + request.request.subtype);
	}
	async* readSdkMessages() {
		for await (const message of this.inputStream) {
			yield message;
		}
	}
	async initialize() {
		let hooks;
		if (this.hooks) {
			hooks = {};
			for (const [event, matchers] of Object.entries(this.hooks)) {
				if (matchers.length > 0) {
					hooks[event] = matchers.map((matcher) => {
						const callbackIds = [];
						for (const callback of matcher.hooks) {
							const callbackId = `hook_${this.nextCallbackId++}`;
							this.hookCallbacks.set(callbackId, callback);
							callbackIds.push(callbackId);
						}
						return {
							matcher: matcher.matcher,
							hookCallbackIds: callbackIds
						};
					});
				}
			}
		}
		const initRequest = {
			subtype: "initialize",
			hooks
		};
		const response = await this.request(initRequest);
		return response.response;
	}
	async interrupt() {
		if (!this.isStreamingMode) {
			throw new Error("Interrupt requires --input-format stream-json");
		}
		await this.request({
			subtype: "interrupt"
		});
	}
	async setPermissionMode(mode) {
		if (!this.isStreamingMode) {
			throw new Error("setPermissionMode requires --input-format stream-json");
		}
		await this.request({
			subtype: "set_permission_mode",
			mode
		});
	}
	request(request) {
		const requestId = Math.random().toString(36).substring(2, 15);
		const sdkRequest = {
			request_id: requestId,
			type: "control_request",
			request
		};
		return new Promise((resolve, reject) => {
			this.pendingControlResponses.set(requestId, (response) => {
				if (response.subtype === "success") {
					resolve(response);
				} else {
					reject(new Error(response.error));
				}
			});
			Promise.resolve(this.transport.write(JSON.stringify(sdkRequest) + `
`));
		});
	}
	async supportedCommands() {
		if (!this.isStreamingMode) {
			throw new Error("supportedCommands requires --input-format stream-json");
		}
		if (!this.intialization) {
			throw new Error("supportedCommands requires transport with bidirectional communication");
		}
		return (await this.intialization).commands;
	}
	async streamInput(stream) {
		try {
			for await (const message of stream) {
				if (this.abortController?.signal.aborted)
					break;
				await Promise.resolve(this.transport.write(JSON.stringify(message) + `
`));
			}
			this.transport.endInput();
		} catch (error) {
			if (!(error instanceof AbortError)) {
				throw error;
			}
		}
	}
	handleHookCallbacks(callbackId, input, toolUseID, abortSignal) {
		const callback = this.hookCallbacks.get(callbackId);
		if (!callback) {
			throw new Error(`No hook callback found for ID: ${callbackId}`);
		}
		return callback(input, toolUseID, {
			signal: abortSignal
		});
	}
}

export class QwenCodeLanguageModel {
	specificationVersion = 'v1';
	defaultObjectGenerationMode = 'json';
	supportsImageUrls = false;
	supportsStructuredOutputs = false;

	/** @type {ClaudeCodeModelId} */
	modelId;

	/** @type {ClaudeCodeSettings} */
	settings;

	/** @type {string|undefined} */
	sessionId;

	/**
	 * @param {ClaudeCodeLanguageModelOptions} options
	 */
	constructor(options) {
		this.modelId = options.id;
		this.settings = options.settings ?? {};

		// Validate model ID format
		if (
			!this.modelId ||
			typeof this.modelId !== 'string' ||
			this.modelId.trim() === ''
		) {
			throw new NoSuchModelError({
				modelId: this.modelId,
				modelType: 'languageModel'
			});
		}
	}

	get provider() {
		return 'qwen';
	}

	/**
	 * Get the model name for Claude Code CLI
	 * @returns {string}
	 */
	getModel() {
		const mapped = modelMap[this.modelId];
		return mapped ?? this.modelId;
	}

	/**
	 * Generate unsupported parameter warnings
	 * @param {Object} options - Generation options
	 * @returns {Array} Warnings array
	 */
	generateUnsupportedWarnings(options) {
		const warnings = [];
		const unsupportedParams = [];

		// Check for unsupported parameters
		if (options.temperature !== undefined)
			unsupportedParams.push('temperature');
		if (options.maxTokens !== undefined) unsupportedParams.push('maxTokens');
		if (options.topP !== undefined) unsupportedParams.push('topP');
		if (options.topK !== undefined) unsupportedParams.push('topK');
		if (options.presencePenalty !== undefined)
			unsupportedParams.push('presencePenalty');
		if (options.frequencyPenalty !== undefined)
			unsupportedParams.push('frequencyPenalty');
		if (options.stopSequences !== undefined && options.stopSequences.length > 0)
			unsupportedParams.push('stopSequences');
		if (options.seed !== undefined) unsupportedParams.push('seed');

		if (unsupportedParams.length > 0) {
			// Add a warning for each unsupported parameter
			for (const param of unsupportedParams) {
				warnings.push({
					type: 'unsupported-setting',
					setting: param,
					details: `Qwen Code CLI does not support the ${param} parameter. It will be ignored.`
				});
			}
		}

		return warnings;
	}

	/**
	 * Generate text using Claude Code
	 * @param {Object} options - Generation options
	 * @returns {Promise<Object>}
	 */
	async doGenerate(options) {
		await loadClaudeCodeModule();
		const { messagesPrompt } = convertToClaudeCodeMessages(
			options.prompt,
			options.mode
		);

		const abortController = new AbortController();
		if (options.abortSignal) {
			options.abortSignal.addEventListener('abort', () =>
				abortController.abort()
			);
		}

		const queryOptions = {
			model: this.getModel(),
			abortController,
			resume: this.sessionId,
			pathToClaudeCodeExecutable: this.settings.pathToClaudeCodeExecutable,
			customSystemPrompt: this.settings.customSystemPrompt,
			appendSystemPrompt: this.settings.appendSystemPrompt,
			maxTurns: this.settings.maxTurns,
			maxThinkingTokens: this.settings.maxThinkingTokens,
			cwd: this.settings.projectRoot,
			executable: this.settings.executable,
			executableArgs: this.settings.executableArgs,
			permissionMode: this.settings.permissionMode,
			permissionPromptToolName: this.settings.permissionPromptToolName,
			continue: this.settings.continue,
			allowedTools: this.settings.allowedTools,
			disallowedTools: this.settings.disallowedTools,
			mcpServers: this.settings.mcpServers
		};

		let text = '';
		let usage = { promptTokens: 0, completionTokens: 0 };
		let finishReason = 'stop';
		let costUsd;
		let durationMs;
		let rawUsage;
		const warnings = this.generateUnsupportedWarnings(options);

		try {
			if (!query) {
				throw new Error(
					"Qwen Code SDK is not installed. Please install to use the qwen provider."
				);
			}
			const response = query({
				prompt: messagesPrompt,
				options: queryOptions
			});

			for await (const message of response) {
				log('debug', JSON.stringify(message));
				if (message.type === 'assistant') {
					text += message.message.content
						.map((c) => (c.type === 'text' ? c.text : ''))
						.join('');
				} else if (message.type === 'result') {
					this.sessionId = message.session_id;
					costUsd = message.total_cost_usd;
					durationMs = message.duration_ms;

					if ('usage' in message) {
						rawUsage = message.usage;
						usage = {
							promptTokens:
								(message.usage.cache_creation_input_tokens ?? 0) +
								(message.usage.cache_read_input_tokens ?? 0) +
								(message.usage.input_tokens ?? 0),
							completionTokens: message.usage.output_tokens ?? 0
						};
					}

					if (message.subtype === 'error_max_turns') {
						finishReason = 'length';
					} else if (message.subtype === 'error_during_execution') {
						finishReason = 'error';
					}
				} else if (message.type === 'system' && message.subtype === 'init') {
					this.sessionId = message.session_id;
				}
			}
		} catch (error) {
			// -------------------------------------------------------------
			// Work-around for Claude-Code CLI/SDK JSON truncation bug (#913)
			// -------------------------------------------------------------
			// If the SDK throws a JSON SyntaxError *but* we already hold some
			// buffered text, assume the response was truncated by the CLI.
			// We keep the accumulated text, mark the finish reason, push a
			// provider-warning and *skip* the normal error handling so Task
			// Master can continue processing.
			const isJsonTruncation =
				error instanceof SyntaxError &&
				/JSON/i.test(error.message || '') &&
				(error.message.includes('position') ||
					error.message.includes('Unexpected end'));
			if (isJsonTruncation && text && text.length > 0) {
				warnings.push({
					type: 'provider-warning',
					details:
						'Qwen Code SDK emitted a JSON parse error but Task Master recovered buffered text (possible CLI truncation).'
				});
				finishReason = 'truncated';
				// Skip re-throwing: fall through so the caller receives usable data
			} else {
				if (AbortError && error instanceof AbortError) {
					throw options.abortSignal?.aborted
						? options.abortSignal.reason
						: error;
				}

				// Check for authentication errors
				if (
					error.message?.includes('not logged in') ||
					error.message?.includes('authentication') ||
					error.exitCode === 401
				) {
					throw createAuthenticationError({
						message:
							error.message ||
							'Authentication failed. Please ensure Qwen Code CLI is properly authenticated.'
					});
				}

				// Wrap other errors with API call error
				throw createAPICallError({
					message: error.message || 'Qwen Code CLI error',
					code: error.code,
					exitCode: error.exitCode,
					stderr: error.stderr,
					promptExcerpt: messagesPrompt.substring(0, 200),
					isRetryable: error.code === 'ENOENT' || error.code === 'ECONNREFUSED'
				});
			}
		}

		// Extract JSON if in object-json mode
		if (options.mode?.type === 'object-json' && text) {
			text = extractJson(text);
		}

		return {
			text: text || undefined,
			usage,
			finishReason,
			rawCall: {
				rawPrompt: messagesPrompt,
				rawSettings: queryOptions
			},
			warnings: warnings.length > 0 ? warnings : undefined,
			response: {
				id: generateId(),
				timestamp: new Date(),
				modelId: this.modelId
			},
			request: {
				body: messagesPrompt
			},
			providerMetadata: {
				'qwen': {
					...(this.sessionId !== undefined && { sessionId: this.sessionId }),
					...(costUsd !== undefined && { costUsd }),
					...(durationMs !== undefined && { durationMs }),
					...(rawUsage !== undefined && { rawUsage })
				}
			}
		};
	}

	/**
	 * Stream text using Claude Code
	 * @param {Object} options - Stream options
	 * @returns {Promise<Object>}
	 */
	async doStream(options) {
		await loadClaudeCodeModule();
		const { messagesPrompt } = convertToClaudeCodeMessages(
			options.prompt,
			options.mode
		);

		const abortController = new AbortController();
		if (options.abortSignal) {
			options.abortSignal.addEventListener('abort', () =>
				abortController.abort()
			);
		}

		const queryOptions = {
			model: this.getModel(),
			abortController,
			resume: this.sessionId,
			pathToClaudeCodeExecutable: this.settings.pathToClaudeCodeExecutable,
			customSystemPrompt: this.settings.customSystemPrompt,
			appendSystemPrompt: this.settings.appendSystemPrompt,
			maxTurns: this.settings.maxTurns,
			maxThinkingTokens: this.settings.maxThinkingTokens,
			cwd: this.settings.cwd,
			executable: this.settings.executable,
			executableArgs: this.settings.executableArgs,
			permissionMode: this.settings.permissionMode,
			permissionPromptToolName: this.settings.permissionPromptToolName,
			continue: this.settings.continue,
			allowedTools: this.settings.allowedTools,
			disallowedTools: this.settings.disallowedTools,
			mcpServers: this.settings.mcpServers
		};

		const warnings = this.generateUnsupportedWarnings(options);

		const stream = new ReadableStream({
			start: async (controller) => {
				try {
					if (!query) {
						throw new Error(
							"Qwen Code SDK is not installed. Please install to use the qwen provider."
						);
					}
					const response = query({
						prompt: messagesPrompt,
						options: queryOptions
					});

					let usage = { promptTokens: 0, completionTokens: 0 };
					let accumulatedText = '';

					for await (const message of response) {
						log('debug', JSON.stringify(message));
						if (message.type === 'assistant') {
							const text = message.message.content
								.map((c) => (c.type === 'text' ? c.text : ''))
								.join('');

							if (text) {
								accumulatedText += text;

								// In object-json mode, we need to accumulate the full text
								// and extract JSON at the end, so don't stream individual deltas
								if (options.mode?.type !== 'object-json') {
									controller.enqueue({
										type: 'text-delta',
										textDelta: text
									});
								}
							}
						} else if (message.type === 'result') {
							let rawUsage;
							if ('usage' in message) {
								rawUsage = message.usage;
								usage = {
									promptTokens:
										(message.usage.cache_creation_input_tokens ?? 0) +
										(message.usage.cache_read_input_tokens ?? 0) +
										(message.usage.input_tokens ?? 0),
									completionTokens: message.usage.output_tokens ?? 0
								};
							}

							let finishReason = 'stop';
							if (message.subtype === 'error_max_turns') {
								finishReason = 'length';
							} else if (message.subtype === 'error_during_execution') {
								finishReason = 'error';
							}

							// Store session ID in the model instance
							this.sessionId = message.session_id;

							// In object-json mode, extract JSON and send the full text at once
							if (options.mode?.type === 'object-json' && accumulatedText) {
								const extractedJson = extractJson(accumulatedText);
								controller.enqueue({
									type: 'text-delta',
									textDelta: extractedJson
								});
							}

							controller.enqueue({
								type: 'finish',
								finishReason,
								usage,
								providerMetadata: {
									'qwen': {
										sessionId: message.session_id,
										...(message.total_cost_usd !== undefined && {
											costUsd: message.total_cost_usd
										}),
										...(message.duration_ms !== undefined && {
											durationMs: message.duration_ms
										}),
										...(rawUsage !== undefined && { rawUsage })
									}
								}
							});
						} else if (
							message.type === 'system' &&
							message.subtype === 'init'
						) {
							// Store session ID for future use
							this.sessionId = message.session_id;

							// Emit response metadata when session is initialized
							controller.enqueue({
								type: 'response-metadata',
								id: message.session_id,
								timestamp: new Date(),
								modelId: this.modelId
							});
						}
					}

					// -------------------------------------------------------------
					// Work-around for Claude-Code CLI/SDK JSON truncation bug (#913)
					// -------------------------------------------------------------
					// If we hit the SDK JSON SyntaxError but have buffered text, finalize
					// the stream gracefully instead of emitting an error.
					const isJsonTruncation =
						error instanceof SyntaxError &&
						/JSON/i.test(error.message || '') &&
						(error.message.includes('position') ||
							error.message.includes('Unexpected end'));

					if (
						isJsonTruncation &&
						accumulatedText &&
						accumulatedText.length > 0
					) {
						// Prepare final text payload
						const finalText =
							options.mode?.type === 'object-json'
								? extractJson(accumulatedText)
								: accumulatedText;

						// Emit any remaining text
						controller.enqueue({
							type: 'text-delta',
							textDelta: finalText
						});

						// Emit finish with truncated reason and warning
						controller.enqueue({
							type: 'finish',
							finishReason: 'truncated',
							usage,
							providerMetadata: { 'qwen': { truncated: true } },
							warnings: [
								{
									type: 'provider-warning',
									details:
										'Qwen Code SDK JSON truncation detected; stream recovered.'
								}
							]
						});

						controller.close();
						return; // Skip normal error path
					}

					controller.close();
				} catch (error) {
					let errorToEmit;

					if (AbortError && error instanceof AbortError) {
						errorToEmit = options.abortSignal?.aborted
							? options.abortSignal.reason
							: error;
					} else if (
						error.message?.includes('not logged in') ||
						error.message?.includes('authentication') ||
						error.exitCode === 401
					) {
						errorToEmit = createAuthenticationError({
							message:
								error.message ||
								'Authentication failed. Please ensure Qwen Code CLI is properly authenticated.'
						});
					} else {
						errorToEmit = createAPICallError({
							message: error.message || 'Qwen Code CLI error',
							code: error.code,
							exitCode: error.exitCode,
							stderr: error.stderr,
							promptExcerpt: messagesPrompt.substring(0, 200),
							isRetryable:
								error.code === 'ENOENT' || error.code === 'ECONNREFUSED'
						});
					}

					// Emit error as a stream part
					controller.enqueue({
						type: 'error',
						error: errorToEmit
					});

					controller.close();
				}
			}
		});

		return {
			stream,
			rawCall: {
				rawPrompt: messagesPrompt,
				rawSettings: queryOptions
			},
			warnings: warnings.length > 0 ? warnings : undefined,
			request: {
				body: messagesPrompt
			}
		};
	}



}

function queryFunction({
	prompt,
	options: {
		abortController = createAbortController(),
		additionalDirectories = [],
		allowedTools = [],
		appendSystemPrompt,
		canUseTool,
		continue: continueConversation,
		customSystemPrompt,
		cwd,
		disallowedTools = [],
		env,
		executableArgs = [],
		fallbackModel,
		hooks,
		maxTurns,
		mcpServers,
		model,
		pathToClaudeCodeExecutable,
		permissionMode = "default",
		permissionPromptToolName,
		resume,
		stderr,
		strictMcpConfig,
		websocket
	} = {}
}) {
	if (!env) {
		env = { ...process.env };
	}
	if (!env.CLAUDE_CODE_ENTRYPOINT) {
		env.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";
	}
	if (pathToClaudeCodeExecutable === undefined) {
		const filename = fileURLToPath2(import.meta.url);
		const dirname = join2(filename, "..");
		pathToClaudeCodeExecutable = join2(dirname, "cli.js");
	}
	const isStreamingMode = typeof prompt !== "string";
	let transport;
	if (websocket) {
		if (typeof prompt === "string") {
			throw new Error("WebSocket transport requires prompt as AsyncIterable for bidirectional communication");
		}
		transport = new WebSocketTransport({
			url: websocket.url,
			headers: websocket.headers,
			abortController
		});
	} else {
		transport = new ProcessTransport({
			prompt,
			abortController,
			additionalDirectories,
			cwd,
			executableArgs,
			pathToClaudeCodeExecutable,
			env,
			stderr,
			customSystemPrompt,
			appendSystemPrompt,
			maxTurns,
			model,
			fallbackModel,
			permissionMode,
			permissionPromptToolName,
			continueConversation,
			resume,
			allowedTools,
			disallowedTools,
			mcpServers,
			strictMcpConfig,
			canUseTool: !!canUseTool,
			hooks: !!hooks
		});
	}
	const query2 = new Query(transport, isStreamingMode, canUseTool, hooks, abortController);
	if (typeof prompt !== "string") {
		query2.streamInput(prompt);
	}
	return query2;
}
