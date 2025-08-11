import { z } from 'zod';
import { generateCodeFromDocumentationDirect } from '../core/task-master-core.js';
import {
    handleApiResult,
    createErrorResponse,
    withNormalizedProjectRoot,
    createLogWrapper // If progress reporting is complex, might need mcpLog directly
} from './utils.js';

export function registerGenerateCodeFromDocumentationTool(server) {
    server.addTool({
        name: "generate_code_from_documentation",
        description: "Generates code files from documentation files using an AI model. Processes a map of document paths to output code file paths.",
        parameters: z.object({
            projectRoot: z.string().optional().describe("The absolute root directory of the project. If not provided, it will be derived from the session."),
            codeGenerationMap: z.record(z.string(), z.string())
                .describe("A map where keys are relative paths to documentation files and values are relative paths for the output code files."),
            overwrite: z.boolean().optional().default(false).describe("Whether to overwrite existing code files."),
            targetLanguage: z.string().optional().describe("Optional: The target programming language for the generated code (e.g., 'JavaScript', 'Python')."),
            targetFramework: z.string().optional().describe("Optional: The target framework, if applicable (e.g., 'React', 'Express.js')."),
            projectOutlinePath: z.string().optional().describe("Optional: Path to a project outline document (relative to projectRoot or absolute) to provide broader context for code generation."),
            // reportProgress is implicitly handled by MCP server for long-running tasks if direct function supports it.
        }),
        execute: withNormalizedProjectRoot(async (args, { log, session, reportProgress: reportProgressMcp }) => {
            // args.projectRoot is now normalized and absolute thanks to withNormalizedProjectRoot
            const { codeGenerationMap, overwrite, targetLanguage, targetFramework, projectRoot, projectOutlinePath } = args;

            if (!codeGenerationMap || Object.keys(codeGenerationMap).length === 0) {
                log.error('[GenCodeTool] Code generation map is empty.');
                return createErrorResponse('Code generation map cannot be empty.');
            }

            try {
                log.info(`[GenCodeTool] Starting generation. Project: ${projectRoot}. Map size: ${Object.keys(codeGenerationMap).length}`);
                
                const directArgs = {
                    projectRoot,
                    codeGenerationMap,
                    overwrite,
                    targetLanguage,
                    targetFramework,
                    projectOutlinePath
                };

                // The reportProgressMcp from the tool's context can be passed to the direct function if it accepts it.
                // The direct function `generateCodeFromDocumentationDirect` is already set up to receive `reportProgressMcp` via its context.
                const result = await generateCodeFromDocumentationDirect(directArgs, log, { session, reportProgressMcp });

                log.info('[GenCodeTool] Direct function call completed.');
                return handleApiResult(result, log, 'Error generating code from documentation');

            } catch (error) {
                log.error(`[GenCodeTool] Error: ${error.message}`, error.stack);
                return createErrorResponse(`Failed to generate code from documentation: ${error.message}`);
            }
        })
    });
} 