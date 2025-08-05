import {
	generateObject,
	generateText,
	streamText,
	zodSchema,
	JSONParseError,
	NoObjectGeneratedError,
    NoSuchToolError,
    experimental_createMCPClient as createMCPClient
} from './base_index.js';

// } from 'ai';
// } from './base_index.js';

import { jsonrepair } from 'jsonrepair';
import { log } from '../../scripts/modules/utils.js';
import {Experimental_StdioMCPTransport as StdioMCPTransport} from 'ai/mcp-stdio';

/**
 * Base class for all AI providers
 */
export class BaseAIProvider {
	constructor() {
		if (this.constructor === BaseAIProvider) {
			throw new Error('BaseAIProvider cannot be instantiated directly');
		}

		// Each provider must set their name
		this.name = this.constructor.name;

		this.terminalClient = null;
		this.filesystemClient = null;
		this.fetchClient = null;
		this.thinkingClient = null;
		this.context7Client = null;
	}

	async initMcpClient() {
		if (!this.terminalClient) {
			this.terminalClient = await createMCPClient({
				transport: new StdioMCPTransport({
					command: 'uvx',
					args: ['terminal_controller'],
				}),
			});
		}

		if (!this.filesystemClient) {
			this.filesystemClient = await createMCPClient({
				transport: new StdioMCPTransport({
					command: 'cmd',
					args: [
						"/c",
						"npx",
						"-y",
						"@modelcontextprotocol/server-filesystem@latest",
						"D:\\project\\java\\temp-reverse-project"
					],
				}),
			});
		}

		if (!this.fetchClient) {
			this.fetchClient = await createMCPClient({
				transport: new StdioMCPTransport({
					command: 'uvx',
					args: ['mcp-server-fetch'],
				}),
			});
		}
		if (!this.thinkingClient) {
			this.thinkingClient = await createMCPClient({
				transport: new StdioMCPTransport({
					command: "cmd",
					args: [
						"/c",
						"npx",
						"-y",
						"@modelcontextprotocol/server-sequential-thinking@latest"
					],
				}),
			});
		}
		if (!this.context7Client) {
			this.context7Client = await createMCPClient({
				transport: new StdioMCPTransport({
					command: "cmd",
					args: [
						"/c",
						"npx",
						"-y",
						"@upstash/context7-mcp@latest"
					]
				}),
			});
		}
	}

	async closeMcpClient() {
		if (this.terminalClient) {
			await this.terminalClient?.close();
		}

		if (this.filesystemClient) {
			await this.filesystemClient?.close();
		}

		if (this.fetchClient) {
			await this.fetchClient?.close();
		}
		if (this.thinkingClient) {
			await this.thinkingClient?.close();
		}
		if (this.context7Client) {
			await this.context7Client?.close();
		}
	}

	/**
	 * Validates authentication parameters - can be overridden by providers
	 * @param {object} params - Parameters to validate
	 */
	validateAuth(params) {
		// Default: require API key (most providers need this)
		if (!params.apiKey) {
			throw new Error(`${this.name} API key is required`);
		}
	}

	/**
	 * Validates common parameters across all methods
	 * @param {object} params - Parameters to validate
	 */
	validateParams(params) {
		// Validate authentication (can be overridden by providers)
		this.validateAuth(params);

		// Validate required model ID
		if (!params.modelId) {
			throw new Error(`${this.name} Model ID is required`);
		}

		// Validate optional parameters
		this.validateOptionalParams(params);
	}

	/**
	 * Validates optional parameters like temperature and maxTokens
	 * @param {object} params - Parameters to validate
	 */
	validateOptionalParams(params) {
		if (
			params.temperature !== undefined &&
			(params.temperature < 0 || params.temperature > 1)
		) {
			throw new Error('Temperature must be between 0 and 1');
		}
		if (params.maxTokens !== undefined && params.maxTokens <= 0) {
			throw new Error('maxTokens must be greater than 0');
		}
	}

	/**
	 * Validates message array structure
	 */
	validateMessages(messages) {
		if (!messages || !Array.isArray(messages) || messages.length === 0) {
			throw new Error('Invalid or empty messages array provided');
		}

		for (const msg of messages) {
			if (!msg.role || !msg.content) {
				throw new Error(
					'Invalid message format. Each message must have role and content'
				);
			}
		}
	}

	/**
	 * Common error handler
	 */
	handleError(operation, error) {
		const errorMessage = error.message || 'Unknown error occurred';
		log('error', `${this.name} ${operation} failed: ${errorMessage}`, {
			error
		});
		throw new Error(
			`${this.name} API error during ${operation}: ${errorMessage}`
		);
	}

	/**
	 * Creates and returns a client instance for the provider
	 * @abstract
	 */
	getClient(params) {
		throw new Error('getClient must be implemented by provider');
	}
	async getTools(params) {
		await this.initMcpClient();
		const toolSetOne = await this.terminalClient?.tools();
		const toolSetTwo = await this.filesystemClient?.tools();
		// const toolSetThree = await this.fetchClient?.tools();
		const thinkingTools = await this.thinkingClient?.tools();
		const context7Tools = await this.context7Client?.tools();
		return {
			...toolSetOne,
			...toolSetTwo,
			// ...toolSetThree, // note: this approach causes subsequent tool sets to override tools with the same name
			...thinkingTools,
			...context7Tools
		};
	}

	/**
	 * Returns if the API key is required
	 * @abstract
	 * @returns {boolean} if the API key is required, defaults to true
	 */
	isRequiredApiKey() {
		return true;
	}

	/**
	 * Returns the required API key environment variable name
	 * @abstract
	 * @returns {string|null} The environment variable name, or null if no API key is required
	 */
	getRequiredApiKeyName() {
		throw new Error('getRequiredApiKeyName must be implemented by provider');
	}

	/**
	 * Generates text using the provider's model
	 */
	async generateText(params) {
		try {
			this.validateParams(params);
			this.validateMessages(params.messages);

			log(
				'debug',
				`Generating ${this.name} text with model: ${params.modelId}`
			);

			const client = await this.getClient(params);
			let curtime  = Date.now();
			let sessionTime  = Date.now();
			// const tools = await this.getTools(params);
			const tools = params.tools;
			const result = await generateText({
				model: client(params.modelId),
				tools: tools,
				toolChoice: 'auto',
				experimental_activeTools: params.activeTools,
				experimental_continueSteps: true,
				messages: params.messages,
				maxSteps: 50,
				maxTokens: params.maxTokens,
				temperature: params.temperature,
				// abortSignal: AbortSignal.timeout(6000000),
				// experimental_repairToolCall: async ({
				// 										toolCall,
				// 										tools,
				// 										parameterSchema,
				// 										error,
				// 									}) => {
				// 	if (NoSuchToolError.isInstance(error)) {
				// 		return null; // do not attempt to fix invalid tool names
				// 	}
				//
				// 	const tool = tools[toolCall.toolName];
				//
				// 	const { object: repairedArgs } = await generateObject({
				// 		model: client(params.modelId),
				// 		schema: tool.parameters,
				// 		prompt: [
				// 			`The model tried to call the tool "${toolCall.toolName}"` +
				// 			` with the following arguments:`,
				// 			JSON.stringify(toolCall.args),
				// 			`The tool accepts the following schema:`,
				// 			JSON.stringify(parameterSchema(toolCall)),
				// 			'Please fix the arguments.',
				// 		].join('\n'),
				// 	});
				//
				// 	return { ...toolCall, args: JSON.stringify(repairedArgs) };
				// },


				experimental_prepareStep: async (prepareStepArgs) => {
					// when nothing is returned, the default settings are used
					log(
						'debug',
						`Generating prepareStep model: ${prepareStepArgs.model.modelId} ,stepNumber: ${prepareStepArgs.stepNumber} ,maxSteps: ${prepareStepArgs.maxSteps}`
					);
					curtime = Date.now();
				},

				experimental_transform: {
					transformMessages: async (currentMessages) => {
						// 基于消息数量截断
						let maxMessages = 100;
						if (currentMessages.length > maxMessages) {
							console.log(`Truncating ${currentMessages.length} messages to ${maxMessages}`);
							return this.truncateByCount(currentMessages, maxMessages);
						}

						// 基于 token 数量截断
						const tokenCount = this.estimateTokenCount(currentMessages);
						let maxTokens = 20480;
						if (tokenCount > maxTokens) {
							console.log(`Truncating ${tokenCount} tokens to ~${maxTokens}`);
							return await this.truncateByTokens(currentMessages, maxTokens);
						}

						return currentMessages;
					}
				},
				experimental_repairToolCall: async ({
														toolCall,
														tools,
														error,
														messages,
														system,
													}) => {
					const result = await generateText({
							model: client(params.modelId),
						system,
						messages: [
							...messages,
							{
								role: 'assistant',
								content: [
									{
										type: 'tool-call',
										toolCallId: toolCall.toolCallId,
										toolName: toolCall.toolName,
										args: toolCall.args,
									},
								],
							},
							{
								role: 'tool',
								content: [
									{
										type: 'tool-result',
										toolCallId: toolCall.toolCallId,
										toolName: toolCall.toolName,
										result: error.message,
									},
								],
							},
						],
						tools,
					});

					const newToolCall = result.toolCalls.find(
						newToolCall => newToolCall.toolName === toolCall.toolName,
					);

					return newToolCall != null
						? {
							toolCallType: 'function',
							toolCallId: toolCall.toolCallId,
							toolName: toolCall.toolName,
							args: JSON.stringify(newToolCall.args),
						}
						: null;
				},

				onStepFinish(onStepFinishArgs) {
					// your own logic, e.g. for saving the chat history or recording usage
					const toolName = onStepFinishArgs.toolCalls[0]?.toolName;
					let toolArgs = null;
					let toolRes = null;
					if (toolName === 'read_file' || toolName === 'write_file'){
						toolArgs = onStepFinishArgs.toolCalls[0]?.args.size;
						toolRes = onStepFinishArgs.toolResults[0]?.result?.content.size;
					}else {
						toolArgs = JSON.stringify(onStepFinishArgs.toolCalls[0]?.args);
						toolRes = JSON.stringify(onStepFinishArgs.toolResults[0]?.result?.content);
					}
					log(
						'debug',
						`Generating onStepFinish text: ${onStepFinishArgs.text} ,toolCalls: ${onStepFinishArgs.toolCalls[0]?.toolName} usage: ${onStepFinishArgs.usage?.totalTokens} ,time: ${Date.now() - curtime} \\n,args: ${toolArgs} \\n,toolResults: ${toolRes}`
					);

				},
			});

			log(
				'debug',
				`${this.name} generateText completed successfully for model: ${params.modelId} , tools call: ${result.steps} time: ${Date.now() - sessionTime}`
			);

			return {
				messages: result.response.messages,
				toolResults: result.toolResults,
				steps: result.steps,
				text: result.text,
				finishReason: result.finishReason,
				usage: {
					inputTokens: result.usage?.promptTokens,
					outputTokens: result.usage?.completionTokens,
					totalTokens: result.usage?.totalTokens
				}
			};
		} catch (error) {
			this.handleError('text generation', error);
		}finally {
			await this.closeMcpClient();
		}
	}

	/**
	 * Streams text using the provider's model
	 */
	async streamText(params) {
		try {
			this.validateParams(params);
			this.validateMessages(params.messages);

			log('debug', `Streaming ${this.name} text with model: ${params.modelId}`);

			const client = await this.getClient(params);
			let curtime  = Date.now();
			// const tools = await this.getTools(params);
			const stream = await streamText({
				model: client(params.modelId),
				tools: params.tools,
				toolChoice: 'auto',
				experimental_activeTools: params.activeTools,
				experimental_continueSteps: true,
				messages: params.messages,
				maxSteps: 50,
				maxTokens: params.maxTokens,
				temperature: params.temperature,
				onStepFinish(onStepFinishArgs) {
					// your own logic, e.g. for saving the chat history or recording usage
					const toolName = onStepFinishArgs.toolCalls[0]?.toolName;
					let toolArgs = null;
					let toolRes = null;
					if (toolName === 'read_file' || toolName === 'write_file'){
						toolArgs = onStepFinishArgs.toolCalls[0]?.args.size;
						toolRes = onStepFinishArgs.toolResults[0]?.result?.content.size;
					}else {
						toolArgs = JSON.stringify(onStepFinishArgs.toolCalls[0]?.args);
						toolRes = JSON.stringify(onStepFinishArgs.toolResults[0]?.result?.content);
					}
					log(
						'debug',
						`streamText Generating onStepFinish text: ${onStepFinishArgs.text} ,stepType: ${onStepFinishArgs.stepType} ,stepNumber: ${onStepFinishArgs.stepNumber} ,toolCalls: ${onStepFinishArgs.toolCalls[0]?.toolName} usage: ${onStepFinishArgs.usage?.totalTokens} ,time: ${Date.now() - curtime} \\n,args: ${toolArgs} \\n,toolResults: ${toolRes} `
					);

					curtime  = Date.now();

				},
				onFinish(onFinishArgs) {
					log(
						'debug',
						`streamText Generating onFinish `
					);
				}
			});

			log(
				'debug',
				`${this.name} streamText initiated successfully for model: ${params.modelId}`
			);

			return stream;
		} catch (error) {
			this.handleError('text streaming', error);
		}
	}

	/**
	 * Generates a structured object using the provider's model
	 */
	async generateObject(params) {
		try {
			this.validateParams(params);
			this.validateMessages(params.messages);

			if (!params.schema) {
				throw new Error('Schema is required for object generation');
			}
			if (!params.objectName) {
				throw new Error('Object name is required for object generation');
			}

			log(
				'debug',
				`Generating ${this.name} object ('${params.objectName}') with model: ${params.modelId}`
			);

			const client = await this.getClient(params);
			const result = await generateObject({
				model: client(params.modelId),
				messages: params.messages,
				schema: zodSchema(params.schema),
				mode: params.mode || 'auto',
				maxTokens: params.maxTokens,
				temperature: params.temperature
			});

			log(
				'debug',
				`${this.name} generateObject completed successfully for model: ${params.modelId}`
			);

			return {
				object: result.object,
				usage: {
					inputTokens: result.usage?.promptTokens,
					outputTokens: result.usage?.completionTokens,
					totalTokens: result.usage?.totalTokens
				}
			};
		} catch (error) {
			// Check if this is a JSON parsing error that we can potentially fix
			if (
				NoObjectGeneratedError.isInstance(error) &&
				JSONParseError.isInstance(error.cause) &&
				error.cause.text
			) {
				log(
					'warn',
					`${this.name} generated malformed JSON, attempting to repair...`
				);

				try {
					// Use jsonrepair to fix the malformed JSON
					const repairedJson = jsonrepair(error.cause.text);
					const parsed = JSON.parse(repairedJson);

					log('info', `Successfully repaired ${this.name} JSON output`);

					// Return in the expected format
					return {
						object: parsed,
						usage: {
							// Extract usage information from the error if available
							inputTokens: error.usage?.promptTokens || 0,
							outputTokens: error.usage?.completionTokens || 0,
							totalTokens: error.usage?.totalTokens || 0
						}
					};
				} catch (repairError) {
					log(
						'error',
						`Failed to repair ${this.name} JSON: ${repairError.message}`
					);
					// Fall through to handleError with original error
				}
			}

			this.handleError('object generation', error);
		}
	}

	truncateByCount(messages, maxCount) {
		const systemMessages = messages.filter(m => m.role === 'system');
		const otherMessages = messages.filter(m => m.role !== 'system');
		const keepCount = Math.max(1, maxCount - systemMessages.length);

		return [
			...systemMessages,
			...otherMessages.slice(-keepCount)
		];
	}

	estimateTokenCount(messages) {
		// 简单估算：每个字符约 0.25 token
		return messages.reduce((total, msg) => {
			return total + (msg.content?.length || 0) * 0.25;
		}, 0);
	}

	async truncateByTokens(messages, maxTokens) {
		// 实现基于 token 的截断逻辑
		// ... (使用前面提到的 tiktoken 方法)
		return messages; // 简化示例
	}



}
