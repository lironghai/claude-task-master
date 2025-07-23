import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { generateTextService,generateObjectService, streamTextService, writeToFile, getFullText, initMcpClient } from '../ai-services-unified.js';
import { log, writeJSON, enableSilentMode, disableSilentMode, isSilentMode } from '../utils.js';
import { getDebugFlag } from '../config-manager.js';
import {fileURLToPath} from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_FILE_PATH = path.join(__dirname, '../../../docs/prompts/document-gen-summ.md');


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
export async function generateProjectOutline({ projectRoot, output, session, mcpLog }) {
  const outputPath = output || path.resolve(projectRoot, 'docs', 'project-outline.md');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 动态读取 systemPrompt 内容
  const systemPrompt2 = `你是一个专门分析项目大纲要求文档并生成结构化、逻辑有序、依赖感知和排序的可执行任务列表的AI助手。该列表以JSON格式呈现。
分析提供的项目大纲要求内容并生成大约10个顶级开发任务。如果项目大纲要求的复杂性或详细程度较高，根据项目大纲要求的复杂性生成更多任务。
每个任务应代表实现需求所需的逻辑工作单元，并专注于最直接和有效的方式来实现需求，避免不必要的复杂性或过度设计。为每个任务包括伪代码、实现细节和测试策略。查找最新的信息来实现每个任务。
从1开始分配顺序ID。仅基于项目大纲要求内容推断每个任务的标题、描述、细节和测试策略。
将状态设置为'pending'，依赖项设置为空数组[]，并将优先级初始设置为'medium'。
仅使用包含单个键"tasks"的有效JSON对象进行响应，其中值是遵循提供的Zod模式的任务对象数组。不要包含任何解释或Markdown格式。

每个任务应遵循以下JSON结构：
{
"id": number,
"title": string,
"description": string,
"status": "pending",
"dependencies": number[] (此任务依赖的任务ID),
"priority": "high" | "medium" | "low",
"details": string (实现细节),
"testStrategy": string (验证方法)
}

指南：

1. 除非复杂性需要，否则创建恰好10个任务，从1开始按顺序编号
2. 每个任务应该是原子性的，并且专注于单一职责，遵循最新的最佳实践和标准
3. 逻辑地排列任务 - 考虑依赖关系和实现顺序
4. 早期任务应首先关注设置和核心功能，然后是高级功能
5. 为每个任务包括明确的验证/测试方法
6. 设置适当的依赖项ID（一个任务只能依赖于ID较低的任务，可能包括现有ID小于1的任务）
7. 根据关键性和依赖顺序分配优先级（高/中/低）
8. 在“details”字段中包括详细的实现指导
9. 如果项目大纲要求包含细节的要求，严格遵守这些要求，在任务分解中不得丢弃它们
10. 始终旨在提供最直接的实现路径，避免过度设计或绕弯子的方法

项目大纲文档要求：
`
  // const systemPrompt = systemPrompt2 + fs.readFileSync(path.resolve(projectRoot, 'docs', 'summ', 'document-gen-summ.md'), 'utf-8');
  const systemPrompt = fs.readFileSync(PROMPT_FILE_PATH, 'utf-8');
  // const userPrompt = '请根据要求，生成符合规范的项目大纲任务清单。';
  const userPrompt = `请根据要求，生成详细的项目大纲，并帮我写入到指定文件 ${outputDir}。`;

  // 调用 AI 服务
  // const aiServiceResponse = await generateObjectService({
  //   role: 'main',
  //   session,
  //   projectRoot,
  //   schema: outlineSchema,
  //   objectName: 'project_outline',
  //   systemPrompt,
  //   prompt: userPrompt,
  //   commandName: 'generate-project-outline',
  //   outputType: session ? 'mcp' : 'cli'
  // });
  const aiServiceResponse = await generateTextService({
    session, // Pass session from context
    systemPrompt: systemPrompt,
    prompt: userPrompt,
    commandName: 'generate-project-outline', // Provided by caller (CLI/Direct func)
    outputType: 'cli' ,
    projectRoot,
    filePathContext: outputPath,
  });

  if (!aiServiceResponse || typeof aiServiceResponse.mainResult !== 'string') { // Expecting string for code
    throw new Error('AI service did not return a valid string result for code generation.');
  }

  // const outlineData = aiServiceResponse?.mainResult;
  // if (!outlineData || typeof outlineData.outline !== 'string') {
  //   throw new Error('AI 服务未返回有效的大纲内容');
  // }
  //
  // fs.writeFileSync(outputPath, outlineData.outline, 'utf-8');

  return {
    outlinePath: outputPath,
    telemetryData: aiServiceResponse?.telemetryData
  };
} 