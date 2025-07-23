import axios from 'axios';
import { log } from '../../scripts/modules/utils.js';
import readline from 'readline';
import { BaseAIProvider } from './base-provider.js';

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

// --- Internal Dify Agent Core Functions (Original logic preserved) ---

async function _internalGenerateDifyAgentText(params) {
  const {
    apiKey,
    messages,
    inputs = {},
    user = 'taskmaster',
    conversationId = '',
    files,
    commandName,
    outputType,
    baseUrl
  } = params;

  log('debug', `_internalGenerateDifyAgentText called (dify /chat-messages, streaming)`);

  if (!apiKey) throw new Error('Dify Agent API key is required.');
  const prompt = extractPrompt(messages);
  const query = extractQuery(messages);
  if (!query) throw new Error('Dify Agent: query (from messages) is required.');

  log('info', '[_internalDifyAgent] commandName: ', commandName);
  const endpoint = baseUrl || 'http://dify-new.huaweik1-bdc.yingxiong.com/v1/chat-messages';
  const data = {
    inputs: { ...inputs, prompt, tool_name: commandName, output_type: outputType },
    query,
    response_mode: 'streaming', // Dify's chat-messages is inherently streaming for completions
    conversation_id: conversationId,
    user,
  };
  if (files) data.files = files;

  log('debug', '[_internalDifyAgent] _internalGenerateDifyAgentText 调用参数', {
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
      timeout: params.timeout || 60000 // Use timeout from params or default
    });

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
        // console.log('Dify Agent 流块:', chunk); // Verbose logging
        if (chunk.event === 'message' || chunk.event === 'agent_message') {
          content += chunk.answer || '';
        }
        if (chunk.event === 'message_end') {
          usage = chunk.metadata?.usage || null;
          conversation_id = chunk.conversation_id;
        }
      } catch (e) {
        log('warn', 'Dify Agent text stream chunk parsing failed', { line });
      }
    }
    return {
      id: null, // Dify doesn't provide a top-level ID in this response structure
      object: 'text_completion',
      created: Date.now(),
      model: params.modelId || 'dify-agent', // Use modelId from params if available
      choices: [{
        message: { role: 'assistant', content },
        finish_reason: 'stop',
        index: 0
      }],
      usage, // { prompt_tokens, completion_tokens, total_tokens }
      conversation_id
    };
  } catch (err) {
    log('error', `Dify Agent API error in _internalGenerateDifyAgentText: ${err}`);
    // log('error', `Dify Agent API error in _internalGenerateDifyAgentText: ${err?.response?.data?.message || err.message}`);
    log('error', '[_internalDifyAgent] _internalGenerateDifyAgentText 调用参数: \n', JSON.stringify({
      url: endpoint,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      data
    }), "\n\n");
    throw new Error('Dify Agent API error: ' + (err?.response?.data?.message || err.message));
  }
}

async function _internalStreamDifyAgentText(params) {
  const {
    apiKey,
    modelId, // Dify modelId is the Agent ID for chat-messages endpoint
    messages,
    prompt: promptRaw, // This might be passed directly to inputs
    inputs = {}, // Custom inputs for Dify Agent
    user = 'taskmaster',
    // responseMode = 'streaming', // This is fixed for streaming endpoint in Dify
    baseUrl,
    // maxTokens, // Dify agent configuration handles this
    // temperature // Dify agent configuration handles this
    timeout
  } = params;

  const effectivePrompt = promptRaw || extractPrompt(messages);
  const query = extractQuery(messages);

  log('debug', `_internalStreamDifyAgentText called with Dify Agent ID: ${modelId}, effectivePrompt: ${effectivePrompt}`);

  if (!apiKey) throw new Error('Dify Agent API key is required.');
  // modelId for Dify is the Agent ID, used in logs but not directly in /chat-messages URL for this implementation
  // The endpoint itself implicitly uses the agent configured for the API key or a default one.
  // If Dify had different endpoints per agent ID, it would be used here.
  if (!query) throw new Error('Query (from messages) is required for Dify Agent.');

  const endpoint = baseUrl || 'http://dify-new.huaweik1-bdc.yingxiong.com/v1/chat-messages';
  const data = {
    inputs: { ...inputs, prompt: effectivePrompt, tool_name: commandName, output_type: outputType }, // Ensure prompt is part of inputs
    query,
    user,
    response_mode: 'streaming' // Fixed for this function
  };

  log('info', '[_internalDifyAgent] _internalStreamDifyAgentText 调用参数', {
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
      timeout: timeout || 60000
    });
    log('debug', `Dify Agent _internalStreamDifyAgentText initiated successfully for Dify Agent ID: ${modelId}`);
    return response.data; // ReadableStream
  } catch (error) {
    log('error', `Error initiating Dify Agent stream (Agent ID: ${modelId}): ${error.message}`, { error });
    throw new Error(`Dify Agent API error during streaming initiation: ${error.message}`);
  }
}

async function _internalGenerateDifyAgentObject(params) {
  const {
    apiKey,
    modelId, // Dify Agent ID
    messages,
    prompt: promptRaw,
    schema, // This schema is for the expected output object, Dify might need different handling
    inputs = {},
    user = 'taskmaster',
    // responseMode = 'streaming', // Let's use blocking for object generation for simplicity, or parse stream
    baseUrl,
    // maxTokens, // Dify agent config
    // temperature, // Dify agent config
    timeout
  } = params;

  const effectivePrompt = promptRaw || extractPrompt(messages);
  const query = extractQuery(messages);
  log('debug', `_internalGenerateDifyAgentObject called with Dify Agent ID: ${modelId}, effectivePrompt: ${effectivePrompt}`);

  if (!apiKey) throw new Error('Dify Agent API key is required.');
  if (!query) throw new Error('Query (from messages) is required for Dify Agent.');
  // Dify's /chat-messages doesn't directly take a JSON schema for output in the same way OpenAI tools do.
  // The expectation is that the agent is configured on Dify to produce structured output,
  // or the prompt itself guides the LLM to produce JSON which is then parsed from the `answer`.
  // We will attempt to parse JSON from the `answer` field if response_mode is blocking.

  const endpoint = baseUrl || 'https://api.dify.ai/v1/chat-messages';
  // For object generation, we'll use blocking mode and parse the result.
  const data = {
    inputs: { ...inputs, prompt: effectivePrompt }, 
    query,
    user,
    response_mode: 'blocking' // Use blocking for simpler object extraction
  };
  
  log('info', '[_internalDifyAgent] _internalGenerateDifyAgentObject 调用参数', {
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
      timeout: timeout || 60000
    });

    const result = response.data;
    // console.log('Dify Agent Object Raw Result:', result); // Verbose

    if (!result || !result.answer) {
      log('warn', 'Dify Agent object response did not contain expected answer field.', { result });
      throw new Error('Failed to extract answer from Dify Agent response for object generation.');
    }

    let parsedObject;
    try {
      parsedObject = JSON.parse(result.answer);
    } catch (parseError) {
      log('error', 'Failed to parse JSON from Dify Agent answer:', { answer: result.answer, parseError });
      throw new Error('Failed to parse JSON object from Dify Agent response. Ensure the Dify Agent is configured to return valid JSON in the answer field.');
    }
    
    log('debug', `Dify Agent _internalGenerateDifyAgentObject completed successfully for Dify Agent ID: ${modelId}`);
    return {
      object: parsedObject,
      usage: result.metadata?.usage || {}, // { prompt_tokens, completion_tokens, total_tokens }
      conversation_id: result.conversation_id,
      raw_answer: result.answer // Include raw answer for debugging if needed
    };
  } catch (error) {
    log('error', `Error in _internalGenerateDifyAgentObject (Agent ID: ${modelId}): ${error.message}`, { error });
    throw new Error(`Dify Agent API error during object generation: ${error.message}`);
  }
}

// --- DifyAgentProvider Class ---
export class DifyAgentProvider extends BaseAIProvider {
  constructor() {
    super();
    this.name = 'DifyAgent';
  }

  /**
   * Returns a configuration object for Dify Agent.
   * Dify doesn't use a traditional client instance like OpenAI SDK.
   * @param {object} params - Parameters for client initialization.
   * @param {string} params.apiKey - Dify API key.
   * @param {string} [params.baseUrl] - Optional custom API endpoint for Dify.
   * @returns {object} Configuration object for Dify.
   */
  getClient(params) {
    try {
      this.validateAuth(params); // BaseAIProvider will check for apiKey
      return {
        apiKey: params.apiKey,
        baseUrl: params.baseUrl, // Optional, will default in internal functions if not set
        // modelId is also passed in params to generateText/Object/streamText for logging/potential use
      };
    } catch (error) {
      this.handleError('client configuration retrieval', error);
    }
  }

  async generateText(params) {
    try {
      this.validateParams(params); // Validates apiKey, modelId, temp, maxTokens
      this.validateMessages(params.messages);

      log('debug', `Generating ${this.name} text with Dify Agent ID: ${params.modelId}`);
      
      // clientConfig will hold apiKey and baseUrl from getClient
      const clientConfig = this.getClient(params); 

      const result = await _internalGenerateDifyAgentText({
        ...params, // Pass all original params like messages, inputs, user, conversationId, files
        apiKey: clientConfig.apiKey,
        baseUrl: clientConfig.baseUrl,
        // modelId is already in params, used by _internalGenerateDifyAgentText for logging
        // timeout can be passed in params.timeout
      });

      log('debug', `${this.name} generateText completed successfully for Dify Agent ID: ${params.modelId}`);
      return {
        text: result.choices[0].message.content,
        usage: result.usage, // Already in { inputTokens, outputTokens, totalTokens } format from Dify
        conversationId: result.conversation_id,
        rawResponse: result // For potential further inspection
      };
    } catch (error) {
      this.handleError('text generation', error);
    }
  }

  async streamText(params) {
    try {
      this.validateParams(params);
      this.validateMessages(params.messages);
      log('debug', `Streaming ${this.name} text with Dify Agent ID: ${params.modelId}`);
      
      const clientConfig = this.getClient(params);

      // _internalStreamDifyAgentText expects parameters like apiKey, modelId, messages, inputs, baseUrl, etc.
      const stream = await _internalStreamDifyAgentText({
        ...params, // Pass through all relevant params like messages, inputs, user
        apiKey: clientConfig.apiKey,
        baseUrl: clientConfig.baseUrl,
        modelId: params.modelId // Ensure modelId (Dify Agent ID) is passed
        // timeout can be passed in params.timeout
      });

      log('debug', `${this.name} streamText initiated successfully for Dify Agent ID: ${params.modelId}`);
      return stream; // Returns the raw stream from axios
    } catch (error) {
      this.handleError('text streaming', error);
    }
  }

  async generateObject(params) {
    try {
      this.validateParams(params); // Validates apiKey, modelId, temp, maxTokens
      this.validateMessages(params.messages);
      // BaseAIProvider's generateObject also validates schema and objectName, but we call it here
      // to ensure it happens before our Dify specific logic if BaseAIProvider changes.
      if (!params.schema) {
        throw new Error('Schema is required for object generation');
      }
      // Dify doesn't use objectName in the same way as Vercel AI SDK
      // if (!params.objectName) {
      //   throw new Error('Object name is required for object generation');
      // }

      log('debug', `Generating ${this.name} object with Dify Agent ID: ${params.modelId}`);
      
      const clientConfig = this.getClient(params);

      const result = await _internalGenerateDifyAgentObject({
        ...params, // Pass through messages, inputs, user, schema (though Dify handles schema differently)
        apiKey: clientConfig.apiKey,
        baseUrl: clientConfig.baseUrl,
        modelId: params.modelId
        // timeout can be passed in params.timeout
      });

      log('debug', `${this.name} generateObject completed successfully for Dify Agent ID: ${params.modelId}`);
      return {
        object: result.object,
        usage: result.usage, // Already in { inputTokens, outputTokens, totalTokens } format from Dify
        conversationId: result.conversation_id,
        rawResponse: result // For potential further inspection
      };
    } catch (error) {
      this.handleError('object generation', error);
    }
  }
} 