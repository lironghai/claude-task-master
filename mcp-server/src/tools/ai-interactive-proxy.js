/**
 * tools/ai-interactive-proxy.js
 * Tool to proxy AI model interactions with session management
 */

// TEMPORARY: Using zod/v3 for Draft-07 JSON Schema compatibility with FastMCP's zod-to-json-schema
// TODO: Revert to 'zod' when MCP spec issue is resolved (see PR #1323)
import { z } from 'zod/v3';
import {
	createErrorResponse,
	handleApiResult,
	withNormalizedProjectRoot
} from './utils.js';
import { aiInteractiveProxyDirect } from '../core/task-master-core.js';

/**
 * Register the ai_interactive_proxy tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerAiInteractiveProxyTool(server) {
	server.addTool({
		name: 'ai_interactive_proxy',
		description:
			'Proxy AI model interactions with session management. This tool allows you to have conversational interactions with AI models (Claude, OpenAI, etc.) using the project-configured LLM provider. Use sessionId to continue previous conversations.',

		parameters: z.object({
			path: z
				.string()
				.describe(
					'Project root path (absolute path). Used to load project-specific AI provider configuration.'
				),
			prompt: z
				.string()
				.describe(
					'User prompt - the question or request you want to send to the AI model.'
				),
			sys_prompt: z
				.string()
				.optional()
				.describe(
					'System prompt to define AI behavior and context. Only used when creating a new session. If not provided, a default helpful assistant prompt is used.'
				),
			sessionId: z
				.string()
				.optional()
				.describe(
					'Session ID (UUID) to continue a previous conversation. If not provided, a new session will be created. Use the sessionId returned from previous calls to maintain conversation context.'
				)
		}),
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			try {
				log.info(
					`AI Interactive Proxy: Processing request with ${args.sessionId ? 'existing' : 'new'} session`
				);

				// Call the direct function
				const result = await aiInteractiveProxyDirect(
					{
						path: args.path,
						prompt: args.prompt,
						sys_prompt: args.sys_prompt,
						sessionId: args.sessionId
					},
					log,
					{ session }
				);

				return handleApiResult(
					result,
					log,
					'Error in AI interactive proxy',
					undefined,
					args.path
				);
			} catch (error) {
				log.error(`Error in ai_interactive_proxy tool: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});
}

