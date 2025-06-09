import { generateCodeFromDocumentation } from '../../../../scripts/modules/task-manager/generate-code-from-documentation.js';
import { createLogWrapper } from '../../tools/utils.js'; // Assuming this utility exists for wrapping MCP log
import { normalizeProjectRoot } from '../../core/utils/path-utils.js'; // For normalizing projectRoot

/**
 * Direct function to handle MCP requests for generating code from documentation.
 * @param {object} args - Arguments from the MCP tool.
 * @param {string} args.projectRoot - Absolute path to the project root.
 * @param {Record<string, string>} args.codeGenerationMap - Map of doc file paths to code file paths.
 * @param {boolean} [args.overwrite=false] - Whether to overwrite existing files.
 * @param {string} [args.targetLanguage] - Optional target programming language.
 * @param {string} [args.targetFramework] - Optional target framework.
 * @param {string} [args.projectOutlinePath] - Optional: Path to a project outline document.
 * @param {object} log - The MCP logger instance.
 * @param {object} context - The MCP context.
 * @param {object} context.session - The MCP session object.
 * @param {function} [context.reportProgressMcp] - Function to report progress back to the MCP client.
 * @returns {Promise<object>} - A promise that resolves to the direct function's result structure.
 */
export async function generateCodeFromDocumentationDirect(args, log, context = {}) {
    const { session, reportProgressMcp } = context;
    // Wrap the MCP logger for consistent logging format if needed, or use directly
    // For simplicity, direct pass-through if createLogWrapper is just for formatting prefix, 
    // otherwise, the core logic should be logger-agnostic or expect a simple interface.
    const mcpLog = typeof createLogWrapper === 'function' ? createLogWrapper(log, 'GenCodeDirect') : log;

    try {
        mcpLog.info(`[Direct:GenCode] Received request. Args: ${JSON.stringify(Object.keys(args))}`);

        if (!args.projectRoot) {
            return { success: false, error: "Missing required argument: projectRoot." };
        }
        // Normalize projectRoot path
        const normalizedProjectRoot = normalizeProjectRoot(args.projectRoot, mcpLog);
        if (!normalizedProjectRoot) {
            return { success: false, error: "Failed to normalize projectRoot." };
        }

        if (!args.codeGenerationMap || Object.keys(args.codeGenerationMap).length === 0) {
            return { success: false, error: "Missing or empty required argument: codeGenerationMap." };
        }
        
        const coreArgs = {
            projectRoot: normalizedProjectRoot, // Use normalized path
            codeGenerationMap: args.codeGenerationMap,
            overwrite: args.overwrite || false,
            targetLanguage: args.targetLanguage,
            targetFramework: args.targetFramework,
            projectOutlinePath: args.projectOutlinePath, // Pass the new argument
        };

        const coreContext = {
            session,
            reportProgress: reportProgressMcp, // Pass MCP progress callback to core logic
            log: mcpLog,                       // Pass the (potentially wrapped) MCP logger
            commandNameFromContext: 'mcp_generate_code_from_documentation' // Telemetry command name
        };

        // Call the core logic function. 'json' outputFormat ensures it returns data rather than trying CLI display.
        const result = await generateCodeFromDocumentation(coreArgs, coreContext, 'json');

        mcpLog.info(`[Direct:GenCode] Core logic finished. Processed ${result.results?.length || 0} mappings.`);
        
        // The core logic result already contains { message, results, overallTelemetry }
        return {
            success: true,
            data: result 
        };

    } catch (error) {
        mcpLog.error(`[Direct:GenCode] Error: ${error.message}`, error.stack);
        return { success: false, error: error.message || "An unexpected error occurred during code generation." };
    }
} 