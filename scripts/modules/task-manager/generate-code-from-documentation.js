import fs from 'fs';
import path from 'path';
import { generateTextService, streamTextService, writeToFile, getFullText, initMcpClient } from '../ai-services-unified.js';
import { displayAiUsageSummary } from '../ui.js';
import {fileURLToPath} from "url";
import {streamText, tool} from "ai";
import {z} from "zod";
import {createErrorResponse, handleApiResult, withNormalizedProjectRoot} from "../../../mcp-server/src/tools/utils.js";
import {log as uLog} from "../utils.js";
import chalk from "chalk";
import {getDebugFlag} from "../config-manager.js";
import {handleGenDocFromCodeOneCommand} from "./gen-doc-from-code-one-command.js"; // Assuming ui.js is in scripts/modules/

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
export async function generateCodeFromDocumentation(args, context = {}, outputFormat = 'text') {
    const { projectRoot, codeGenerationMap, overwrite = false, targetLanguage, targetFramework, projectOutlinePath } = args;
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
    
    const totalFiles = Object.keys(codeGenerationMap || {}).length;
    let processedFilesCount = 0;

    if (totalFiles === 0) {
        log.info("[CoreLogic:GenCode] Code generation map is empty. Nothing to process.");
        return {
            message: "Code generation map was empty. No files processed.",
            results: allResults,
            overallTelemetry
        };
    }

    if (projectOutlineContent) {
        systemPromptContent += `
        
Project Outline:
\`\`\`markdown
${projectOutlineContent}
\`\`\`\\n\\n---\\n\\n`;
    }

    for (const [docRelativePath, codeRelativePath] of Object.entries(codeGenerationMap)) {
        const docAbsolutePath = path.isAbsolute(docRelativePath) ? docRelativePath : path.join(projectRoot, docRelativePath);
        const codeAbsolutePath = path.isAbsolute(codeRelativePath) ? codeRelativePath : path.join(projectRoot, codeRelativePath);
        let fileStatus = 'pending';
        let message = '';
        let individualTelemetryData = null;

        processedFilesCount++;
        overallTelemetry.filesProcessed = processedFilesCount;

        reportProgress({
            processedCount: processedFilesCount,
            totalCount: totalFiles,
            currentFile: docRelativePath,
            status: 'processing',
            stage: 'Starting'
        });

        let genCodeResult = null;
        let checkCodeResult = null;

        try {
            log.info(`[CoreLogic:GenCode] Processing document: ${docRelativePath} to generate code: ${codeRelativePath}`);

            if (!fs.existsSync(docAbsolutePath)) {
                message = `Source document file not found: ${docAbsolutePath}`;
                log.error(`[CoreLogic:GenCode] ${message}`);
                fileStatus = 'error_source_not_found';
                overallTelemetry.failedFiles++;
                allResults.push({ document: docRelativePath, codeFile: codeRelativePath, status: fileStatus, message, telemetryData: null });
                reportProgress({ processedCount: processedFilesCount, totalCount: totalFiles, currentFile: docRelativePath, status: fileStatus, message, stage: 'Completed' });
                continue;
            }

            if (fs.existsSync(codeAbsolutePath) && !overwrite) {
                message = `Output code file ${codeAbsolutePath} already exists and overwrite is false. Skipping.`;
                log.info(`[CoreLogic:GenCode] ${message}`);
                fileStatus = 'skipped_exists';
                overallTelemetry.skippedFiles++;
                allResults.push({ document: docRelativePath, codeFile: codeRelativePath, status: fileStatus, message, telemetryData: null });
                reportProgress({ processedCount: processedFilesCount, totalCount: totalFiles, currentFile: docRelativePath, status: fileStatus, message, stage: 'Completed' });
                continue;
            }

            log.info(`[CoreLogic:GenCode] start handler doc: ${docAbsolutePath}, code: ${codeAbsolutePath}`);
            const docContent = fs.readFileSync(docAbsolutePath, 'utf-8');
            
            let userPrompt = '';

            if (targetLanguage) {
                userPrompt += `Please generate the code in ${targetLanguage}.\n`;
            }
            if (targetFramework) {
                userPrompt += `If applicable, use the ${targetFramework} framework.\n`;
            }
            // userPrompt += `The output code should be suitable for a file named ${path.basename(codeRelativePath)}, file path ${codeAbsolutePath}.\n`;
            userPrompt += `The output code should be suitable for a file named ${path.basename(codeRelativePath)}\n`;
            // userPrompt += "Ensure the generated code is complete and functional based on the documentation. Only output code blocks, cannot use the markup format, must write comments on the code blocks, and the code comments must specify each step's function in detail. Code comments can be made according to the code documentation";
            // userPrompt += "Ensure the generated code is complete and functional based on the documentation. Please help me save the code to a file in the execution directory. " +
            //     "When you generate the final content to be written to a file, you must use actual line breaks (ASCII LF, \\ n) to handle the end of each line. It is absolutely prohibited to use a two character string consisting of a back slash and the letter 'n' in the final file content." +
            //     // " Write the code in shards, do not write too much content at once. Each write must first read the latest file content to determine the write location. " +
            //     " Before creating a directory, it is necessary to check if the directory exists. " +
            //     " All method logic must be truly implemented without omission or empty implementation. Before calling the tool, it is necessary to ensure that the JSON structure is correct. " +
            //     " After preparing the code to be written, it is necessary to self check the correlation between the document and the code according to the self inspection requirements." +
            //     " Strictly follow the standard workflow requirements and steps to advance.";
            userPrompt += "Ensure the generated code is complete and functional based on the documentation. Only the final code needs to be output, and the content of the output code must be able to be written into the code file without any modification, and cannot contain any format such as markdown code blocks. " +
                // "When you generate the final content to be written to a file, you must use actual line breaks (ASCII LF, \\ n) to handle the end of each line. It is absolutely prohibited to use a two character string consisting of a back slash and the letter 'n' in the final file content." +
                // " Write the code in shards, do not write too much content at once. Each write must first read the latest file content to determine the write location. " +
                // " Before creating a directory, it is necessary to check if the directory exists. " +
                " All method logic must be truly implemented without omission or empty implementation. Before calling the tool, it is necessary to ensure that the JSON structure is correct. " +
                " After preparing the code to be written, it is necessary to self check the correlation between the document and the code according to the self inspection requirements." +
                " Strictly follow the standard workflow requirements and steps to advance.";

            userPrompt += `Documentation File: ${docRelativePath} \\n\\n Documentation Content:\\n`;
            userPrompt += '```markdown\n'; // Use simple quotes for the fence
            userPrompt += docContent + '\n'; // Append content
            userPrompt += '```\n\n';      // Use simple quotes for the fence

            log.info(`[CoreLogic:GenCode] Calling AI service for ${docRelativePath} start generate `);
            reportProgress({ processedCount: processedFilesCount, totalCount: totalFiles, currentFile: docRelativePath, status: 'ai_processing', stage: 'AI Call' });
            //
            // const aiServiceResponse = await generateTextService({
            //     session, // Pass session from context
            //     systemPrompt: systemPromptContent,
            //     prompt: userPrompt,
            //     commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
            //     outputType: outputFormat === 'text' ? 'cli' : 'mcp',
            //     projectRoot,
            //     filePathContext: docAbsolutePath,
            //     activeTools: ['execute_command','list_directory','get_current_directory','change_directory\n','read_file','search_files','get_file_info','list_allowed_directories','sequentialthinking','resolve-library-id','get-library-docs'],
            // });
            const result = await streamTextService({
                session, // Pass session from context
                systemPrompt: systemPromptContent,
                prompt: userPrompt,
                commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
                outputType: outputFormat === 'text' ? 'cli' : 'mcp',
                projectRoot,
                filePathContext: docAbsolutePath,
                activeTools: ['execute_command','list_directory','get_current_directory','change_directory','read_file','search_files','get_file_info','list_allowed_directories','sequentialthinking','resolve-library-id','get-library-docs'],
            });


            genCodeResult = result.mainResult;
            // for await (const textPart of result.textStream) {
            //     console.log(textPart);
            //     mainResult += textPart;
            // }

            let aiServiceResponse = {
                mainResult: genCodeResult,
                telemetryData: result.usage
            };


            // if (!aiServiceResponse || typeof aiServiceResponse.mainResult !== 'string') { // Expecting string for code
            //     throw new Error('AI service did not return a valid string result for code generation.');
            // }

            let { buffer : generatedCode, bytesWritten } = await getFullText(genCodeResult.textStream);
            // genCodeResult.textStream.close()

            // const generatedCode = await writeToFile(mainResult.textStream, codeAbsolutePath);
            // const generatedCode = aiServiceResponse.mainResult;
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
            
            // const outputDir = path.dirname(codeAbsolutePath);
            // if (!fs.existsSync(outputDir)) {
            //     fs.mkdirSync(outputDir, { recursive: true });
            //     log.info(`[CoreLogic:GenCode] Created directory: ${outputDir}`);
            // }

            // if (!fs.existsSync(codeAbsolutePath)) {
            //     log.warn(`[CoreLogic:GenCode] code file not exist, try calling again  ${docRelativePath}`);
            //     // 文件未生成继续调用生成
            //     const aiServiceResponseRe = await generateTextService({
            //         session, // Pass session from context
            //         systemPrompt: systemPromptContent,
            //         prompt: userPrompt,
            //         commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
            //         outputType: outputFormat === 'text' ? 'cli' : 'mcp',
            //         projectRoot,
            //         filePathContext: docAbsolutePath,
            //     });
            //
            //     if (!aiServiceResponseRe || typeof aiServiceResponseRe.mainResult !== 'string') { // Expecting string for code
            //         throw new Error('AI service did not return a valid string result for code generation.');
            //     }
            // }

            // let existsSync = fs.existsSync(codeAbsolutePath);

            if (!generatedCode) {
                log.info(`[CoreLogic:GenCode] Calling AI service for ${docRelativePath} start checking `);
                let userCheckPrompt = '';

                userCheckPrompt += `The code file named ${path.basename(codeRelativePath)}, file path ${codeAbsolutePath}.\n`;
                userCheckPrompt += "Check the code according to the document, conduct a comprehensive correlation check as required, and make repairs. Prioritize diagnosing syntax, type, and other errors in basic code, and conduct a detailed and comprehensive self-examination before proceeding. " +
                    "Ensure the generated code is complete and functional based on the documentation. Only the final code needs to be output, and the content of the output code must be able to be written into the code file without any modification, and cannot contain any format such as markdown code blocks. " +
                    "When you generate the final content to be written to a file, you must use actual line breaks (ASCII LF, \\ n) to handle the end of each line. It is absolutely prohibited to use a two character string consisting of a back slash and the letter 'n' in the final file content. " +
                    "When an error occurs when calling a method or property of a dependent class, priority should be given to checking the documentation of the dependent class, and all adjustments must be based on the documentation. " +
                    "All method logic must be truly implemented without omission or empty implementation. All methods and code must include comments, and the steps of method code must be annotated in detail and consistent with the logical functionality of the method in the documentation. " +
                    // "After preparing the code to be written, it is necessary to self check the correlation between the document and the code according to the self inspection requirements." +
                    "Strictly follow the standard workflow requirements and steps to advance.";

                userCheckPrompt += `Documentation File: ${docRelativePath}\\n\\nDocumentation Content:\\n`;
                userCheckPrompt += '```markdown\n'; // Use simple quotes for the fence
                userCheckPrompt += docContent + '\n'; // Append content
                userCheckPrompt += '```\n\n';      // Use simple quotes for the fence

                userCheckPrompt += `code :\\n`;
                userCheckPrompt += '```code\n'; // Use simple quotes for the fence
                userCheckPrompt += generatedCode + '\n'; // Append content
                userCheckPrompt += '```\n\n';      // Use simple quotes for the fence

                // 文件已生成进行代码诊断
                const checkResult = await streamTextService({
                    session, // Pass session from context
                    systemPrompt: systemPromptContent,
                    prompt: userCheckPrompt,
                    commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
                    outputType: outputFormat === 'text' ? 'cli' : 'mcp',
                    projectRoot,
                    filePathContext: docAbsolutePath,
                    activeTools: ['execute_command','list_directory','get_current_directory','change_directory','read_file','search_files','get_file_info','list_allowed_directories','sequentialthinking','resolve-library-id','get-library-docs'],
                });

                checkCodeResult = checkResult.mainResult;
                generatedCode = await writeToFile(checkCodeResult.textStream, codeAbsolutePath);
                checkCodeResult.textStream.close();
            }

            // fs.writeFileSync(codeAbsolutePath, generatedCode);

            let existsSync = fs.existsSync(codeAbsolutePath);
            message = `Successfully generated code for ${docRelativePath} to ${codeRelativePath}`;
            log.info(`[CoreLogic:GenCode] ${message}`);
            if (existsSync) {
                fileStatus = 'success';
                overallTelemetry.successfulFiles++;
            }else {
                fileStatus = 'created failed';
                overallTelemetry.failedFiles++;
            }
        } catch (error) {
            message = `Error processing document ${docRelativePath} for code generation: ${error.message}`;
            log.error(`[CoreLogic:GenCode] ${message}`, error.stack);
            fileStatus = 'error_processing';
            overallTelemetry.failedFiles++;
        }finally {
            // await genCodeResult?.close();
            // await checkCodeResult?.close();
        }
        allResults.push({ document: docRelativePath, codeFile: codeRelativePath, status: fileStatus, message, telemetryData: individualTelemetryData });
        reportProgress({ processedCount: processedFilesCount, totalCount: totalFiles, currentFile: docRelativePath, status: fileStatus, message, stage: 'Completed' });
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