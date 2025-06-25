import { z } from 'zod';
import {
    createErrorResponse,
    withNormalizedProjectRoot,
    handleApiResult,
    createContentResponse
} from './utils.js';
// import { asyncOperationManager } from '../core/utils/async-manager.js';
import { generateDocumentationFromCodeDirect } from '../core/direct-functions/generate-documentation-from-code-direct.js';

export function registerGenerateDocumentationFromCodeTool(server) {
    server.addTool({
        name: "generate_documentation_from_code",
        description: "Generates documentation from specified code files using an AI model and saves them to corresponding paths.",
        parameters: z.object({
            projectRoot: z.string().describe("The absolute root directory of the project. If not provided, it's derived from the session."),
            documentationMap: z.record(z.string(), z.string()).describe("A map where keys are source code file paths (relative to projectRoot) and values are output documentation file paths (relative to projectRoot)."),
            overwrite: z.boolean().optional().default(false).describe("Whether to overwrite existing documentation files."),
        }),
        execute: withNormalizedProjectRoot(async (args, { log, session }) => {
            try {
                // projectRoot is now normalized by withNormalizedProjectRoot
                const docMapSize = Object.keys(args.documentationMap).length;

                if (docMapSize === 0) {
                    return createErrorResponse("documentationMap cannot be empty.", "INPUT_VALIDATION_ERROR");
                }

                if (docMapSize === 1) {
                    log.info(`documentationMap has ${docMapSize} entry, executing synchronously.`);
                    const result = await generateDocumentationFromCodeDirect(args, log, { session });
                    return handleApiResult(result, log);
                } else {
                    // log.info(`documentationMap has ${docMapSize} entries, executing asynchronously.`);
                    // const operationId = asyncOperationManager.addOperation(
                    //     generateDocumentationFromCodeDirect,
                    //     args,
                    //     {
                    //         log,
                    //         session,
                    //         reportProgress: (progress) => {
                    //             log.info(`Operation ${operationId} progress: ${JSON.stringify(progress)}`);
                    //         }
                    //     }
                    // );
                    // return createContentResponse({
                    //     operationId,
                    //     status: "pending",
                    //     message: `Documentation generation for ${docMapSize} files started in background.`
                    // });

                    const result = await generateDocumentationFromCodeDirect(args, log, { session });
                    return handleApiResult(result, log);
                }
            } catch (error) {
                log.error(`Error in generate_documentation_from_code tool: ${error.message}`, error.stack);
                return createErrorResponse(
                    `Failed to generate documentation from code: ${error.message}`,
                    'TOOL_EXECUTION_ERROR'
                );
            }
        })
    });
} 