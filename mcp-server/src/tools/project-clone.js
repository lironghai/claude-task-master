/**
 * tools/parsePRD.js
 * Tool to parse PRD document and generate tasks
 */

import { z } from 'zod';
import {
	handleApiResult,
	withNormalizedProjectRoot,
	createErrorResponse,
} from './utils.js';
import {
	gitClone
} from '../../../src/utils/get-git-info.js';
import fs from "fs";
import path from "path";

/**
 * Register the parse_prd tool
 * @param {Object} server - FastMCP server instance
 */
export function registerProjectCloneTool(server) {
	server.addTool({
		name: 'project_clone',
		description: `project clone from git respo url`,

		parameters: z.object({
			repoUrl: z
				.string()
				.describe('git repoUrl'),
			projectRoot: z
				.string()
				.describe('The directory of the project. Must be an absolute path.'),
			workBase: z
				.string()
				.describe('The directory of the project. Must be an absolute path.'),
			branch: z.string().optional().default('master').describe('git branch, default master'),
			force: z
				.boolean()
				.optional()
				.default(false)
				.describe('Overwrite existing output file without prompting.'),
		}),
		execute: withNormalizedProjectRoot(
			async (args, { log, session, reportProgress }) => {
				try {
					const projectRoot = args.projectRoot;
					const force = args.force;
					let result = {
						success: true,
						data: {
							message: "success"
						}
					};

					if (fs.existsSync(projectRoot) ) {
						if (!force) {
							result.data.message = "project already exists";
							return handleApiResult(
								result,
								log,
								'Error project clone',
								undefined,
								args.projectRoot
							);
						}

						fs.rmSync(projectRoot, { recursive: true, force: true });
					}

					const parentDir = path.dirname(projectRoot);
					if (!fs.existsSync(parentDir)) {
						fs.mkdirSync(parentDir);
					}

					const gitCloneResult = await gitClone(args.repoUrl, projectRoot, {
						recursive: true,
						depth: 1,
						quiet: false,
						branch: args.branch,
					});
					console.log(gitCloneResult.message);
					result.data.message = gitCloneResult.message;

					return handleApiResult(
						result,
						log,
						'Error project clone',
						undefined,
						args.projectRoot
					);
				} catch (error) {
					log.error(`Error in project clone: ${error.message}`);
					return createErrorResponse(`Failed to project clone: ${error.message}`);
				}
			}
		)
	});
}
