import path from 'path';
import fs from 'fs';
import { generateProjectOutline } from '../../../../scripts/modules/task-manager/project-outline.js';
import {
	enableSilentMode,
	disableSilentMode,
	isSilentMode
} from '../../../../scripts/modules/utils.js';
import { createLogWrapper } from '../../tools/utils.js';

/**
 * Direct function wrapper for generating project outline.
 *
 * @param {Object} args - Command arguments containing projectRoot, output, etc.
 * @param {Object} log - Logger object.
 * @param {Object} context - Context object containing session data.
 * @returns {Promise<Object>} - Result object with success status and data/error information.
 */
export async function projectOutlineDirect(args, log, context = {}) {
	const { session } = context;
	const { output: outputArg, projectRoot } = args;

	const logWrapper = createLogWrapper(log);

	if (!projectRoot) {
		logWrapper.error('projectOutlineDirect requires a projectRoot argument.');
		return {
			success: false,
			error: {
				code: 'MISSING_ARGUMENT',
				message: 'projectRoot is required.'
			}
		};
	}

	const outputPath = outputArg
		? path.resolve(projectRoot, outputArg)
		: path.resolve(projectRoot, 'docs', 'project-outline.md');

	const outputDir = path.dirname(outputPath);
	try {
		if (!fs.existsSync(outputDir)) {
			logWrapper.info(`Creating output directory: ${outputDir}`);
			fs.mkdirSync(outputDir, { recursive: true });
		}
	} catch (dirError) {
		logWrapper.error(
			`Failed to create output directory ${outputDir}: ${dirError.message}`
		);
		return {
			success: false,
			error: {
				code: 'DIRECTORY_CREATION_ERROR',
				message: `Failed to create output directory: ${dirError.message}`
			}
		};
	}

	const wasSilent = isSilentMode();
	if (!wasSilent) {
		enableSilentMode();
	}

	try {
		logWrapper.info(
			`Generating project outline. Output: ${outputPath}, ProjectRoot: ${projectRoot}`
		);
		const result = await generateProjectOutline({
			projectRoot,
			output: outputPath,
			session
		});
		return {
			success: true,
			data: result
		};
	} catch (error) {
		logWrapper.error(`Error generating project outline: ${error.message}`);
		return {
			success: false,
			error: {
				code: 'OUTLINE_GENERATION_ERROR',
				message: error.message
			}
		};
	} finally {
		if (!wasSilent) {
			disableSilentMode();
		}
	}
} 