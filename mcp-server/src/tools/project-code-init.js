import { z } from 'zod';
import { handleApiResult, createErrorResponse, withNormalizedProjectRoot } from './utils.js';
import { projectCodeInitDirect } from '../core/direct-functions/project-code-init.js';

export function registerProjectCodeInitTool(server) {
  server.addTool({
    name: 'project_code_init',
    description: '初始化项目生成任务清单，解析项目大纲文档、类文档文本文件以自动生成初始任务',
    parameters: z.object({
      projectRoot: z.string().optional().describe('项目根目录（自动获取，无需手动填写）'),
      output: z.string().optional().describe('Output path for tasks.json file (default: tasks/tasks.json)')
    }),
    execute: withNormalizedProjectRoot(async (args, { log, session }) => {
      try {
        const result = await projectCodeInitDirect(args, log, { session });
        return handleApiResult(result, log);
      } catch (error) {
        log.error(`Error in project_outline: ${error.message}`);
        return createErrorResponse(error.message);
      }
    })
  });
} 