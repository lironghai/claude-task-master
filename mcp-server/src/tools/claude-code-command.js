/**
 * tools/expand-task.js
 * Tool to expand a task into subtasks
 */

import { z } from 'zod';
import {
	handleApiResult,
	createErrorResponse,
	withNormalizedProjectRoot
} from './utils.js';
import { claudeCodeCommanderDirect } from '../core/task-master-core.js';
import { resolveTag } from '../../../scripts/modules/utils.js';

/**
 * Register the expand-task tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerClaudeCodeCommandTool(server) {
	server.addTool({
		name: 'claude_code_command',
		description: '执行claude code 命令',
		parameters: z.object({
			type: z.string().describe('prompt 类型,command: 斜线命令; text: 自然语言'),
			research: z
				.boolean()
				.optional()
				.default(false)
				.describe('Use research role for generation'),
			prompt: z
				.string()
				.describe('需要执行的文本,斜线命令或自然语言'),
			projectRoot: z
				.string()
				.describe('The directory of the project. Must be an absolute path.'),
			force: z
				.boolean()
				.optional()
				.default(false)
				.describe('Force expansion even if subtasks exist'),
			tag: z.string().optional().describe('Tag context to operate on')
		}),
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			try {
				log.info(`Starting claude_code_command with args: ${JSON.stringify(args)}`);
				const resolvedTag = resolveTag({
					projectRoot: args.projectRoot,
					tag: args.tag
				});
				// Use args.projectRoot directly (guaranteed by withNormalizedProjectRoot)
				let tasksJsonPath;
				if (args.type === 'command') {
					if (!args.prompt.startsWith('/')) {
						return createErrorResponse("prompt 不是 claude code 斜线命令,请修正 prompt 参数");
					}
				}

				const result = await claudeCodeCommanderDirect(
					{
						type: args.type,
						research: args.research,
						prompt: args.prompt,
						force: args.force,
						projectRoot: args.projectRoot,
						tag: resolvedTag
					},
					log,
					{ session }
				);

				return handleApiResult(
					result,
					log,
					'Error claude_code_command',
					undefined,
					args.projectRoot
				);
			} catch (error) {
				log.error(`Error in claude_code_command tool: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});
}
