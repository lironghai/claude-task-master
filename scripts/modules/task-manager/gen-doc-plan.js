import fs from 'fs';
import path from 'path';
import {generateTextService, streamTextService, streamTextServiceFin,writeToFile, getFullText, initMcpClient, getTools, closeMcpClients} from '../ai-services-unified.js';
import {displayAiUsageSummary} from '../ui.js';
import {fileURLToPath} from "url";
import {getTool} from "./gen-class-dep-rela.js"; // Assuming ui.js is in scripts/modules/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SYSTEM_PROMPT_FOR_CODE_GEN = "You are an AI assistant that generates code from documentation. Analyze the provided documentation (requirements, specifications, or high-level descriptions) and generate corresponding code in the requested language/framework. Ensure the code is functional, follows best practices, and accurately implements the documented features.";
// const PROMPT_FILE_PATH_FOR_CODE_GEN = path.join(/* ... */, 'gen_code_from_doc.md'); // Placeholder for future enhancement
const PROMPT_FILE_PATH = path.join(__dirname, '../../../docs/prompts/gen_doc_from_code_plan.md'); // Old path

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
export async function genDocFromCodePlan(args, context = {}, outputFormat = 'text') {
    const {
        projectRoot,
        planDocCustomizePath = 'docs/plan/gen-class.md',
        overwrite = false,
        targetLanguage,
        targetFramework,
        projectOutlinePath
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

    const allResults = [];
    let planPath = path.isAbsolute(planDocCustomizePath) ? planDocCustomizePath : path.join(projectRoot, planDocCustomizePath);
    let existsSync = fs.existsSync(planPath);
    if (existsSync && !overwrite) {
        let message = `Source plan file exists: ${planPath}`;
        log.error(`[CoreLogic:genDocFromCodePlan] ${message}`);
        let fileStatus = 'plan file exists';
        reportProgress({currentFile: planPath, status: fileStatus, message, stage: 'Completed'});
        allResults.push({document: planPath, status: fileStatus, message});
        return {
            message: message,
            results: allResults
        };
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

    log.info(`[CoreLogic:genDocFromCodePlan] Starting code generation from documentation. Project: ${projectRoot}`);

    let projectOutlineContent = '';
    if (projectOutlinePath) {
        try {
            const outlineAbsolutePath = path.isAbsolute(projectOutlinePath) ? projectOutlinePath : path.join(projectRoot, projectOutlinePath);
            if (fs.existsSync(outlineAbsolutePath)) {
                projectOutlineContent = fs.readFileSync(outlineAbsolutePath, 'utf-8');
                log.info(`[CoreLogic:genDocFromCodePlan] Successfully loaded project outline from: ${outlineAbsolutePath}`);
            } else {
                log.warn(`[CoreLogic:genDocFromCodePlan] Project outline file not found at: ${outlineAbsolutePath}`);
            }
        } catch (error) {
            log.error(`[CoreLogic:genDocFromCodePlan] Error reading project outline file at ${projectOutlinePath}: ${error.message}`);
            // Continue without the outline if it fails to load
        }
    }

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

    if (projectOutlineContent) {
        systemPromptContent += `

Project Outline File Path: ${projectOutlinePath}       
Project Outline:
\`\`\`markdown
${projectOutlineContent}
\`\`\`\\n\\n---\\n\\n`;
    }

    let fileStatus = 'pending';
    let message = '';

    reportProgress({
        status: 'processing',
        stage: 'Starting'
    });

    let individualTelemetryData = null;
    let tools = null;
    let toolClients = null;

    try {
        log.info(`[CoreLogic:genDocFromCodePlan] Processing start for ${projectRoot} to ${planPath}`);

        let userPrompt = '';

        userPrompt += `严格按照工作流程要求生成代码依赖优先级文档,文档内容必须经过反思和检查,确保包含项目中所有代码文件,并且不能搞错优先级顺序; 必须通过查看代码文件内容确定依赖关系,因为代码文件位置并不一定是规范的,不能仅通过目录与文件名确定优先级; 仅需输出最终文档内容,不需要输出思考过程, 按照要求文档格式输出.\n`;
        userPrompt += `需要分析的项目根路径: ${projectRoot} \n`;

        log.info(`[CoreLogic:genDocFromCodePlan] Calling AI service for ${planPath}`);
        reportProgress({
            status: 'ai_processing',
            stage: 'AI Call'
        });

        toolClients = await initMcpClient();
        tools = await getTools(toolClients);
        let innerTools = await getTool();
        let newTools= {
            ...tools,
            analysis_code_dependent_on: innerTools
        }
        let aiServiceResponse = await streamTextServiceFin({
            session, // Pass session from context
            systemPrompt: systemPromptContent,
            prompt: userPrompt,
            commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
            outputType: outputFormat === 'text' ? 'cli' : 'mcp',
            projectRoot,
            tools: newTools,
            activeTools: ['execute_command', 'list_directory', 'get_current_directory', 'change_directory', 'read_file', 'get_file_info', 'list_allowed_directories', 'sequentialthinking', 'resolve-library-id', 'get-library-docs', 'analysis_code_dependent_on'],
        });

        //  'search_files',

        let planFistFullText = await aiServiceResponse.mainResult.text;
        if (planFistFullText) {
            fs.writeFileSync(planPath, planFistFullText);
        }else {
            log.info(`[CoreLogic:genDocFromCodePlan] planFistFullText is null! planPath: ${planPath}`);
        }

        existsSync = fs.existsSync(planPath);

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

        message = `Successfully generated doc plan for ${projectRoot} to ${planPath}`;
        log.info(`[CoreLogic:genDocFromCodePlan] ${message}`);
        if (existsSync) {
            fileStatus = 'success';
            overallTelemetry.successfulFiles++;
        } else {
            fileStatus = 'created failed';
            overallTelemetry.failedFiles++;
        }
    } catch (error) {
        message = `Error processing document ${planPath} for code generation: ${error.message}`;
        log.error(`[CoreLogic:genDocFromCodePlan] ${message}`, error.stack);
        fileStatus = 'error_processing';
        overallTelemetry.failedFiles++;
    }finally {
        await closeMcpClients(toolClients);
    }
    allResults.push({document: planPath, status: fileStatus, message, telemetryData: individualTelemetryData});
    reportProgress({currentFile: planPath, status: fileStatus, message, stage: 'Completed'});

    log.info("[CoreLogic:genDocFromCodePlan] Code generation from documentation process completed.");

    if (outputFormat === 'text' && overallTelemetry.totalTokens > 0) {
        // Ensure displayAiUsageSummary is available and correctly imported
        if (typeof displayAiUsageSummary === 'function') {
            displayAiUsageSummary(overallTelemetry, 'cli');
        } else {
            log.warn("[CoreLogic:genDocFromCodePlan] displayAiUsageSummary function not available for CLI telemetry output.");
        }
    }

    return {
        message: "Code generation from documentation process finished.",
        results: allResults,
        overallTelemetry
    };



}

function shouldContinue(finishReason) {
    // 需要继续的情况
    const continueReasons = [
        // 'length',           // 达到最大token限制
        'tool-calls',       // 工具调用未完成
        // 'content-filter',   // 内容过滤
        // 'other'            // 其他原因
    ];

    // 应该停止的情况
    const stopReasons = [
        'stop',            // 正常完成
        'error'            // 错误
    ];

    return continueReasons.includes(finishReason);
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