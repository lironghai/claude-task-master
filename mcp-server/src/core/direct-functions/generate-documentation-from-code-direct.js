import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateTextService } from '../../../../scripts/modules/ai-services-unified.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant that generates Markdown documentation for code files. Ensure the documentation is clear, concise, and accurately describes the code's functionality, parameters, and return values where applicable.";
const PROMPT_FILE_PATH = path.join(__dirname, '../../../../docs/prompts/gen_doc_from_code.md'); // Old path

/**
 * Generates documentation for specified code files using an AI model.
 * This is the core logic function.
 * @param {object} args - The arguments for the function.
 * @param {string} args.projectRoot - The absolute root directory of the project.
 * @param {Record<string, string>} args.documentationMap - Map of source to output paths.
 * @param {boolean} [args.overwrite=false] - Whether to overwrite existing files.
 * @param {object} log - The logger object.
 * @param {object} context - The context object, containing the session.
 * @param {object} context.session - The MCP session object.
 * @param {function} [context.reportProgress] - Optional function to report progress for asynchronous operations.
 * @returns {Promise<object>} - An object containing the results and overall telemetry.
 */
export async function generateDocumentationFromCodeDirect(args, log, context = {}) {
    const { projectRoot, overwrite } = args;
    const { session, reportProgress = () => {} } = context;

    let systemPromptContent = "你是一个技术文档专家,专注于为软件项目生成清晰、准确且全面的技术文档，确保文档与代码的可复现性以及文档的可维护性和开发人员的理解。 当前用户工作空间根目录：D:\\project\\java\\temp-reverse-project";

    log.info(`[Direct] Starting documentation generation from code for project at: ${projectRoot}`);

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
    };

    let documentationMap = {
        "1": "1"
    }
    const totalFiles = Object.keys(documentationMap).length;
    let processedFiles = 0;

    if (totalFiles === 0) {
        log.info("[Direct] Documentation map is empty. Nothing to process.");
        return {
            success: true,
            data: {
                message: "Documentation map was empty. No files processed.",
                results: allResults,
                overallTelemetry
            }
        };
    }

    for (const [sourceRelativePath, outputRelativePath] of Object.entries(documentationMap)) {
        let fileStatus = 'pending';
        let message = '';
        let individualTelemetryData = null;

        reportProgress({
            processedCount: processedFiles,
            totalCount: totalFiles,
            currentFile: sourceRelativePath,
            status: 'processing'
        });

        try {
            log.info(`[Direct] Processing source file: ${sourceRelativePath}`);

            const userPrompt = `帮我查看这个项目的类类，使用的什么语言和框架，目录结构是怎样的，已经程序的启动入口在哪`;
            
            log.info(`[Direct] Calling AI service for ${sourceRelativePath}`);

            const aiServiceResponse = await generateTextService({
                role: 'user', // Per ai_services.mdc, this is the role for the *initial* provider selection
                session, 
                systemPrompt: systemPromptContent, // Pass the loaded or default system prompt
                prompt: userPrompt,
                commandName: 'mcp_generate_documentation_from_code_direct',
                outputType: 'mcp',
                projectRoot,
                filePathContext: "",
            });

            if (!aiServiceResponse || !aiServiceResponse.mainResult) {
                throw new Error('AI service did not return a valid result.');
            }
            
            const generatedDoc = aiServiceResponse.mainResult;
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
            
            const outputDir = path.dirname('.\\temp.txt');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
                log.info(`[Direct] Created directory: ${outputDir}`);
            }

            fs.writeFileSync('.\\temp.txt', generatedDoc);
            message = `Successfully generated documentation for ${sourceRelativePath} to ${outputRelativePath}`;
            log.info(`[Direct] ${message}`);
            fileStatus = 'success';
            overallTelemetry.successfulFiles++;

        } catch (error) {
            message = `Error processing file ${sourceRelativePath}: ${error.message}`;
            log.error(`[Direct] ${message}`, error.stack);
            fileStatus = 'error';
            overallTelemetry.failedFiles++;
        }
        allResults.push({ source: sourceRelativePath, output: outputRelativePath, status: fileStatus, message, telemetryData: individualTelemetryData });
        processedFiles++;
        reportProgress({
            processedCount: processedFiles,
            totalCount: totalFiles,
            currentFile: sourceRelativePath,
            status: fileStatus,
            message: message
        });
    }

    log.info("[Direct] Documentation generation from code process completed.");
    return {
        success: true,
        data: {
            message: "Documentation generation from code process finished.",
            results: allResults,
            overallTelemetry
        }
    };
}

export async function generateDocumentationFromCodeDirectV2(args, log, context = {}) {
    const { projectRoot, documentationMap, overwrite } = args;
    const { session, reportProgress = () => {} } = context;

    const promptFilePath = PROMPT_FILE_PATH;
    let systemPromptContent = DEFAULT_SYSTEM_PROMPT;

    try {
        if (fs.existsSync(promptFilePath)) {
            const fileContent = fs.readFileSync(promptFilePath, 'utf-8').trim();
            if (fileContent) {
                systemPromptContent = fileContent;
                log.info(`[Direct] Loaded system prompt from ${promptFilePath}`);
            } else {
                log.warn(`[Direct] Prompt file ${promptFilePath} is empty. Using default system prompt.`);
            }
        } else {
            log.warn(`[Direct] Prompt file ${promptFilePath} not found. Using default system prompt.`);
        }
    } catch (error) {
        log.error(`[Direct] Error reading system prompt file: ${error.message}. Using default system prompt.`);
    }

    log.info(`[Direct] Starting documentation generation from code for project at: ${projectRoot}`);

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
    };
    const totalFiles = Object.keys(documentationMap).length;
    let processedFiles = 0;

    if (totalFiles === 0) {
        log.info("[Direct] Documentation map is empty. Nothing to process.");
        return {
            success: true,
            data: {
                message: "Documentation map was empty. No files processed.",
                results: allResults,
                overallTelemetry
            }
        };
    }

    for (const [sourceRelativePath, outputRelativePath] of Object.entries(documentationMap)) {
        const sourceAbsolutePath = path.join(projectRoot, sourceRelativePath);
        const outputAbsolutePath = path.join(projectRoot, outputRelativePath);
        let fileStatus = 'pending';
        let message = '';
        let individualTelemetryData = null;

        reportProgress({
            processedCount: processedFiles,
            totalCount: totalFiles,
            currentFile: sourceRelativePath,
            status: 'processing'
        });

        try {
            log.info(`[Direct] Processing source file: ${sourceRelativePath}`);

            if (!fs.existsSync(sourceAbsolutePath)) {
                message = `Source file not found: ${sourceAbsolutePath}`;
                log.error(`[Direct] ${message}`);
                fileStatus = 'error';
                overallTelemetry.failedFiles++;
                allResults.push({ source: sourceRelativePath, output: outputRelativePath, status: fileStatus, message, telemetryData: null });
                continue;
            }

            if (fs.existsSync(outputAbsolutePath) && !overwrite) {
                message = `Output file ${outputAbsolutePath} already exists and overwrite is false. Skipping.`;
                log.info(`[Direct] ${message}`);
                fileStatus = 'skipped';
                overallTelemetry.skippedFiles++;
                allResults.push({ source: sourceRelativePath, output: outputRelativePath, status: fileStatus, message, telemetryData: null });
                continue;
            }

            const sourceCode = fs.readFileSync(sourceAbsolutePath, 'utf-8');
            const userPrompt = `Source File: ${sourceRelativePath}\n\nCode:\n\`\`\`\n${sourceCode}\n\`\`\`\n\nPlease generate the Markdown documentation for this code.`;

            log.info(`[Direct] Calling AI service for ${sourceRelativePath}`);
            const aiServiceResponse = await generateTextService({
                role: 'user', // Per ai_services.mdc, this is the role for the *initial* provider selection
                session,
                systemPrompt: systemPromptContent, // Pass the loaded or default system prompt
                prompt: userPrompt,
                commandName: 'mcp_generate_documentation_from_code_direct',
                outputType: 'mcp',
                projectRoot,
                filePathContext: sourceAbsolutePath,
            });

            if (!aiServiceResponse || !aiServiceResponse.mainResult) {
                throw new Error('AI service did not return a valid result.');
            }

            const generatedDoc = aiServiceResponse.mainResult;
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

            const outputDir = path.dirname(outputAbsolutePath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
                log.info(`[Direct] Created directory: ${outputDir}`);
            }

            fs.writeFileSync(outputAbsolutePath, generatedDoc);
            message = `Successfully generated documentation for ${sourceRelativePath} to ${outputRelativePath}`;
            log.info(`[Direct] ${message}`);
            fileStatus = 'success';
            overallTelemetry.successfulFiles++;

        } catch (error) {
            message = `Error processing file ${sourceRelativePath}: ${error.message}`;
            log.error(`[Direct] ${message}`, error.stack);
            fileStatus = 'error';
            overallTelemetry.failedFiles++;
        }
        allResults.push({ source: sourceRelativePath, output: outputRelativePath, status: fileStatus, message, telemetryData: individualTelemetryData });
        processedFiles++;
        reportProgress({
            processedCount: processedFiles,
            totalCount: totalFiles,
            currentFile: sourceRelativePath,
            status: fileStatus,
            message: message
        });
    }

    log.info("[Direct] Documentation generation from code process completed.");
    return {
        success: true,
        data: {
            message: "Documentation generation from code process finished.",
            results: allResults,
            overallTelemetry
        }
    };
}