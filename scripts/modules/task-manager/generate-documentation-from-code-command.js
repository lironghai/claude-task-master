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
import {genCodeDepRela} from "./gen-class-dep-rela.js";

/**
 * Handles the core logic for the 'generate-documentation-from-code' CLI command.
 * @param {object} options - Parsed command-line options.
 * @returns {Promise<void>}
 */
export async function handleGenerateDocumentationFromCodeCommand(options) {
    log('info','handleGenerateDocumentationFromCodeCommand called with options:', options);
    const spinner = ora(`Initializing documentation generation from code...  options: ${options}`).start();
    try {
        const projectRoot = options.projectRoot || findProjectRoot();
        if (!projectRoot) {
            spinner.fail(chalk.red('Error: Could not determine project root. Please specify with --project-root or run from within the project.'));
            process.exit(1);
        }

        let documentationMap;
        if (options.documentationMap) {
            try {
                documentationMap = JSON.parse(options.documentationMap);
                if (typeof documentationMap !== 'object' || documentationMap === null || Array.isArray(documentationMap)) {
                    throw new Error('Documentation map must be a valid JSON object.');
                }
            } catch (e) {
                spinner.fail(chalk.red(`Error parsing documentation map: ${e.message}`));
                process.exit(1);
            }
        } else {
            spinner.fail(chalk.red('Error: --documentation-map is required.'));
            process.exit(1);
        }

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