/**
 * get-system-info.js
 * Direct function implementation for retrieving system information
 * This is a wrapper that calls the core system-info module
 */

import { getSystemInfo } from '../../../../scripts/modules/task-manager/system-info.js';

/**
 * MCP Direct function wrapper for system information collection
 * This function calls the core getSystemInfo module and formats the response for MCP
 * @param {Object} args - MCP arguments object
 * @param {Object} log - MCP logger object  
 * @param {Object} context - MCP context object (optional)
 * @returns {Object} - MCP-formatted response object
 */
export async function getSystemInfoDirect(args, log, context = {}) {
	try {
		// Create context object for the core module
		const coreContext = {
			mcpLog: log,
			session: context.session
		};
		
		// Call the core system-info module with json output format for MCP
		const result = await getSystemInfo({}, coreContext, 'json');
		
		return {
			success: true,
			data: result.systemInfo
		};
	} catch (error) {
		log.error(`获取系统信息时发生错误: ${error.message}`);
		return {
			success: false,
			error: {
				code: 'SYSTEM_INFO_ERROR',
				message: error.message || '获取系统信息时发生未知错误'
			}
		};
	}
} 