import fs from 'fs';
import path, { dirname } from 'path';
import { z } from 'zod';
import { generateObjectService } from '../ai-services-unified.js';
import { log, writeJSON, enableSilentMode, disableSilentMode, isSilentMode } from '../utils.js';
import { getDebugFlag } from '../config-manager.js';
import generateTaskFiles from './generate-task-files.js';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Zod schema for outline result
const outlineSchema = z.object({
  outline: z.string().min(10), // markdown string
  metadata: z.object({
    projectName: z.string().optional(),
    generatedAt: z.string().optional()
  }).optional()
});

/**
 * 生成项目大纲，保存为 markdown 文件
 * @param {Object} options
 * @param {string} options.projectRoot - 项目根目录
 * @param {string} [options.output] - 输出文件路径
 * @param {Object} [options.session] - MCP session
 * @returns {Promise<{ outlinePath: string, telemetryData?: any }>} 结果对象
 */
export async function generateProjectCodeInit({ projectRoot, output, session, mcpLog }) {

  try {
    const aiServiceResponse = null;
    const targetDir = process.cwd();
    const targetPath = path.join(targetDir, 'tasks', 'tasks.json')
    const sourcePath = path.join(
      __dirname,
      '..',
      '..',
      'task-code-init',
      'tasks.json'
    );

    let content = fs.readFileSync(sourcePath, 'utf8');

    const replacements = {
      year: new Date().getFullYear()
    };

    // Replace placeholders with actual values
    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      content = content.replace(regex, value);
    });

    // If the file doesn't exist, create it normally
    fs.writeFileSync(targetPath, content);

    console.log('generateProjectCodeInit targetPath ', targetPath);
    log('info', `Created file: ${targetPath}`);
    // Generate markdown task files after writing tasks.json
    await generateTaskFiles(targetPath, path.dirname(targetPath), { mcpLog });
    const successMsg = `Successfully initialized tasks To-Do list and generated tasks in ${targetPath}`;

    return {
      message: successMsg,
      outlinePath: targetPath,
      telemetryData: aiServiceResponse?.telemetryData
    };
  }catch (error) {
      console.log('ProjectCodeInit 捕获到异常', error);
      log(`Error ProjectCodeInit: ${error.message}`, 'error');

      // Only show error UI for text output (CLI)
        console.error(chalk.red(`Error: ${error.message}`));

        if (getDebugFlag(projectRoot)) {
          // Use projectRoot for debug flag check
          console.error(error);
        }

        process.exit(1);
    }
} 