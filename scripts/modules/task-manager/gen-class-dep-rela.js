import fs from 'fs';
import path from 'path';
import {generateTextService, streamTextService, streamTextServiceFin,writeToFile, getFullText, initMcpClient, getTools, closeMcpClients} from '../ai-services-unified.js';
import {displayAiUsageSummary} from '../ui.js';
import {fileURLToPath} from "url";
import {z} from "zod";
import {createErrorResponse, handleApiResult, withNormalizedProjectRoot} from "../../../mcp-server/src/tools/utils.js";
import {
    generateCodeFromDocumentationDirect
} from "../../../mcp-server/src/core/direct-functions/generate-code-from-documentation-direct.js";
import chalk from "chalk";
import {getDebugFlag} from "../config-manager.js";
import {tool} from "ai";
import {log as uLog} from "../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SYSTEM_PROMPT_FOR_CODE_GEN = "You are an AI assistant that generates code from documentation. Analyze the provided documentation (requirements, specifications, or high-level descriptions) and generate corresponding code in the requested language/framework. Ensure the code is functional, follows best practices, and accurately implements the documented features.";
// const PROMPT_FILE_PATH_FOR_CODE_GEN = path.join(/* ... */, 'gen_code_from_doc.md'); // Placeholder for future enhancement
const PROMPT_FILE_PATH = path.join(__dirname, '../../../docs/prompts/gen_code_dep_rela.md'); // Old path

/**
 * Generates code from documentation files using an AI model.
 * This is the core logic function.
 * @param {object} args - The arguments for the function.
 * @param {string} args.projectRoot - The absolute root directory of the project.
 * @param {Record<string, string>} args.codeGenerationMap - Map of document relative paths to code file relative paths.
 * @param {boolean} [args.overwrite=false] - Whether to overwrite existing code files.
 * @param {string} [args.targetLanguage] - Optional: The target programming language for the generated code.
 * @param {string} [args.targetFramework] - Optional: The target framework, if applicable.
 * @param {string} [args.projectOutlinePath] - Optional: Path to a project outline document to provide broader context.
 * @param {object} context - The context object.
 * @param {object} context.session - The MCP session object or CLI session.
 * @param {function} [context.reportProgress=() => {}] - Optional function to report progress.
 * @param {object} context.log - The logger object (CLI or MCP wrapped).
 * @param {string} context.commandNameFromContext - The name of the invoking command or tool for telemetry.
 * @param {string} [outputFormat='text'] - Output format, 'json' for structured data, 'text' for CLI (handles telemetry display).
 * @returns {Promise<object>} - An object containing the results and overall telemetry.
 */
export async function genCodeDepRela(args, context = {}, outputFormat = 'text') {
    const {
        projectRoot,
        codeFilePath
    } = args;
    const {
        session, reportProgress = () => {
        }, log, commandNameFromContext
    } = context;

    if (!log) {
        // Fallback logger if none provided, though it's expected.
        console.warn("Logger not provided to generateCodeFromDocumentation, using console.");
        // log = { info: console.log, warn: console.warn, error: console.error };
    }

    let codeContent = '';
    if (codeFilePath) {
        try {
            const codeAbsolutePath = path.isAbsolute(codeFilePath) ? codeFilePath : path.join(projectRoot, codeFilePath);
            if (fs.existsSync(codeAbsolutePath) && fs.statSync(codeAbsolutePath).isFile()) {
                codeContent = fs.readFileSync(codeAbsolutePath, 'utf-8');
                log.info(`[CoreLogic:genCodeDepRela] Successfully loaded code from: ${codeAbsolutePath}`);
            } else {
                log.warn(`[CoreLogic:genCodeDepRela] code file not found at: ${codeAbsolutePath}`);
            }
        } catch (error) {
            log.error(`[CoreLogic:genCodeDepRela] Error reading code file at ${codeFilePath}: ${error.message}`);
            // Continue without the outline if it fails to load
        }
    }

    if(!codeContent) {
        log.error(`[CoreLogic:genCodeDepRela] code file is empty ${codeFilePath}`);
        return {
            message: "The code file does not exist or the content is empty.",
            results: [{codeFile: codeFilePath, message: "The code file does not exist or the content is empty."}]
        };
    }

    const allResults = [];

    let systemPromptContent = DEFAULT_SYSTEM_PROMPT_FOR_CODE_GEN;
    // TODO: Add logic to load systemPromptContent from a file if PROMPT_FILE_PATH_FOR_CODE_GEN is defined and exists
    try {
        if (fs.existsSync(PROMPT_FILE_PATH)) {
            const fileContent = fs.readFileSync(PROMPT_FILE_PATH, 'utf-8').trim();
            if (fileContent) {
                systemPromptContent = fileContent;
                log.info(`[Direct] Loaded system prompt from ${PROMPT_FILE_PATH}`);
            } else {
                log.warn(`[Direct] Prompt file ${PROMPT_FILE_PATH} is empty. Using default system prompt.`);
            }
        } else {
            log.warn(`[Direct] Prompt file ${PROMPT_FILE_PATH} not found. Using default system prompt.`);
        }
    } catch (error) {
        log.error(`[Direct] Error reading system prompt file: ${error.message}. Using default system prompt.`);
    }

    log.info(`[CoreLogic:genCodeDepRela] Starting code generation from documentation. Project: ${projectRoot}`);

    const overallTelemetry = {
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        providerCounts: {},
        successfulFiles: 0,
        failedFiles: 0,
        skippedFiles: 0,
        filesProcessed: 0,
    };

    let fileStatus = 'pending';
    let message = '';

    reportProgress({
        status: 'processing',
        stage: 'Starting'
    });

    if (codeContent) {
        systemPromptContent += `

codePath: ${codeFilePath}
code:
\`\`\`code
${codeContent}
\`\`\`\\n\\n---\\n\\n`;
    }

    let individualTelemetryData = null;
    let tools = null;
    let toolClients = null;

    try {
        log.info(`[CoreLogic:genCodeDepRela] Processing start for ${projectRoot} to ${codeFilePath}`);

        let userPrompt = '';

        userPrompt += `分析代码的依赖关系,输出依赖关系列表.\n`;

        log.info(`[CoreLogic:genCodeDepRela] Calling AI service for ${codeFilePath}`);
        reportProgress({
            status: 'ai_processing',
            stage: 'AI Call'
        });

        toolClients = await initMcpClient();
        tools = await getTools(toolClients);
        let aiServiceResponse = await streamTextServiceFin({
            session, // Pass session from context
            systemPrompt: systemPromptContent,
            prompt: userPrompt,
            commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
            outputType: outputFormat === 'text' ? 'cli' : 'mcp',
            projectRoot,
            tools: tools,
            activeTools: ['execute_command', 'list_directory', 'get_current_directory', 'change_directory', 'read_file', 'get_file_info', 'list_allowed_directories', 'sequentialthinking', 'resolve-library-id', 'get-library-docs'],
        });

        //  'search_files',
        let planFistFullText = await aiServiceResponse.mainResult.text;
        individualTelemetryData = aiServiceResponse.telemetryData;
        if (individualTelemetryData) {
            overallTelemetry.totalCost += individualTelemetryData.totalCost || 0;
            overallTelemetry.totalInputTokens += individualTelemetryData.inputTokens || 0;
            overallTelemetry.totalOutputTokens += individualTelemetryData.outputTokens || 0;
            overallTelemetry.totalTokens += individualTelemetryData.totalTokens || 0;
            if (individualTelemetryData.providerName) {
                overallTelemetry.providerCounts[individualTelemetryData.providerName] = (overallTelemetry.providerCounts[individualTelemetryData.providerName] || 0) + 1;
            }
        }


        // message = `Successfully generated doc plan for ${projectRoot} to ${planPath}`;
        message = planFistFullText;
        log.info(`[CoreLogic:genCodeDepRela] ${message}`);
        fileStatus = 'success';
        overallTelemetry.successfulFiles++;
    } catch (error) {
        message = `Error processing document ${codeFilePath} for code generation: ${error.message}`;
        log.error(`[CoreLogic:genCodeDepRela] ${message}`, error.stack);
        fileStatus = 'error_processing';
        overallTelemetry.failedFiles++;
    }finally {
        await closeMcpClients(toolClients);
    }
    allResults.push({codeFile: codeFilePath, message: message, telemetryData: individualTelemetryData});
    reportProgress({currentFile: codeFilePath, status: fileStatus, message, stage: 'Completed'});

    log.info("[CoreLogic:genCodeDepRela] Code generation from documentation process completed.");

    if (outputFormat === 'text' && overallTelemetry.totalTokens > 0) {
        // Ensure displayAiUsageSummary is available and correctly imported
        if (typeof displayAiUsageSummary === 'function') {
            displayAiUsageSummary(overallTelemetry, 'cli');
        } else {
            log.warn("[CoreLogic:genCodeDepRela] displayAiUsageSummary function not available for CLI telemetry output.");
        }
    }

    return {
        message: "Code analysis dependency relationship process finished.",
        results: allResults,
        overallTelemetry
    };



}

export async function getTool() {
    return tool({
        name: "analysis_code_dependent_on",
        description: "Analyze code dependencies, output dependency list",
        parameters: z.object({
            projectRoot: z.string().describe("The absolute root directory of the project. If not provided, it will be derived from the session."),
            codeFilePath: z.string().describe("Required: Path to a code file (relative to projectRoot or absolute) to generate code for, this is the specific code file path, not a directory."),
            projectOutlinePath: z.string().describe("Optional: Path to a project outline document (relative to projectRoot or absolute) to provide broader context for code generation."),
            // reportProgress is implicitly handled by MCP server for long-running tasks if direct function supports it.
        }),
        execute: withNormalizedProjectRoot(async (args, { mcpLog, session, reportProgress: reportProgressMcp }) => {
        // args.projectRoot is now normalized and absolute thanks to withNormalizedProjectRoot
        const { codeFilePath, projectRoot, projectOutlinePath } = args;

        let log = mcpLog;
        if (!mcpLog) {
            log = {
                // Wrapper for CLI
                info: (...args) => uLog('info', ...args),
                warn: (...args) => uLog('warn', ...args),
                error: (...args) => uLog('error', ...args),
                debug: (...args) => uLog('debug', ...args),
                success: (...args) => uLog('success', ...args)
            }
        }

        if (!projectRoot) {
            log.error('[analysis_code_dependent_on] projectRoot is empty.');
            return createErrorResponse('projectRoot cannot be empty.');
        }

        if (!codeFilePath) {
            log.error('[analysis_code_dependent_on] Code is empty.');
            return createErrorResponse('codeFilePath cannot be empty.');
        }

        try {
            log.info(`[analysis_code_dependent_on] Starting generation. Project: ${projectRoot}  codeFilePath: ${codeFilePath} . `);

            const directArgs = {
                projectRoot,
                codeFilePath,
                projectOutlinePath
            };

            const coreContext = {
                session: session,
                reportProgress: (progress) => {
                    let text = null;
                    if (progress.currentFile && progress.stage) {
                        text = `Processed ${progress.processedCount}/${progress.totalCount}: ${progress.currentFile} - ${progress.stage} (${progress.status})`;
                    } else if (progress.currentFile) {
                        text = `Processed ${progress.processedCount}/${progress.totalCount}: ${progress.currentFile} (${progress.status})`;
                    } else {
                        text = `Processed ${progress.processedCount}/${progress.totalCount} files... (${progress.status})`;
                    }
                },
                log: {
                    info: (msg) => console.log(chalk.blue('INFO:'), msg),
                    warn: (msg) => console.warn(chalk.yellow('WARN:'), msg),
                    error: (msg, stack) => {
                        console.error(chalk.red('ERROR:'), msg);
                        if (stack && getDebugFlag({ projectRoot })) {
                            console.error(stack);
                        }
                    }
                },
                commandNameFromContext: 'analysis_code_dependent_on'
            };

            // The reportProgressMcp from the tool's context can be passed to the direct function if it accepts it.
            // The direct function `generateCodeFromDocumentationDirect` is already set up to receive `reportProgressMcp` via its context.
            const result = await genCodeDepRela(directArgs, coreContext);
            let resultMcp = {
                success: true,
                data: result
            };

            log.info('[analysis_code_dependent_on] Direct function call completed.');
            return handleApiResult(resultMcp, log, 'Error generating code from documentation');

        } catch (error) {
            log.error(`[analysis_code_dependent_on] Error: ${error.message}`, error.stack);
            return createErrorResponse(`Failed to generate code from documentation: ${error.message}`);
        }
    })
    });
}

async function updateMessages(result, currentMessages) {
    const messages = [];
    if  (currentMessages) {
        messages.push({ role: 'user', content: currentMessages });
    }
    // 获取新的消息
    const response = await result.response;
    const his = await response.messages;
    if (his) {
        messages.push(...his);
    }

    // 智能合并消息历史
    return messages;
}

function mergeMessages(oldMessages, newMessages) {
    // 实现智能消息合并逻辑
    if (!oldMessages) {
        oldMessages = []
    }
    // 避免重复，保留重要上下文
    return [...oldMessages, ...newMessages];
}