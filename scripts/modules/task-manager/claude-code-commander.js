import fs from 'fs';
import path from 'path';

import {
	log,
	isSilentMode,
} from '../utils.js';

import { generateTextService } from '../ai-services-unified.js';

import {
	getDebugFlag,
} from '../config-manager.js';
import { findProjectRoot } from '../utils.js';
import {spawn} from "child_process";


/**
 * Expand a task into subtasks using the unified AI service (generateTextService).
 * Appends new subtasks by default. Replaces existing subtasks if force=true.
 * Integrates complexity report to determine subtask count and prompt if available,
 * unless numSubtasks is explicitly provided.
 * @param {string} type -
 * @param {string} command -
 * @param {Object} context - Context object containing session and mcpLog.
 * @param {Object} [context.session] - Session object from MCP.
 * @param {Object} [context.mcpLog] - MCP logger object.
 * @param {string} [context.projectRoot] - Project root path
 * @param {boolean} [force=false] - If true, replace existing subtasks; otherwise, append.
 * @returns {Promise<Object>} The updated parent task object with new subtasks.
 * @throws {Error} If task not found, AI service fails, or parsing fails.
 */
async function processClaudeCodeCommander(
	type,
	command,
	context = {},
	force = false
) {
	const {
		session,
		mcpLog,
		projectRoot: contextProjectRoot,
	} = context;
	const outputFormat = mcpLog ? 'json' : 'text';

	// Determine projectRoot: Use from context if available, otherwise derive from tasksPath
	const projectRoot = contextProjectRoot || findProjectRoot(tasksPath);

	// Use mcpLog if available, otherwise use the default console log wrapper
	const logger = mcpLog || {
		info: (msg) => !isSilentMode() && log('info', msg),
		warn: (msg) => !isSilentMode() && log('warn', msg),
		error: (msg) => !isSilentMode() && log('error', msg),
		debug: (msg) =>
			!isSilentMode() && getDebugFlag(session) && log('debug', msg) // Use getDebugFlag
	};

	if (mcpLog) {
		logger.info(`expandTask called with context: session=${!!session}`);
	}

	if (!command) {
		return  {
			success: false,
			aiServiceResponse: "No command provided"
		};
	}

	try {
		// --- Task Loading/Filtering (Unchanged) ---
		logger.info(`claude code commander path: ${projectRoot} ,exec: ${command}`);

		let aiServiceResponse = null;
		let success = false;

		try {
			const child = spawn('claude --output-format stream-json --verbose --permission-mode bypassPermissions', [command], { cwd: projectRoot });

			child.stdout.on('data', (data) => {
				console.log(`stdout: ${data}`);
				logger.info(
					`[claude code commander process] ${data} `
				);
				aiServiceResponse += data;
			});

			child.stderr.on('data', (data) => {
				logger.error(
					`[claude code commander error] ${data} `
				);
			});

			child.on('close', (code) => {
				logger.error(
					`[claude code commander close] code ${code} `
				);
			});

			logger.info(
				`Successfully claude code commander ${aiServiceResponse.length} .`
			);
			success = true;
		} catch (error) {
			logger.error(
				`Error claude code commander: ${error.stderr.toString()}`, // Added task ID context
				'error'
			);
			if (outputFormat === 'text' && getDebugFlag(session)) {
				console.log('stdout:', error.stdout.toString());
				console.log('stderr:', error.stderr.toString());
			}
			throw error;
		}

		// Return the updated task object AND telemetry data
		return {
			success,
			aiServiceResponse
		};
	} catch (error) {
		// Catches errors from file reading, parsing, AI call etc.
		logger.error(`Error claude code commander: ${error.message}`, 'error');
		if (outputFormat === 'text' && getDebugFlag(session)) {
			console.error(error); // Log full stack in debug CLI mode
		}
		throw error; // Re-throw for the caller
	}
}

export default processClaudeCodeCommander;
