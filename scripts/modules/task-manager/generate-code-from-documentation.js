import fs from 'fs';
import path from 'path';
import { generateTextService } from '../ai-services-unified.js';
import { displayAiUsageSummary } from '../ui.js';
import {fileURLToPath} from "url"; // Assuming ui.js is in scripts/modules/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SYSTEM_PROMPT_FOR_CODE_GEN = "You are an AI assistant that generates code from documentation. Analyze the provided documentation (requirements, specifications, or high-level descriptions) and generate corresponding code in the requested language/framework. Ensure the code is functional, follows best practices, and accurately implements the documented features.";
// const PROMPT_FILE_PATH_FOR_CODE_GEN = path.join(/* ... */, 'gen_code_from_doc.md'); // Placeholder for future enhancement
const PROMPT_FILE_PATH = path.join(__dirname, '../../../../docs/prompts/gen_code_from_doc.md'); // Old path

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
 * @param {string} [outputFormat='json'] - Output format, 'json' for structured data, 'text' for CLI (handles telemetry display).
 * @returns {Promise<object>} - An object containing the results and overall telemetry.
 */
export async function generateCodeFromDocumentation(args, context = {}, outputFormat = 'json') {
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

            const docContent = fs.readFileSync(docAbsolutePath, 'utf-8');
            
            let userPrompt = '';

            if (projectOutlineContent) {
                systemPromptContent += `Project Outline:\\n\`\`\`markdown\\n${projectOutlineContent}\\n\`\`\`\\n\\n---\\n\\n`;
            }

            userPrompt += `Documentation File: ${docRelativePath}\\n\\nDocumentation Content:\\n`;
            userPrompt += '```markdown\n'; // Use simple quotes for the fence
            userPrompt += docContent + '\n'; // Append content
            userPrompt += '```\n\n';      // Use simple quotes for the fence
            
            if (targetLanguage) {
                userPrompt += `Please generate the code in ${targetLanguage}.\n`;
            }
            if (targetFramework) {
                userPrompt += `If applicable, use the ${targetFramework} framework.\n`;
            }
            userPrompt += `The output code should be suitable for a file named ${path.basename(codeRelativePath)}.\n`;
            // userPrompt += "Ensure the generated code is complete and functional based on the documentation. Only output code blocks, cannot use the markup format, must write comments on the code blocks, and the code comments must specify each step's function in detail. Code comments can be made according to the code documentation";
            userPrompt += "Ensure the generated code is complete and functional based on the documentation. Please help me save the code to a file in the execution directory.";

            log.info(`[CoreLogic:GenCode] Calling AI service for ${docRelativePath}`);
            reportProgress({ processedCount: processedFilesCount, totalCount: totalFiles, currentFile: docRelativePath, status: 'ai_processing', stage: 'AI Call' });
            
            const aiServiceResponse = await generateTextService({
                session, // Pass session from context
                systemPrompt: systemPromptContent,
                prompt: userPrompt,
                commandName: commandNameFromContext, // Provided by caller (CLI/Direct func)
                outputType: outputFormat === 'text' ? 'cli' : 'mcp',
                projectRoot,
                filePathContext: docAbsolutePath,
            });

            if (!aiServiceResponse || typeof aiServiceResponse.mainResult !== 'string') { // Expecting string for code
                throw new Error('AI service did not return a valid string result for code generation.');
            }
            
            const generatedCode = aiServiceResponse.mainResult;
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
            
            const outputDir = path.dirname(codeAbsolutePath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
                log.info(`[CoreLogic:GenCode] Created directory: ${outputDir}`);
            }

            // fs.writeFileSync(codeAbsolutePath, generatedCode);
            message = `Successfully generated code for ${docRelativePath} to ${codeRelativePath}`;
            log.info(`[CoreLogic:GenCode] ${message}`);
            fileStatus = 'success';
            overallTelemetry.successfulFiles++;

        } catch (error) {
            message = `Error processing document ${docRelativePath} for code generation: ${error.message}`;
            log.error(`[CoreLogic:GenCode] ${message}`, error.stack);
            fileStatus = 'error_processing';
            overallTelemetry.failedFiles++;
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