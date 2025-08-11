import ora from 'ora';
import chalk from 'chalk';
import path from 'path'; 
import fs from 'fs'; 

import {findProjectRoot, log as uLog, log} from '../utils.js';
import { getDebugFlag } from '../config-manager.js';
import { generateDocumentationFromCodeDirect } from '../../../mcp-server/src/core/direct-functions/generate-documentation-from-code-direct.js';
import { generateTextService, streamTextService, writeToFile, getFullText, initMcpClient } from '../ai-services-unified.js';
import {tool} from "ai";
import {z} from "zod";
import {createErrorResponse, handleApiResult, withNormalizedProjectRoot} from "../../../mcp-server/src/tools/utils.js";
import {handleGenerateDocumentationFromCodeCommand} from "./generate-documentation-from-code-command.js";

/**
 * Handles the core logic for the 'generate-documentation-from-code' CLI command.
 * @param {object} options - Parsed command-line options.
 * @returns {Promise<void>}
 */
export async function handleGenDocFromCodeOneCommand(options) {
    log('info','handleGenDocFromCodeOneCommand called with options:', options);
    const spinner = ora(`Initializing documentation generation from code...  options: ${options}`).start();
    try {
        const projectRoot = options.projectRoot || findProjectRoot();
        if (!projectRoot) {
            spinner.fail(chalk.red('Error: Could not determine project root. Please specify with --project-root or run from within the project.'));
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
                projectOutlinePath: options.projectOutlinePath
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

        return result;
    } catch (error) {
        spinner.fail(chalk.red(`An unexpected error occurred: ${error.message}`));
        if (getDebugFlag()) {
            log('error', error.stack);
        }
        process.exit(1);
    }
}


export async function getTool() {
    return tool({
        name: "gen_code_doc",
        description: "解析指定的代码文件生成代码文档",
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
                log.error('[gen_code_doc] projectRoot is empty.');
                return createErrorResponse('projectRoot cannot be empty.');
            }

            if (!codeFilePath) {
                log.error('[gen_code_doc] codeFilePath is empty.');
                return createErrorResponse('codeFilePath cannot be empty.');
            }

            if (!docFilePath) {
                log.error('[gen_code_doc] docFilePath is empty.');
                return createErrorResponse('docFilePath cannot be empty.');
            }

            try {
                log.info(`[gen_code_doc] Starting generation. Project: ${projectRoot} codeFilePath: ${codeFilePath} docPath: ${docFilePath}. `);

                const directArgs = {
                    projectRoot,
                    codeFilePath,
                    docFilePath,
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
                const result = await handleGenDocFromCodeOneCommand(directArgs, coreContext);
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