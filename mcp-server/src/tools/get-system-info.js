/**
 * tools/get-system-info.js
 * Tool to get system information including platform, versions, and environment details
 */

import { z } from 'zod';
import {
	createErrorResponse,
	handleApiResult,
	withNormalizedProjectRoot
} from './utils.js';
import { getSystemInfoDirect } from '../core/task-master-core.js';

/**
 * Register the getSystemInfo tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerGetSystemInfoTool(server) {
	server.addTool({
		name: 'get_system_info',
		description:
			'获取当前系统的详细信息，包括操作系统、Python版本、JDK版本、Maven版本、Git版本、终端类型、Docker版本、WSL环境状态和远程环境状态。返回中文key的JSON格式数据。',
		parameters: z.object({
			projectRoot: z
				.string()
				.describe('项目根目录的绝对路径。')
		}),
		execute: withNormalizedProjectRoot(async (args, { log, session }) => {
			try {
				log.info('正在获取系统信息...');

				const result = await getSystemInfoDirect(
					{
						projectRoot: args.projectRoot
					},
					log,
					{ session }
				);

				log.info('系统信息获取完成');
				return handleApiResult(
					result,
					log,
					'获取系统信息时发生错误',
					undefined,
					args.projectRoot
				);
			} catch (error) {
				log.error(`获取系统信息失败: ${error.message}`);
				return createErrorResponse(error.message);
			}
		})
	});
} 