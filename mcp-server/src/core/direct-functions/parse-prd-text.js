/**
 * parse-prd.js
 * Direct function implementation for parsing PRD documents
 */

import path from 'path';
import fs from 'fs';
import { randomUUID } from "node:crypto";
import { createLogWrapper } from '../../tools/utils.js';

/**
 * Direct function wrapper for parsing PRD documents and generating tasks.
 *
 * @param {Object} args - Command arguments containing projectRoot, input, output, numTasks options.
 * @param {string} args.input - Path to the input PRD file.
 * @param {string} args.output - Path to the output directory.
 * @param {string} args.numTasks - Number of tasks to generate.
 * @param {boolean} args.force - Whether to force parsing.
 * @param {boolean} args.append - Whether to append to the output file.
 * @param {boolean} args.research - Whether to use research mode.
 * @param {string} args.tag - Tag context for organizing tasks into separate task lists.
 * @param {Object} log - Logger object.
 * @param {Object} context - Context object containing session data.
 * @returns {Promise<Object>} - Result object with success status and data/error information.
 */
export async function parsePRDTextDirect(args, log, context = {}) {
	const { session, reportProgress } = context;
	// Extract projectRoot from args
	const {
		prdText: inputArg,
		prdFileName,
		output: outputArg,
		numTasks: numTasksArg,
		force,
		append,
		research,
		projectRoot,
		tag
	} = args;

	// Create the standard logger wrapper
	const logWrapper = createLogWrapper(log);

	// --- Input Validation and Path Resolution ---
	if (!projectRoot) {
		logWrapper.error('parsePRDTextDirect requires a projectRoot argument.');
		return {
			success: false,
			error: {
				code: 'MISSING_ARGUMENT',
				message: 'projectRoot is required.'
			}
		};
	}

	// Resolve input path using path utilities
	const currentDate = new Date().toISOString().split('T')[0];
	let fileName = prdFileName;
	if (!fileName) {
		fileName = randomUUID() + '_prd.md';
	}
	let inputPath = '.taskmaster/docs/' + currentDate + '/' + fileName;

	const filePath = projectRoot + "/" + inputPath;
	const inputDir = path.dirname(filePath);
	try {
		if (!fs.existsSync(inputDir)) {
			logWrapper.info(`Creating input directory: ${inputDir}`);
			fs.mkdirSync(inputDir, { recursive: true });
		}
	} catch (error) {
		const errorMsg = `Failed to create input directory ${inputDir}: ${error.message}`;
		logWrapper.error(errorMsg);
		return {
			success: false,
			error: { code: 'DIRECTORY_CREATE_FAILED', message: errorMsg }
		};
	}

	// Write back to file
	fs.writeFileSync(filePath, inputArg, 'utf8');

	return {
		prdPath: inputPath,
	}

}
