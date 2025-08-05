import { FastMCP } from 'fastmcp';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from './logger.js';
import { registerTaskMasterTools } from './tools/index.js';
import ProviderRegistry from '../../src/provider-registry/index.js';
import { MCPProvider } from './providers/mcp-provider.js';
import { collectStartupSystemInfoAsync } from './core/startup-system-info.js';

// Load environment variables
dotenv.config();

// Constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main MCP server class that integrates with Task Master
 */
class TaskMasterMCPServer {
	constructor() {
		// Get version from package.json using synchronous fs
		const packagePath = path.join(__dirname, '../../package.json');
		const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

		this.options = {
			name: 'Task Master MCP Server',
			version: packageJson.version
		};

		this.server = new FastMCP(this.options);
		this.initialized = false;

		// Bind methods
		this.init = this.init.bind(this);
		this.start = this.start.bind(this);
		this.stop = this.stop.bind(this);

		// Setup logging
		this.logger = logger;
	}

	/**
	 * Initialize the MCP server with necessary tools and routes
	 */
	async init() {
		if (this.initialized) return;

		// Pass the manager instance to the tool registration function
		registerTaskMasterTools(this.server, this.asyncManager);

		this.initialized = true;

		return this;
	}

	/**
	 * Start the MCP server
	 */
	async start() {
		if (!this.initialized) {
			await this.init();
		}

		this.server.on('connect', (event) => {
			event.session.server.sendLoggingMessage({
				data: {
					context: event.session.context,
					message: `MCP Server connected: ${event.session.name}`
				},
				level: 'info'
			});
			this.registerRemoteProvider(event.session);
		});

		// Start the FastMCP server with increased timeout
		// await this.server.start({
		// 	transportType: 'stdio',
		// 	timeout: 1200000 // 2 minutes timeout (in milliseconds)
		// });

		const startOptions = {
			timeout: 1200000 // 2 minutes timeout (in milliseconds)
		};

		if (process.env.ENABLE_SSE === 'true') {
			// httpStream: {
			// 	enableJsonResponse?: boolean;
			// 	endpoint?: `/${string}`;
			// 	eventStore?: EventStore;
			// 	port: number;
			// };
			startOptions.transportType = 'httpStream';
			startOptions.httpStream = {
				endpoint: '/mcp',
				port: process.env.MCP_SSE_PORT ? parseInt(process.env.MCP_SSE_PORT, 10) : 3000
			};
			logger.info(`Starting MCP server with httpStream transport on port ${startOptions.httpStream.port}`);
		} else {
			startOptions.transportType = 'stdio';
			logger.info('Starting MCP server with STDIO transport (SSE disabled)');
		}

		// Start the FastMCP server with increased timeout
		await this.server.start(startOptions);

		// 🆕 启动完成后异步收集系统信息
		this.logger.info('MCP服务器启动完成，准备收集系统信息...');
		collectStartupSystemInfoAsync({
			logger: this.logger,
			delay: 2000, // 2秒延迟
			enabled: true
		});

		return this;
	}

	/**
	 * Register both MCP providers with the provider registry
	 */
	registerRemoteProvider(session) {
		// Check if the server has at least one session
		if (session) {
			// Make sure session has required capabilities
			if (!session.clientCapabilities || !session.clientCapabilities.sampling) {
				session.server.sendLoggingMessage({
					data: {
						context: session.context,
						message: `MCP session missing required sampling capabilities, providers not registered`
					},
					level: 'info'
				});
				return;
			}

			// Register MCP provider with the Provider Registry

			// Register the unified MCP provider
			const mcpProvider = new MCPProvider();
			mcpProvider.setSession(session);

			// Register provider with the registry
			const providerRegistry = ProviderRegistry.getInstance();
			providerRegistry.registerProvider('mcp', mcpProvider);

			session.server.sendLoggingMessage({
				data: {
					context: session.context,
					message: `MCP Server connected`
				},
				level: 'info'
			});
		} else {
			session.server.sendLoggingMessage({
				data: {
					context: session.context,
					message: `No MCP sessions available, providers not registered`
				},
				level: 'warn'
			});
		}
	}

	/**
	 * Stop the MCP server
	 */
	async stop() {
		if (this.server) {
			await this.server.stop();
		}
	}
}

export default TaskMasterMCPServer;
