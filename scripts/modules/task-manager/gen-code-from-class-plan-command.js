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
import {getTool} from "./generate-code-from-documentation.js";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROMPT_FILE_PATH = path.join(__dirname, '../../../docs/prompts/analysis_doc_plan_execute2.md'); // Old path
/**
 * Handles the core logic for the 'generate-documentation-from-code' CLI command.
 * @param {object} options - Parsed command-line options.
 * @returns {Promise<void>}
 */
export async function handleGenCodeFromClassPlanCommand(args, context = {}, outputFormat = 'text') {
    const { projectRoot, planDocPath = 'docs/plan/gen-class.md', overwrite = false, projectOutlinePath } = args;
    const { session, reportProgress = () => {}, log, commandNameFromContext } = context;

    if (!log) {
        // Fallback logger if none provided, though it's expected.
        console.warn("Logger not provided to generateCodeFromDocumentation, using console.");
    }

    let systemPromptContent = "你是一个执行执行助手,你的任务是解析提供的类依赖关系优先级文档,并按照优先级顺序使用工具根据类文档生成对应的实现代码,根据工具的响应结果同步更新文档中对应类处理状态. \n";
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
                log.info(`[CoreLogic:GenDocFromPlan] Successfully loaded project dependencies from: ${planAbsolutePath}`);
            } else {
                log.warn(`[CoreLogic:GenDocFromPlan] Project dependencies file not found at: ${planAbsolutePath}`);
            }
        } catch (error) {
            log.error(`[CoreLogic:GenDocFromPlan] Error reading project dependencies file at ${planDocPath}: ${error.message}`);
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

            let userPrompt = '按照依赖关系优先级顺序生成类文档,完成后检查文档是否存在';

            log.info(`[CoreLogic:GenDocFromPlan] Calling AI service for ${projectRoot}  plan: ${planDocPath} start generate `);
            reportProgress({ processedCount: processedFilesCount, currentFile: projectRoot, status: 'ai_processing', stage: 'AI Call' });
            toolClients = await initMcpClient();
            tools = await getTools(toolClients);
            let innerTools = await getTool();
            let newTools= {
                ...tools,
                gen_code_by_doc: innerTools
            }

            let aiServiceResponse = await streamTextServiceFin({
                session, // Pass session from context
                systemPrompt: systemPromptContent,
                prompt: userPrompt,
                commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
                outputType: outputFormat === 'text' ? 'cli' : 'mcp',
                projectRoot,
                tools: newTools,
                activeTools: ['execute_command', 'list_directory', 'get_current_directory', 'change_directory', 'read_file', 'write_file', 'get_file_info', 'list_allowed_directories', 'sequentialthinking', 'resolve-library-id', 'get-library-docs', 'gen_code_by_doc'],
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