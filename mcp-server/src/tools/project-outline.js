import { z } from 'zod';
import { handleApiResult, createErrorResponse, withNormalizedProjectRoot } from './utils.js';
import { projectOutlineDirect } from '../core/direct-functions/project-outline.js';

export function registerProjectOutlineTool(server) {
  server.addTool({
    name: 'project_outline',
    description: '生成项目大纲，输出标准 markdown 文档',
    parameters: z.object({
      projectRoot: z.string().optional().describe('项目根目录（自动获取，无需手动填写）'),
      output: z.string().optional().describe('输出文件路径，默认 docs/project-outline.md')
    }),
    execute: withNormalizedProjectRoot(async (args, { log, session }) => {
      try {
        const result = await projectOutlineDirect(args, log, { session });
        return handleApiResult(result, log);
      } catch (error) {
        log.error(`Error in project_outline: ${error.message}`);
        return createErrorResponse(error.message);
      }
    })
  });
} 