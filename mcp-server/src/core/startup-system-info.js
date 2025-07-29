/**
 * startup-system-info.js
 * 启动时系统信息收集模块
 * 在MCP服务器启动完成后异步收集并上报系统信息
 */

import { getSystemInfo } from '../../../scripts/modules/task-manager/system-info.js';
import logger from '../logger.js';

/**
 * 启动时系统信息收集和上报
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {number} options.delay - 延迟执行时间（毫秒），默认2000ms
 * @param {boolean} options.enabled - 是否启用，默认true
 * @returns {Promise<boolean>} - 执行结果
 */
export async function collectStartupSystemInfo(options = {}) {
	const {
		logger: log = logger,
		delay = 2000,
		enabled = true
	} = options;

	// 检查是否启用启动时系统信息收集
	const startupInfoEnabled = process.env.MCP_STARTUP_SYSTEM_INFO_ENABLED !== 'false';
	
	if (!enabled || !startupInfoEnabled) {
		log.info('启动时系统信息收集功能已禁用');
		return false;
	}

	try {
		log.info('准备收集启动时系统信息...');
		
		// 延迟执行，确保不阻塞服务器启动
		await new Promise(resolve => setTimeout(resolve, delay));
		
		// 创建完整的console兼容日志对象
		// 系统信息模块期望的是一个完整的console兼容对象，不是简单的函数
		const loggerCompat = {
			info: (msg) => log.info(`[系统信息] ${msg}`),
			debug: (msg) => log.debug(`[系统信息] ${msg}`),
			error: (msg) => log.error(`[系统信息] ${msg}`),
			warn: (msg) => log.warn(`[系统信息] ${msg}`),
			log: (msg) => log.info(`[系统信息] ${msg}`)
		};

		// 系统信息模块也会直接调用 options.mcpLog() 作为函数
		// 所以我们需要创建一个既是函数又有console方法的对象
		const mcpLogFunction = (msg) => log.info(`[系统信息] ${msg}`);
		Object.assign(mcpLogFunction, loggerCompat);

		// 创建上下文对象
		const context = {
			mcpLog: mcpLogFunction, // 既是函数又有console方法
			source: 'taskmaster-mcp-startup', // 标识来源
			trigger: 'mcp_server_startup' // 标识触发方式
		};
		
		// 收集系统信息（这会自动触发Webhook上报）
		const result = await getSystemInfo({}, context, 'json');
		
		if (result && result.systemInfo) {
			log.info('启动时系统信息收集完成');
			log.debug(`系统信息: ${JSON.stringify(result.systemInfo, null, 2)}`);
			return true;
		} else {
			log.warn('启动时系统信息收集返回空结果');
			return false;
		}
		
	} catch (error) {
		log.error(`启动时系统信息收集失败: ${error.message}`);
		return false;
	}
}

/**
 * 异步启动系统信息收集（不等待结果）
 * @param {Object} options - 配置选项
 */
export function collectStartupSystemInfoAsync(options = {}) {
	// 使用 setImmediate 确保异步执行，不阻塞主线程
	setImmediate(() => {
		collectStartupSystemInfo(options).catch(error => {
			const log = options.logger || logger;
			log.error(`异步系统信息收集失败: ${error.message}`);
		});
	});
} 