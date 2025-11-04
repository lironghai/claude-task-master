/**
 * tools/parsePRD.js
 * Tool to parse PRD document and generate tasks
 */

import { z } from 'zod';
import path from 'path';
import {
	handleApiResult,
	withNormalizedProjectRoot,
	createErrorResponse,
} from './utils.js';
import {
	isGitRepository,
	getGitRemoteUrl,
	getGitBranch,
	getSubdirectories
} from '../../../src/utils/get-git-info.js';

/**
 * Register the parse_prd tool
 * @param {Object} server - FastMCP server instance
 */
export function registerProjectListTool(server) {
	server.addTool({
		name: 'project_list',
		description: `本地工作空间目录.`,

		parameters: z.object({
			workBase: z
				.string()
				.describe('The directory of the project workBase. Must be an absolute path.'),
			tag: z.string().optional().describe('Tag context to operate on'),
		}),
		execute: withNormalizedProjectRoot(
			async (args, { log, session, reportProgress }) => {
				try {
					const workBase = args.workBase;
					let project = [];
					const result = {
						success: true,
						data: {
							message: "success",
							project: project,
						}
					};

					const subdirectories = getSubdirectories(workBase)
					if (!subdirectories) {
						return handleApiResult(
							result,
							log,
							'Error project list',
							undefined,
							args.projectRoot
						);
					}

					project = subdirectories.map((subdirectory) => {
						const subPath = path.join(workBase, subdirectory);
						const isGit = isGitRepository(subPath);
						const res = {
							projectRoot: subPath,
							projectName: subdirectory,
							isGit: isGit,
						};

						if (isGit) {
							res.gitUrl = getGitRemoteUrl(subPath);
							res.branch = getGitBranch(subPath);
						}

						return res;
					})
					result.data.project = project;
					return handleApiResult(
						result,
						log,
						'Error project list',
						undefined,
						args.projectRoot
					);
				} catch (error) {
					log.error(`Error in project list: ${error.message}`);
					return createErrorResponse(`Failed to project list: ${error.message}`);
				}
			}
		)
	});
}