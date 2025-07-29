import path from 'path';
import fs from 'fs';
import { generateProjectCodeInit } from '../../../../scripts/modules/task-manager/project-code-init.js';
import {
	enableSilentMode,
	disableSilentMode,
	isSilentMode
} from '../../../../scripts/modules/utils.js';
import { createLogWrapper } from '../../tools/utils.js';
import os from 'os';

/**
 * Direct function wrapper for generating project outline.
 *
 * @param {Object} args - Command arguments containing projectRoot, output, etc.
 * @param {Object} log - Logger object.
 * @param {Object} context - Context object containing session data.
 * @returns {Promise<Object>} - Result object with success status and data/error information.
 */
export async function projectCodeInitDirect(args, log, context = {}) {
	const { session } = context;
	const { output: outputArg, projectRoot } = args;

	const homeDir = os.homedir();

	log.info(`Args received in direct function: ${JSON.stringify(args)}`);

	// --- Determine Target Directory ---
	// TRUST the projectRoot passed from the tool layer via args
	// The HOF in the tool layer already normalized and validated it came from a reliable source (args or session)
	const targetDirectory = args.projectRoot;

	// --- Validate the targetDirectory (basic sanity checks) ---
	if (
		!targetDirectory ||
		typeof targetDirectory !== 'string' || // Ensure it's a string
		targetDirectory === '/' ||
		targetDirectory === homeDir
	) {
		log.error(
			`Invalid target directory received from tool layer: '${targetDirectory}'`
		);
		return {
			success: false,
			error: {
				code: 'INVALID_TARGET_DIRECTORY',
				message: `Cannot initialize project: Invalid target directory '${targetDirectory}' received. Please ensure a valid workspace/folder is open or specified.`,
				details: `Received args.projectRoot: ${args.projectRoot}` // Show what was received
			},
			fromCache: false
		};
	}


	process.chdir(targetDirectory);
	const logWrapper = createLogWrapper(log);

	if (!projectRoot) {
		logWrapper.error('projectCodeInitDirect requires a projectRoot argument.');
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
		const result = await generateProjectCodeInit({
			projectRoot,
			output: outputPath,
			session,
			logWrapper
		});

		const	resultData = {
					next_step:
						'现在项目代码初始化任务清单已经生成，下一步是通过执行任务清单中具体任务。任务清单是自动执行要求和流程，帮助用户按顺序主动执行这些任务，以一级任务为单位执行，其中包含的子任务含顺序执行。',
					...result
				};
		return {
			success: true,
			data: resultData
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