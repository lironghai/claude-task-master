import axios from 'axios';
import { log } from '../../scripts/modules/utils.js';
import readline from 'readline';

/**
 * Helper: Extract prompt from messages array (OpenAI风格)
 * @param {Array} messages - 消息数组
 * @returns {string|null} 优先取role为system的内容，否则取最后一条user消息内容
 */
function extractPrompt(messages) {
  if (!Array.isArray(messages)) return null;
  // 优先取第一个role为system的消息
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'system' && messages[i].content) {
      return messages[i].content;
    }
  }
  // 否则取最后一条role为user的消息
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content) {
      return messages[i].content;
    }
  }
  return null;
}

/**
 * Helper: Extract query from messages array (OpenAI风格)
 * @param {Array} messages - 消息数组
 * @returns {string|null} 最后一条user消息内容
 */
function extractQuery(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content) {
      return messages[i].content;
    }
  }
  return null;
}

/**
 * Generates text using Dify /chat-messages API. 适配主流程OpenAI风格参数
 * @param {object} params - 包含 apiKey, messages, inputs, responseMode, user, conversationId, files, baseUrl
 * @returns {Promise<object>} The generated text content and usage.
 * @throws {Error} If API call fails.
 */
export async function generateDifyAgentText(params) {
  const {
    apiKey,
    messages,
    inputs = {},
    user = 'taskmaster',
    conversationId = '',
    files,
    baseUrl
  } = params;

  log('debug', `generateDifyAgentText called (dify /chat-messages, streaming)`);

  if (!apiKey) throw new Error('Dify Agent API key is required.');
  const prompt = extractPrompt(messages);
  const query = extractQuery(messages);
  if (!query) throw new Error('Dify Agent: query (from messages) is required.');

  const endpoint = baseUrl || 'https://api.dify.ai/v1/chat-messages';
  const data = {
    inputs: { ...inputs, prompt },
    query,
    response_mode: 'streaming',
    conversation_id: conversationId,
    user,
  };
  if (files) data.files = files;

  // 新增详细入参日志
  log('info', '[DifyAgent] generateDifyAgentText 调用参数', {
    url: endpoint,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    data
  });

  try {
    const res = await axios.post(endpoint, data, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      responseType: 'stream',
      timeout: 60000
    });
    // 消费流式响应
    let content = '';
    let usage = null;
    let conversation_id = null;
    const rl = readline.createInterface({ input: res.data });
    for await (const line of rl) {
      if (!line.trim().startsWith('data:')) continue;
      const jsonStr = line.trim().replace(/^data:\s*/, '');
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const chunk = JSON.parse(jsonStr);
        console.log('Dify Agent 流块:', chunk); // 打印每个块
        if (chunk.event === 'message' || chunk.event === 'agent_message') {
          content += chunk.answer || '';
        }
        if (chunk.event === 'message_end') {
          usage = chunk.metadata?.usage || null;
          conversation_id = chunk.conversation_id;
        }
      } catch (e) {
        log('warn', 'Dify Agent 流块解析失败', { line });
      }
    }
    return {
      id: null,
      object: 'text_completion',
      created: Date.now(),
      model: 'dify-agent',
      choices: [{
        message: { role: 'assistant', content },
        finish_reason: 'stop',
        index: 0
      }],
      usage,
      conversation_id
    };
  } catch (err) {
    log('error', `Dify Agent API error: ${err?.response?.data?.message || err.message}`);
    throw new Error('Dify Agent API error: ' + (err?.response?.data?.message || err.message));
  }
}

/**
 * Streams text using Dify Agent API. 支持OpenAI风格参数
 * @param {object} params - 包含 apiKey, modelId, messages, prompt, maxTokens, temperature, baseUrl 等
 * @returns {Promise<ReadableStream>} A readable stream of text deltas.
 * @throws {Error} If API call fails.
 */
export async function streamDifyAgentText(params) {
  const {
    apiKey,
    modelId,
    messages,
    prompt: promptRaw,
    inputs = {},
    user = 'taskmaster',
    responseMode = 'streaming',
    baseUrl,
    maxTokens,
    temperature
  } = params;
  const prompt = promptRaw || extractPrompt(messages);
  const query = extractQuery(messages);
  log('debug', `streamDifyAgentText called with modelId: ${modelId}, prompt: ${prompt}`);

  if (!apiKey) throw new Error('Dify Agent API key is required.');
  if (!modelId) throw new Error('Dify Agent ID (modelId) is required.');
  if (!prompt) throw new Error('Prompt is required for Dify Agent.');

  const endpoint = baseUrl || 'http://dify-new.huaweik1-bdc.yingxiong.com/v1/chat-messages';
  const data = {
    inputs: { ...inputs, prompt },
    query,
    user,
    response_mode: responseMode
  };

  // 新增详细入参日志
  log('info', '[DifyAgent] streamDifyAgentText 调用参数', {
    url: endpoint,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    data
  });

  try {
    const response = await axios.post(endpoint, data, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      responseType: 'stream',
      timeout: 60000
    });
    log('debug', `Dify Agent streamText initiated successfully for agent: ${modelId}`);
    return response.data; // ReadableStream
  } catch (error) {
    log('error', `Error initiating Dify Agent stream (Agent: ${modelId}): ${error.message}`, { error });
    throw new Error(`Dify Agent API error during streaming initiation: ${error.message}`);
  }
}

/**
 * Generates structured objects using Dify Agent API. 支持OpenAI风格参数
 * @param {object} params - 包含 apiKey, modelId, messages, prompt, schema, maxTokens, temperature, baseUrl 等
 * @returns {Promise<object>} The generated object and usage.
 * @throws {Error} If API call fails or object generation fails.
 */
export async function generateDifyAgentObject(params) {
  const {
    apiKey,
    modelId,
    messages,
    prompt: promptRaw,
    schema,
    inputs = {},
    user = 'taskmaster',
    responseMode = 'streaming',
    baseUrl,
    maxTokens,
    temperature
  } = params;
  const prompt = promptRaw || extractPrompt(messages);
  const query = extractQuery(messages);
  log('debug', `generateDifyAgentObject called with modelId: ${modelId}, prompt: ${prompt}`);

  if (!apiKey) throw new Error('Dify Agent API key is required.');
  if (!modelId) throw new Error('Dify Agent ID (modelId) is required.');
  if (!prompt) throw new Error('Prompt is required for Dify Agent.');

  const endpoint = baseUrl || 'https://api.dify.ai/v1/chat-messages';
  const data = {
    inputs: { ...inputs, prompt },
    query,
    user,
    response_mode: responseMode,
    schema // 假设Dify Agent支持schema参数
  };

  // 新增详细入参日志
  log('info', '[DifyAgent] generateDifyAgentObject 调用参数', {
    url: endpoint,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    data
  });

  if (responseMode === 'streaming') {
    // 流式响应解析
    try {
      const res = await axios.post(endpoint, data, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 60000
      });
      let object = {};
      let usage = null;
      let files = [];
      let conversation_id = null;
      let answer = '';
      let agent_thoughts = [];
      let agent_messages = '';
      const rl = readline.createInterface({ input: res.data });
      for await (const line of rl) {
        if (!line.trim().startsWith('data:')) continue;
        const jsonStr = line.trim().replace(/^data:\s*/, '');
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          log('info', '[DifyAgent][stream] 原始分块:', { line });
          const chunk = JSON.parse(jsonStr);
          log('info', '[DifyAgent][stream] 解析后分块:', { chunk });
          // 事件分流
          if (chunk.event === 'message' || chunk.event === 'agent_message') {
            answer += chunk.answer || '';
            agent_messages += chunk.answer || '';
          }
          if (chunk.event === 'agent_thought') {
            agent_thoughts.push({
              thought: chunk.thought,
              observation: chunk.observation,
              tool: chunk.tool,
              tool_input: chunk.tool_input,
              message_files: chunk.message_files,
              created_at: chunk.created_at
            });
          }
          if (chunk.event === 'message_file') {
            files.push({
              id: chunk.id,
              type: chunk.type,
              url: chunk.url,
              belongs_to: chunk.belongs_to
            });
          }
          if (chunk.event === 'message_end') {
            usage = chunk.metadata?.usage || null;
            conversation_id = chunk.conversation_id;
          }
        } catch (e) {
          log('warn', 'Dify Agent object流块解析失败', { line });
        }
      }
      // 聚合结构化对象
      object = {
        answer,
        agent_messages,
        agent_thoughts,
        files,
        conversation_id
      };
      return {
        object,
        usage: usage || {}
      };
    } catch (error) {
      log('error', `Dify Agent API error during object streaming: ${error.message}`);
      throw new Error(`Dify Agent API error during object streaming: ${error.message}`);
    }
  } else {
    // 非流式阻塞模式
    try {
      const response = await axios.post(endpoint, data, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });
      const result = response.data;
      if (!result || (!result.data && !result.object)) {
        log('warn', 'Dify Agent object response did not contain expected object.', { result });
        throw new Error('Failed to extract object from Dify Agent response.');
      }
      log('debug', `Dify Agent generateObject completed successfully for agent: ${modelId}`);
      return {
        object: result.data || result.object || {},
        usage: result.usage || {}
      };
    } catch (error) {
      log('error', `Error in generateDifyAgentObject (Agent: ${modelId}): ${error.message}`, { error });
      throw new Error(`Dify Agent API error during object generation: ${error.message}`);
    }
  }
} 