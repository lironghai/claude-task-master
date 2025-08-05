import { z } from 'zod';
import { chartOnlyDirect } from '../core/task-master-core.js';
import {
    handleApiResult,
    createErrorResponse,
    withNormalizedProjectRoot,
    createLogWrapper // If progress reporting is complex, might need mcpLog directly
} from './utils.js';

export function registerChartOnlyTool(server) {
    server.addTool({
        name: "chart_only",
        description: "chart_only",
        parameters: z.object({
            projectRoot: z.string().optional().describe("The absolute root directory of the project. If not provided, it will be derived from the session."),
            overwrite: z.boolean().optional().default(false).describe("Whether to overwrite existing code files."),
            targetLanguage: z.string().optional().describe("Optional: The target programming language for the generated code (e.g., 'JavaScript', 'Python')."),
            targetFramework: z.string().optional().describe("Optional: The target framework, if applicable (e.g., 'React', 'Express.js')."),
            projectOutlinePath: z.string().optional().describe("Optional: Path to a project outline document (relative to projectRoot or absolute) to provide broader context for code generation."),
            userPrompt: z.string().optional().describe("Optional: Path to a project outline document (relative to projectRoot or absolute) to provide broader context for code generation."),
        }),
        execute: withNormalizedProjectRoot(async (args, { log, session, reportProgress: reportProgressMcp }) => {
            // args.projectRoot is now normalized and absolute thanks to withNormalizedProjectRoot
            const { overwrite, targetLanguage, targetFramework, projectRoot, projectOutlinePath, userPrompt } = args;

            try {
                log.info(`[chartOnly] Starting generation. Project: ${projectRoot}. `);

                const directArgs = {
                    projectRoot,
                    overwrite,
                    targetLanguage,
                    targetFramework,
                    projectOutlinePath,
                    userPrompt
                };

                // The reportProgressMcp from the tool's context can be passed to the direct function if it accepts it.
                // The direct function `generateCodeFromDocumentationDirect` is already set up to receive `reportProgressMcp` via its context.
                const result = await chartOnlyDirect(directArgs, log, { session, reportProgressMcp });

                log.info('[chartOnly] Direct function call completed.');
                return handleApiResult(result, log, 'Error generating code from documentation');

            } catch (error) {
                log.error(`[chartOnly] Error: ${error.message}`, error.stack);
                return createErrorResponse(`Failed to generate code from documentation: ${error.message}`);
            }
        })
    });
} 