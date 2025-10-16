/**
 * expand-task.js
 * Direct function implementation for expanding a task into subtasks
 */

import processClaudeCodeCommander from '../../../../scripts/modules/task-manager/claude-code-commander.js';
import {
	enableSilentMode,
	disableSilentMode,
	isSilentMode
} from '../../../../scripts/modules/utils.js';
import path from 'path';
import fs from 'fs';
import { createLogWrapper } from '../../tools/utils.js';

/**
 * Direct function wrapper for expanding a task into subtasks with error handling.
 *
 * @param {Object} args - Command arguments
 * @param {string} args.type - Explicit path to the tasks.json file.
 * @param {boolean} [args.research] - Enable research role for subtask generation.
 * @param {string} [args.prompt] - Additional context to guide subtask generation.
 * @param {boolean} [args.force] - Force expansion even if subtasks exist.
 * @param {string} [args.projectRoot] - Project root directory.
 * @param {string} [args.tag] - Tag for the task
 * @param {Object} log - Logger object
 * @param {Object} context - Context object containing session
 * @param {Object} [context.session] - MCP Session object
 * @returns {Promise<Object>} - Task expansion result { success: boolean, data?: any, error?: { code: string, message: string } }
 */
export async function claudeCodeCommanderDirect(args, log, context = {}) {
	const { session } = context; // Extract session
	// Destructure expected args, including projectRoot
	const {
		type,
		prompt,
		force,
		projectRoot,
		tag,
		complexityReportPath
	} = args;

	// Log session root data for debugging
	log.info(
		`Session data in expandTaskDirect: ${JSON.stringify({
			hasSession: !!session,
			sessionKeys: session ? Object.keys(session) : [],
			roots: session?.roots,
			rootsStr: JSON.stringify(session?.roots)
		})}`
	);

	// Check if tasksJsonPath was provided
	if (!prompt || !type) {
		log.error('expandTaskDirect called without tasksJsonPath');
		return {
			success: false,
			error: {
				code: 'MISSING_ARGUMENT',
				message: 'tasksJsonPath is required'
			}
		};
	}

	// Process other parameters
	const forceFlag = force === true;

		log.info(
			`[expandTaskDirect] projectRoot ${projectRoot} command ${command} . Research: ${useResearch}, Force: ${forceFlag}`
		);

		// Create logger wrapper using the utility
		const mcpLog = createLogWrapper(log);

		let wasSilent; // Declare wasSilent outside the try block
		// Process the request
		try {
			// Enable silent mode to prevent console logs from interfering with JSON response
			wasSilent = isSilentMode(); // Assign inside the try block
			if (!wasSilent) enableSilentMode();

			// Call the core expandTask function with the wrapped logger and projectRoot
			const coreResult = await processClaudeCodeCommander(
				type,
				prompt,
				{
					complexityReportPath,
					mcpLog,
					session,
					projectRoot,
					commandName: 'claude-code-command',
					outputType: 'mcp',
					tag
				},
				forceFlag
			);

			// Return the result, including telemetryData
			log.info(
				`Successfully expanded task ${taskId} with ${subtasksAdded} new subtasks`
			);
			return {
				success: true,
				data: {
					telemetryData: coreResult.telemetryData,
					result: coreResult
				}
			};
		} catch (error) {
			// Make sure to restore normal logging even if there's an error
			if (!wasSilent && isSilentMode()) disableSilentMode();

			log.error(`Error expanding task: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'CORE_FUNCTION_ERROR',
					message: error.message || 'Failed to expand task'
				}
			};
		}
}
