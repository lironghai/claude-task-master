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

const PROMPT_FILE_PATH = path.join(__dirname, '../../../docs/prompts/analysis_doc_plan_execute3.md'); // Old path
/**
 * Handles the core logic for the 'generate-documentation-from-code' CLI command.
 * @param {object} options - Parsed command-line options.
 * @returns {Promise<void>}
 */
export async function handleGenProjectInitCommand(args, context = {}, outputFormat = 'text') {
    const { projectRoot,overwrite = false, projectOutlinePath = 'docs/project-documentation.md' } = args;
    const { session, reportProgress = () => {}, log, commandNameFromContext } = context;

    if (!log) {
        // Fallback logger if none provided, though it's expected.
        console.warn("Logger not provided to generateCodeFromDocumentation, using console.");
    }

    let systemPromptContent = "你是一个项目初始化助手,你的任务是解析提供的项目大纲文档,并进行项目基本结构初始化,创建标准工作目录、管理项目依赖、初始化配置文件. 在使用 \n";
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

    log.info(`[CoreLogic:GenProjectInit] Starting code generation from documentation. Project: ${projectRoot}`);

    // 读取项目大纲
    let projectOutlineContent = '';
    if (projectOutlinePath) {
        try {
            const outlineAbsolutePath = path.isAbsolute(projectOutlinePath) ? projectOutlinePath : path.join(projectRoot, projectOutlinePath);
            if (fs.existsSync(outlineAbsolutePath)) {
                projectOutlineContent = fs.readFileSync(outlineAbsolutePath, 'utf-8');
                log.info(`[CoreLogic:GenProjectInit] Successfully loaded project outline from: ${outlineAbsolutePath}`);
            } else {
                log.warn(`[CoreLogic:GenProjectInit] Project outline file not found at: ${outlineAbsolutePath}`);
            }
        } catch (error) {
            log.error(`[CoreLogic:GenProjectInit] Error reading project outline file at ${projectOutlinePath}: ${error.message}`);
            // Continue without the outline if it fails to load
        }
    }

    if (!projectOutlineContent) {
        log.error(`[CoreLogic:GenProjectInit] project outline file is empty ${projectOutlinePath}`);
        return {
            message: "The project outline file does not exist or the content is empty.",
            results: [{codeFile: projectOutlinePath, message: "The project outline file does not exist or the content is empty."}]
        };
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
            projectOutlinePath,
            processedCount: processedFilesCount,
            status: 'processing',
            stage: 'Starting'
        });

        let tools = null;
        let toolClients = null;

        try {

            log.info(`[CoreLogic:GenProjectInit] start handler project: ${projectRoot}, plan: ${projectOutlinePath}`);

            let userPrompt = '根据项目类型与项目技术栈初始化项目，生成标准项目结构,并添加技术栈中需要的依赖,检查/生成项目标准目录、依赖管理（例如pom.xml）、项目配置文件';

            log.info(`[CoreLogic:GenProjectInit] Calling AI service for ${projectRoot}  plan: ${projectOutlinePath} start generate `);
            reportProgress({ processedCount: processedFilesCount, currentFile: projectRoot, status: 'ai_processing', stage: 'AI Call' });
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
                activeTools: ['execute_command', 'list_directory', 'create_directory', 'get_current_directory', 'change_directory', 'read_file', 'write_file', 'get_file_info', 'list_allowed_directories', 'sequentialthinking', 'resolve-library-id', 'get-library-docs'],
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

            message = `Successfully generated doc plan for ${projectRoot} from ${projectOutlinePath} ,result: ${planFistFullText}`;
            log.info(`[CoreLogic:GenProjectInit] ${message}`);
            let existsSync = true;
            if (existsSync) {
                fileStatus = 'success';
                overallTelemetry.successfulFiles++;
            } else {
                fileStatus = 'created failed';
                overallTelemetry.failedFiles++;
            }
        } catch (error) {
            message = `Error processing document ${projectOutlinePath} for code generation: ${error.message}`;
            log.error(`[CoreLogic:GenProjectInit] ${message}`, error.stack);
            fileStatus = 'error_processing';
            overallTelemetry.failedFiles++;
        }finally {
            await closeMcpClients(toolClients);
        }
        allResults.push({ document: projectOutlinePath, codeFile: projectRoot, status: fileStatus, message, telemetryData: individualTelemetryData });
        reportProgress({ processedCount: processedFilesCount, currentFile: projectOutlinePath, status: fileStatus, message, stage: 'Completed' });

    log.info("[CoreLogic:GenProjectInit] Code generation from documentation process completed.");

    if (outputFormat === 'text' && overallTelemetry.totalTokens > 0) {
        // Ensure displayAiUsageSummary is available and correctly imported
        if (typeof displayAiUsageSummary === 'function') {
            displayAiUsageSummary(overallTelemetry, 'cli');
        } else {
            log.warn("[CoreLogic:GenProjectInit] displayAiUsageSummary function not available for CLI telemetry output.");
        }
    }

    return {
        message: "Project init dir process finished.",
        results: allResults,
        overallTelemetry
    };
}