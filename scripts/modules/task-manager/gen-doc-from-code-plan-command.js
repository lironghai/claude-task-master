import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

import { findProjectRoot, log } from '../utils.js';
import { getDebugFlag } from '../config-manager.js';
import { generateDocumentationFromCodeDirect } from '../../../mcp-server/src/core/direct-functions/generate-documentation-from-code-direct.js';
import {
    generateTextService,
    streamTextService,
    writeToFile,
    getFullText,
    initMcpClient,
    getTools, streamTextServiceFin, closeMcpClients
} from '../ai-services-unified.js';
import {displayAiUsageSummary} from "../ui.js";
import {getTool} from "./gen-doc-from-code-one-command.js";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROMPT_FILE_PATH = path.join(__dirname, '../../../docs/prompts/analysis_doc_plan_execute1.md'); // Old path
/**
 * Handles the core logic for the 'generate-documentation-from-code' CLI command.
 * @param {object} options - Parsed command-line options.
 * @returns {Promise<void>}
 */
export async function handleGenDocFromCodePlanCommandV1(options) {
    log('info','handleGenDocFromCodePlanCommand called with options:', options);
    const spinner = ora(`Initializing documentation generation from code...  options: ${options}`).start();
    try {
        const projectRoot = options.projectRoot || findProjectRoot();
        if (!projectRoot) {
            spinner.fail(chalk.red('Error: Could not determine project root. Please specify with --project-root or run from within the project.'));
            process.exit(1);
        }

        const planDocPath = options.planDocPath;
        if (!planDocPath) {
            spinner.fail(chalk.red('Error: Could not determine planDocPath. Please specify with --plan-path or run from within the project.'));
            process.exit(1);
        }

        let documentationMap = {
            [options.codeFilePath]: options.docFilePath
        };

        if (Object.keys(documentationMap).length === 0) {
            spinner.info('Documentation map is empty. Nothing to process.');
            process.exit(0);
        }

        spinner.text = 'Generating documentation from code...';

        const cliLog = {
            info: (message) => spinner.info(message),
            error: (message, stack) => {
                spinner.fail(chalk.red(message));
                if (stack && getDebugFlag()) {
                    log('error', stack);
                }
            },
            warn: (message) => spinner.warn(chalk.yellow(message)),
            debug: (message) => {
                if(getDebugFlag()){
                    spinner.stop();
                    log('debug', message);
                    spinner.start();
                }
            }
        };

        const pseudoSession = {
            env: process.env,
        };

        const result = await generateDocumentationFromCodeDirect(
            {
                projectRoot,
                documentationMap,
                overwrite: options.overwrite,
                // systemPrompt: options.systemPrompt // Removed
            },
            cliLog,
            { session: pseudoSession }
        );

        if (result.success && result.data) {
            spinner.succeed(chalk.green('Documentation generation from code process finished.'));
            log('info', chalk.bold('Summary:'));
            log('info', `  Successfully generated: ${chalk.green(result.data.overallTelemetry.successfulFiles)} files`);
            log('info', `  Failed: ${chalk.red(result.data.overallTelemetry.failedFiles)} files`);
            log('info', `  Skipped: ${chalk.yellow(result.data.overallTelemetry.skippedFiles)} files`);

            if (result.data.overallTelemetry.totalCost > 0) {
                log('info', chalk.bold('AI Usage:'));
                log('info', `  Total cost: ${chalk.blue(`$${result.data.overallTelemetry.totalCost.toFixed(5)}`)}`);
                log('info', `  Total tokens: ${chalk.blue(result.data.overallTelemetry.totalTokens)}`);
            }

            if (result.data.results && result.data.results.length > 0) {
                log('info', chalk.bold('\nDetails:'));
                result.data.results.forEach(fileResult => {
                    let statusChalk = chalk.gray;
                    if (fileResult.status === 'success') statusChalk = chalk.green;
                    else if (fileResult.status === 'error') statusChalk = chalk.red;
                    else if (fileResult.status === 'skipped') statusChalk = chalk.yellow;
                    log('info', `  - ${fileResult.source} -> ${fileResult.output}: ${statusChalk(fileResult.status)}`);
                    if (fileResult.status === 'error') {
                        log('error', `    Reason: ${fileResult.message}`);
                    }
                });
            }
        } else {
            spinner.fail(chalk.red(`Documentation generation from code failed: ${result.error?.message || 'Unknown error'}`));
        }
    } catch (error) {
        spinner.fail(chalk.red(`An unexpected error occurred: ${error.message}`));
        if (getDebugFlag()) {
            log('error', error.stack);
        }
        process.exit(1);
    }
}
export async function handleGenDocFromCodePlanCommand(args, context = {}, outputFormat = 'text') {
    const { projectRoot, planDocPath = 'docs/plan/gen-class.md', overwrite = false, projectOutlinePath } = args;
    const { session, reportProgress = () => {}, log, commandNameFromContext } = context;

    if (!log) {
        // Fallback logger if none provided, though it's expected.
        console.warn("Logger not provided to generateCodeFromDocumentation, using console.");
    }

    let systemPromptContent = "你是一个执行执行助手,你的任务是解析提供的类依赖关系优先级文档,并按照优先级顺序使用工具生成对应的代码文档,根据工具的响应结果同步更新文档中对应类处理状态. \n";
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

    log.info(`[CoreLogic:GenDocFromPlan] Starting code generation from documentation. Project: ${projectRoot}`);


    // 读取生成计划
    let planDocContent = '';
    if (planDocPath) {
        try {
            const planAbsolutePath = path.isAbsolute(planDocPath) ? planDocPath : path.join(projectRoot, planDocPath);
            if (fs.existsSync(planAbsolutePath)) {
                planDocContent = fs.readFileSync(planAbsolutePath, 'utf-8');
                log.info(`[CoreLogic:GenDocFromPlan] Successfully loaded project outline from: ${planAbsolutePath}`);
            } else {
                log.warn(`[CoreLogic:GenDocFromPlan] Project outline file not found at: ${planAbsolutePath}`);
            }
        } catch (error) {
            log.error(`[CoreLogic:GenDocFromPlan] Error reading project outline file at ${planDocPath}: ${error.message}`);
            // Continue without the outline if it fails to load
        }
    }

    if (!planDocContent) {
        log.error(`[CoreLogic:GenDocFromPlan] plan file is empty ${planDocPath}`);
        return {
            message: "The plan file does not exist or the content is empty.",
            results: [{codeFile: planDocPath, message: "The plan file does not exist or the content is empty."}]
        };
    }

    // 读取项目大纲
    let projectOutlineContent = '';
    if (projectOutlinePath) {
        try {
            const outlineAbsolutePath = path.isAbsolute(projectOutlinePath) ? projectOutlinePath : path.join(projectRoot, projectOutlinePath);
            if (fs.existsSync(outlineAbsolutePath)) {
                projectOutlineContent = fs.readFileSync(outlineAbsolutePath, 'utf-8');
                log.info(`[CoreLogic:GenDocFromPlan] Successfully loaded project outline from: ${outlineAbsolutePath}`);
            } else {
                log.warn(`[CoreLogic:GenDocFromPlan] Project outline file not found at: ${outlineAbsolutePath}`);
            }
        } catch (error) {
            log.error(`[CoreLogic:GenDocFromPlan] Error reading project outline file at ${projectOutlinePath}: ${error.message}`);
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

    let processedFilesCount = 0;


    systemPromptContent += `

Class dependent priority File Path: ${planDocPath}    
file content:
\`\`\`markdown
${planDocContent}
\`\`\`
---`;
    if (projectOutlineContent) {
        systemPromptContent += `

Project Outline File Path: ${projectOutlinePath}    
Project Outline:
\`\`\`markdown
${projectOutlineContent}
\`\`\`
---`;
    }

        let fileStatus = 'pending';
        let message = '';
        let individualTelemetryData = null;

        processedFilesCount++;
        overallTelemetry.filesProcessed = processedFilesCount;

        reportProgress({
            projectRoot,
            planDocPath,
            processedCount: processedFilesCount,
            status: 'processing',
            stage: 'Starting'
        });

        let tools = null;
        let toolClients = null;

        try {

            log.info(`[CoreLogic:GenDocFromPlan] start handler project: ${projectRoot}, plan: ${planDocPath}`);

            let userPrompt = '按照依赖关系优先级顺序生成类文档,完成后检查对应文档是否存在';

            log.info(`[CoreLogic:GenDocFromPlan] Calling AI service for ${projectRoot}  plan: ${planDocPath} start generate `);
            reportProgress({ processedCount: processedFilesCount, currentFile: projectRoot, status: 'ai_processing', stage: 'AI Call' });
            toolClients = await initMcpClient();
            tools = await getTools(toolClients);
            let innerTools = await getTool();
            let newTools= {
                ...tools,
                gen_code_doc: innerTools
            }

            let aiServiceResponse = await streamTextServiceFin({
                session, // Pass session from context
                systemPrompt: systemPromptContent,
                prompt: userPrompt,
                commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
                outputType: outputFormat === 'text' ? 'cli' : 'mcp',
                projectRoot,
                tools: newTools,
                activeTools: ['execute_command', 'list_directory', 'get_current_directory', 'change_directory', 'read_file', 'get_file_info', 'list_allowed_directories', 'sequentialthinking', 'resolve-library-id', 'get-library-docs', 'gen_code_doc'],
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

            message = `Successfully generated doc plan for ${projectRoot} from ${planDocPath} ,result: ${planFistFullText}`;
            log.info(`[CoreLogic:GenDocFromPlan] ${message}`);
            let existsSync = true;
            if (existsSync) {
                fileStatus = 'success';
                overallTelemetry.successfulFiles++;
            } else {
                fileStatus = 'created failed';
                overallTelemetry.failedFiles++;
            }
        } catch (error) {
            message = `Error processing document ${planDocPath} for code generation: ${error.message}`;
            log.error(`[CoreLogic:GenDocFromPlan] ${message}`, error.stack);
            fileStatus = 'error_processing';
            overallTelemetry.failedFiles++;
        }finally {
            await closeMcpClients(toolClients);
        }
        allResults.push({ document: planDocPath, codeFile: projectRoot, status: fileStatus, message, telemetryData: individualTelemetryData });
        reportProgress({ processedCount: processedFilesCount, currentFile: planDocPath, status: fileStatus, message, stage: 'Completed' });

    log.info("[CoreLogic:GenDocFromPlan] Code generation from documentation process completed.");

    if (outputFormat === 'text' && overallTelemetry.totalTokens > 0) {
        // Ensure displayAiUsageSummary is available and correctly imported
        if (typeof displayAiUsageSummary === 'function') {
            displayAiUsageSummary(overallTelemetry, 'cli');
        } else {
            log.warn("[CoreLogic:GenDocFromPlan] displayAiUsageSummary function not available for CLI telemetry output.");
        }
    }

    return {
        message: "Code generation from documentation process finished.",
        results: allResults,
        overallTelemetry
    };
}