/**
 * tools/parsePRD.js
 * Tool to parse PRD document and generate tasks
 */

import { z } from 'zod';
import {
	handleApiResult,
	withNormalizedProjectRoot,
	createErrorResponse,
	checkProgressCapability
} from './utils.js';
import { parsePRDDirect } from '../core/task-master-core.js';
import {
	TASKMASTER_DOCS_DIR,
	TASKMASTER_TASKS_FILE
} from '../../../src/constants/paths.js';
import { resolveTag } from '../../../scripts/modules/utils.js';
import {parsePRDTextDirect} from "../core/direct-functions/parse-prd-text.js";

/**
 * Register the parse_prd tool
 * @param {Object} server - FastMCP server instance
 */
export function writePRDTextTool(server) {
	server.addTool({
		name: 'write_prd_text_to_file',
		description: `将PRD文档内容写入到项目文件`,

		parameters: z.object({
			prdText: z
				.string()
				.describe(' PRD document content'),
			projectRoot: z
				.string()
				.describe('The directory of the project. Must be an absolute path.'),
			fileName: z
				.string()
				.optional()
				.describe(
					`Output file name, xxx.md`
				),
			force: z
				.boolean()
				.optional()
				.default(false)
				.describe('Overwrite existing output file without prompting.'),
			append: z
				.boolean()
				.optional()
				.describe('Append generated tasks to existing file.')
		}),
		execute: withNormalizedProjectRoot(
			async (args, { log, session, reportProgress }) => {
				try {
					const resolvedTag = resolveTag({
						projectRoot: args.projectRoot,
						tag: args.tag
					});
					const progressCapability = checkProgressCapability(
						reportProgress,
						log
					);


					const prdResult = await parsePRDTextDirect(
						{
							...args,
							prdFileName: args.fileName,
							tag: resolvedTag
						},
						log,
						{ session, reportProgress: progressCapability }
					);

					const res = {
						success: true,
						data: prdResult
					}

					return handleApiResult(
						res,
						log,
						'Error parsing PRD',
						undefined,
						args.projectRoot
					);
				} catch (error) {
					log.error(`Error in parse_prd: ${error.message}`);
					return createErrorResponse(`Failed to parse PRD: ${error.message}`);
				}
			}
		)
	});
}
