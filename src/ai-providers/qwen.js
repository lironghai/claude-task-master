/**
 * src/ai-providers/qwen.js
 *
 * Implementation for interacting with Qwen models through OpenRouter using the Vercel AI SDK.
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { BaseAIProvider } from './base-provider.js';
import {spawn} from "child_process";
import {createOpenAI} from "@ai-sdk/openai";
import {createClaudeCode} from "./custom-sdk/qwen-code/index.js";

export class QwenAIProvider extends BaseAIProvider {
	constructor() {
		super();
		this.name = 'Qwen-CLI';
	}

	/**
	 * Creates and returns an OpenAI client instance.
	 * @param {object} params - Parameters for client initialization
	 * @param {string} params.apiKey - OpenAI API key
	 * @param {string} [params.baseURL] - Optional custom API endpoint
	 * @returns {Function} OpenAI client function
	 * @throws {Error} If API key is missing or initialization fails
	 */
	getClient(params) {
		try {
			return createClaudeCode({
				defaultSettings: params
			});
		} catch (error) {
			this.handleError('client initialization', error);
		}
	}

	getRequiredApiKeyName() {
		return 'QWEN_API_KEY';
	}

	isRequiredApiKey() {
		return false;
	}

	validateAuth(params) {
		// Claude Code doesn't require an API key
		// No validation needed
	}

}