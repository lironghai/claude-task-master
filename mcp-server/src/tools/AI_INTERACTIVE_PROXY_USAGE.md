# AI Interactive Proxy Tool

## Overview

The `ai_interactive_proxy` tool provides a conversational AI interface with session management capabilities. It allows you to interact with AI models (Claude, OpenAI, Google AI, etc.) using your project's configured LLM provider while maintaining conversation context across multiple interactions.

## Features

- **Multi-provider support**: Uses the project's configured AI provider (Claude, OpenAI, Google, Azure, etc.)
- **Session management**: Maintains conversation history across multiple interactions
- **Persistent storage**: Sessions are saved to `.taskmaster/sessions/` directory
- **Flexible system prompts**: Customize AI behavior per session
- **Automatic context preservation**: All messages are preserved for context continuity

## Parameters

### `path` (required)
- **Type**: String
- **Description**: Absolute path to the project root
- **Example**: `"/Users/username/my-project"` or `"C:\\Users\\username\\my-project"`
- **Purpose**: Loads project-specific AI provider configuration

### `prompt` (required)
- **Type**: String
- **Description**: The user message/question to send to the AI
- **Example**: `"Explain the benefits of TypeScript"`

### `sys_prompt` (optional)
- **Type**: String
- **Description**: System prompt to define AI behavior and role
- **Example**: `"You are a senior software architect. Provide detailed technical explanations."`
- **Note**: Only used when creating a new session. Ignored for existing sessions.
- **Default**: Generic helpful assistant prompt

### `sessionId` (optional)
- **Type**: String (UUID v4 format)
- **Description**: Session ID to continue a previous conversation
- **Example**: `"550e8400-e29b-41d4-a716-446655440000"`
- **Note**: If not provided, a new session is created

## Response Format

```json
{
  "success": true,
  "data": {
    "response": "The AI's response text...",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "model": "claude-3-5-sonnet-20241022",
    "provider": "anthropic",
    "isNewSession": true,
    "messageCount": 3
  }
}
```

### Response Fields

- **response**: The AI model's reply to your prompt
- **sessionId**: UUID of the session (use this to continue the conversation)
- **model**: The specific model used (e.g., "claude-3-5-sonnet-20241022")
- **provider**: The AI provider used (e.g., "anthropic", "openai")
- **isNewSession**: Boolean indicating if this was a new or existing session
- **messageCount**: Total number of messages in the session (including system prompt)

## Usage Examples

### Example 1: Starting a New Conversation

```json
{
  "path": "/Users/username/my-project",
  "prompt": "What are the SOLID principles in software engineering?"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "response": "The SOLID principles are five design principles...",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "model": "claude-3-5-sonnet-20241022",
    "provider": "anthropic",
    "isNewSession": true,
    "messageCount": 3
  }
}
```

### Example 2: Continuing a Conversation

Use the `sessionId` from the previous response:

```json
{
  "path": "/Users/username/my-project",
  "prompt": "Can you provide code examples for each principle?",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "response": "Certainly! Here are code examples for each SOLID principle...",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "model": "claude-3-5-sonnet-20241022",
    "provider": "anthropic",
    "isNewSession": false,
    "messageCount": 5
  }
}
```

### Example 3: Custom System Prompt

```json
{
  "path": "/Users/username/my-project",
  "prompt": "How should I structure a React application?",
  "sys_prompt": "You are a React expert. Provide best practices and modern patterns. Focus on TypeScript and functional components."
}
```

## Session Storage

Sessions are stored in `.taskmaster/sessions/` within your project:

```
my-project/
└── .taskmaster/
    └── sessions/
        ├── 550e8400-e29b-41d4-a716-446655440000.json
        └── 7c9e6679-7425-40de-944b-e07fc1f90ae7.json
```

### Session File Format

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "projectRoot": "/Users/username/my-project",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:35:00.000Z",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful AI assistant..."
    },
    {
      "role": "user",
      "content": "What are the SOLID principles?"
    },
    {
      "role": "assistant",
      "content": "The SOLID principles are five design principles..."
    }
  ],
  "metadata": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "totalTokens": 1523
  }
}
```

## Error Handling

### Common Errors

#### Missing Required Parameter
```json
{
  "success": false,
  "error": {
    "code": "MISSING_PARAMETER",
    "message": "The prompt parameter is required and must be a non-empty string"
  }
}
```

#### Session Not Found
```json
{
  "success": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session not found: 550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### Invalid Session ID Format
```json
{
  "success": false,
  "error": {
    "code": "SESSION_LOAD_ERROR",
    "message": "Invalid session ID format: invalid-id"
  }
}
```

#### AI Service Error
```json
{
  "success": false,
  "error": {
    "code": "AI_SERVICE_ERROR",
    "message": "AI service call failed: API key not configured"
  }
}
```

## Integration with Task Master

The tool automatically uses the AI provider configured in your Task Master project:

- Reads from `.taskmaster/.env` or `.env` files
- Respects `main_provider`, `main_model` configuration
- Falls back to alternative providers if configured
- Uses project-specific parameters (temperature, max_tokens, etc.)

## Best Practices

1. **Save Session IDs**: Store the returned `sessionId` to continue conversations
2. **Use Descriptive System Prompts**: Set clear expectations for the AI's role
3. **Check Message Count**: Monitor session length to avoid context window limits
4. **Handle Errors Gracefully**: Always check the `success` field before using data
5. **Clean Up Old Sessions**: Periodically remove unused session files from `.taskmaster/sessions/`

## Tips

- **Multi-turn conversations**: Use the same sessionId for follow-up questions
- **Specialized assistants**: Create different sessions with different system prompts for different tasks
- **Context preservation**: The AI remembers all previous messages in the session
- **Provider flexibility**: The tool works with any AI provider configured in your project

## Limitations

- Session files are stored locally (not synced across machines)
- No automatic session expiration (manual cleanup required)
- System prompt cannot be changed for existing sessions
- Context window limits depend on the underlying AI model

