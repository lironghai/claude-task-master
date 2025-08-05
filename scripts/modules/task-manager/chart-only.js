import fs from 'fs';
import path from 'path';
import { generateTextService, streamTextService, writeToFile, getFullText, initMcpClient } from '../ai-services-unified.js';
import { displayAiUsageSummary } from '../ui.js';
import {fileURLToPath} from "url";
import {tool} from "ai";
import {z} from "zod";
import {createErrorResponse, handleApiResult, withNormalizedProjectRoot} from "../../../mcp-server/src/tools/utils.js";
import {log as uLog} from "../utils.js";
import chalk from "chalk";
import {getDebugFlag} from "../config-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SYSTEM_PROMPT_FOR_CODE_GEN = "You are an AI assistant that generates code from documentation. Analyze the provided documentation (requirements, specifications, or high-level descriptions) and generate corresponding code in the requested language/framework. Ensure the code is functional, follows best practices, and accurately implements the documented features.";
// const PROMPT_FILE_PATH_FOR_CODE_GEN = path.join(/* ... */, 'gen_code_from_doc.md'); // Placeholder for future enhancement
const PROMPT_FILE_PATH = path.join(__dirname, '../../../docs/prompts/gen_code_from_doc_old.md'); // Old path

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
export async function chartOnly(args, context = {}, outputFormat = 'text') {
    const { projectRoot, overwrite = false, targetLanguage, targetFramework, projectOutlinePath, userPrompt } = args;
    const { session, reportProgress = () => {}, log, commandNameFromContext } = context;

    if (!log) {
        // Fallback logger if none provided, though it's expected.
        console.warn("Logger not provided to generateCodeFromDocumentation, using console.");
        // log = { info: console.log, warn: console.warn, error: console.error };
    }
    
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

    log.info(`[CoreLogic:GenCode] Starting code generation from documentation. Project: ${projectRoot}`);

    let projectOutlineContent = '';
    if (projectOutlinePath) {
        try {
            const outlineAbsolutePath = path.isAbsolute(projectOutlinePath) ? projectOutlinePath : path.join(projectRoot, projectOutlinePath);
            if (fs.existsSync(outlineAbsolutePath)) {
                projectOutlineContent = fs.readFileSync(outlineAbsolutePath, 'utf-8');
                log.info(`[CoreLogic:GenCode] Successfully loaded project outline from: ${outlineAbsolutePath}`);
            } else {
                log.warn(`[CoreLogic:GenCode] Project outline file not found at: ${outlineAbsolutePath}`);
            }
        } catch (error) {
            log.error(`[CoreLogic:GenCode] Error reading project outline file at ${projectOutlinePath}: ${error.message}`);
            // Continue without the outline if it fails to load
        }
    }

    const allResults = [];
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
        modelUsed: '',
        providerName: '',
        commandName : commandNameFromContext
    };
    
    if (projectOutlineContent) {
        systemPromptContent += `
        
Project Outline:
\`\`\`markdown
${projectOutlineContent}
\`\`\`\\n\\n---\\n\\n`;
    }

        let fileStatus = 'pending';
        let message = '';
        let individualTelemetryData = null;


        let genCodeResult = null;

        try {

            log.info(`[CoreLogic:GenCode] Calling AI service for start generate `);
            const result = await streamTextService({
                session, // Pass session from context
                systemPrompt: systemPromptContent,
                prompt: userPrompt,
                commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
                outputType: outputFormat === 'text' ? 'cli' : 'mcp',
                projectRoot
            });


            genCodeResult = result.mainResult;

            let aiServiceResponse = {
                mainResult: genCodeResult,
                telemetryData: result.usage
            };



            let { buffer, bytesWritten } = await getFullText(genCodeResult.textStream);
            // genCodeResult.textStream.close()

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

            allResults.push(buffer)
            let existsSync = true;
            message = `Successfully generated code for`;
            log.info(`[CoreLogic:GenCode] ${message}`);
            if (existsSync) {
                fileStatus = 'success';
                overallTelemetry.successfulFiles++;
            }else {
                fileStatus = 'created failed';
                overallTelemetry.failedFiles++;
            }
        } catch (error) {
            message = `Error processing document for code generation: ${error.message}`;
            log.error(`[CoreLogic:GenCode] ${message}`, error.stack);
            fileStatus = 'error_processing';
            overallTelemetry.failedFiles++;
        }finally {
            // await genCodeResult?.close();
            // await checkCodeResult?.close();
        }


    log.info("[CoreLogic:GenCode] Code generation from documentation process completed.");
    
    if (outputFormat === 'text' && overallTelemetry.totalTokens > 0) {
        // Ensure displayAiUsageSummary is available and correctly imported
        if (typeof displayAiUsageSummary === 'function') {
             displayAiUsageSummary(overallTelemetry, 'cli');
        } else {
            log.warn("[CoreLogic:GenCode] displayAiUsageSummary function not available for CLI telemetry output.");
        }
    }
    
    return {
        message: "Code generation from documentation process finished.",
        results: allResults,
        overallTelemetry
    };
}


export async function getTool() {
    return tool({
        name: "gen_code_from_doc",
        description: "解析代码文档,生成对应实现代码",
        parameters: z.object({
            projectRoot: z.string().describe("The absolute root directory of the project. If not provided, it will be derived from the session."),
            codeFilePath: z.string().describe("Required: Path to a code file (relative to projectRoot or absolute) , this is the specific code file path, not a directory."),
            docFilePath: z.string().describe("Required: Path to a code doc file (relative to projectRoot or absolute) , this is the specific code file path, not a directory."),
            projectOutlinePath: z.string().describe("Optional: Path to a project outline document (relative to projectRoot or absolute) to provide broader context for code generation."),
            // reportProgress is implicitly handled by MCP server for long-running tasks if direct function supports it.
        }),
        execute: withNormalizedProjectRoot(async (args, { mcpLog, session, reportProgress: reportProgressMcp }) => {
            // args.projectRoot is now normalized and absolute thanks to withNormalizedProjectRoot
            const { codeFilePath, docFilePath, projectRoot, projectOutlinePath } = args;

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
                log.error('[gen_code_from_doc] projectRoot is empty.');
                return createErrorResponse('projectRoot cannot be empty.');
            }

            if (!codeFilePath) {
                log.error('[gen_code_from_doc] codeFilePath is empty.');
                return createErrorResponse('codeFilePath cannot be empty.');
            }

            if (!docFilePath) {
                log.error('[gen_code_from_doc] docFilePath is empty.');
                return createErrorResponse('docFilePath cannot be empty.');
            }

            try {
                log.info(`[gen_code_from_doc] Starting generation. Project: ${projectRoot} codeFilePath: ${codeFilePath} docPath: ${docFilePath}. `);

                const codeGenerationMap = {
                    [docFilePath]: codeFilePath
                };
                const directArgs = {
                    projectRoot,
                    codeGenerationMap,
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
                    commandNameFromContext: 'gen_code_from_doc'
                };

                // The reportProgressMcp from the tool's context can be passed to the direct function if it accepts it.
                // The direct function `generateCodeFromDocumentationDirect` is already set up to receive `reportProgressMcp` via its context.
                const result = await generateCodeFromDocumentation(directArgs, coreContext);
                let resultMcp = {
                    success: true,
                    data: result
                };

                log.info('[gen_code_from_doc] Direct function call completed.');
                return handleApiResult(resultMcp, log, 'Error generating code from documentation');

            } catch (error) {
                log.error(`[gen_code_from_doc] Error: ${error.message}`, error.stack);
                return createErrorResponse(`Failed to generate code from documentation: ${error.message}`);
            }
        })
    });
}