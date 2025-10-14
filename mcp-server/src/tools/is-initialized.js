import { z } from 'zod';
import { findProjectRoot } from '../../../scripts/modules/utils.js';
import { PROJECT_MARKERS } from '../core/utils/path-utils.js';
import fs from 'fs';
import path from 'path';
import {createErrorResponse, handleApiResult} from "./utils.js";

export function registerIsInitializedTool(server) {
    server.addTool({
        name: 'is_initialized',
        description: 'Check if the current project is already initialized with Task Master',
        parameters: z.object({
            projectRoot: z
                .string()
                .describe('The root directory for the project. If not provided, will try to detect automatically.')
        }),
        execute: async (args, context) => {
            const { log } = context;

            try {
                log.info(`Executing is_initialized tool with args: ${JSON.stringify(args)}`);

                // Determine project root
                let projectRoot = args.projectRoot;
                if (!projectRoot) {
                    projectRoot = findProjectRoot();
                }

                if (!projectRoot) {
                    return {
                        success: true,
                        data: {
                            initialized: false,
                            reason: 'Could not determine project root directory',
                            projectRoot: null
                        }
                    };
                }

                // Check for Task Master project markers
                const isInitialized = PROJECT_MARKERS.some(marker => {
                    const markerPath = path.join(projectRoot, marker);
                    return fs.existsSync(markerPath);
                });

                // Also check for .taskmaster directory specifically
                const taskmasterDir = path.join(projectRoot, '.taskmaster');
                const hasTaskmasterDir = fs.existsSync(taskmasterDir);

                // Check for tasks.json file
                const tasksJsonPath = path.join(projectRoot, '.taskmaster', 'tasks', 'tasks.json');
                const hasTasksJson = fs.existsSync(tasksJsonPath);

                const projectRulesPath = path.join(projectRoot, 'rules');
                const hasProjectRules = fs.existsSync(projectRulesPath);
                const claudedMdPath = path.join(projectRoot, 'CLAUDE.md');
                const hasClaudeMd = fs.existsSync(claudedMdPath);

                const result = {
                    initialized: isInitialized || hasTaskmasterDir || hasTasksJson,
                    projectRoot,
                    hasTaskmasterDir,
                    hasTasksJson,
                    hasProjectRules,
                    hasClaudeMd,
                    markersFound: PROJECT_MARKERS.filter(marker => {
                        const markerPath = path.join(projectRoot, marker);
                        return fs.existsSync(markerPath);
                    })
                };

                if (!result.initialized) {
                    result.reason = 'No Task Master project markers found';
                }

                log.info(`Project initialization check result: ${JSON.stringify(result)}`);


                const res = {
                    success: true,
                        data: result
                }
                return handleApiResult(
                    res,
                    log,
                    'Is Initialization failed',
                    undefined,
                    args.projectRoot
                );
            } catch (error) {
                const errorMessage = `Failed to check if project is initialized: ${error.message || 'Unknown error'}`;
                log.error(errorMessage, error);
                return createErrorResponse(errorMessage, { details: error.stack });
            }
        }
    });
}
