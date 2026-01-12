# AI Interactive Proxy - Quick Reference

## 🎉 重大更新（2024-01-15）

**✅ 修复关键Bug**：现在支持**真正的多轮对话**！

之前的实现虽然存储了会话历史，但从未传递给 AI，导致 AI 在每次调用时"失忆"。现已修复。

---

## 🚀 Quick Start

### Basic Usage (New Conversation)
```json
{
  "tool": "ai_interactive_proxy",
  "arguments": {
    "path": "/absolute/path/to/project",
    "prompt": "Your question here"
  }
}
```

### Continue Conversation
```json
{
  "tool": "ai_interactive_proxy",
  "arguments": {
    "path": "/absolute/path/to/project",
    "prompt": "Follow-up question",
    "sessionId": "YOUR-SESSION-ID-FROM-PREVIOUS-RESPONSE"
  }
}
```

### Custom AI Behavior
```json
{
  "tool": "ai_interactive_proxy",
  "arguments": {
    "path": "/absolute/path/to/project",
    "prompt": "Your question",
    "sys_prompt": "You are an expert in X. Provide detailed answers."
  }
}
```

## 📋 Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `path` | ✅ Yes | string | Project root (absolute path) |
| `prompt` | ✅ Yes | string | Your question/message |
| `sys_prompt` | ❌ No | string | Custom AI behavior (new sessions only) |
| `sessionId` | ❌ No | string | UUID to continue conversation |

## 📤 Response Format

```json
{
  "success": true,
  "data": {
    "response": "AI's answer...",
    "sessionId": "uuid-v4-string",
    "model": "claude-3-5-sonnet-20241022",
    "provider": "anthropic",
    "isNewSession": true,
    "messageCount": 3
  }
}
```

## 📁 Files Created

### Core Implementation
- ✅ `mcp-server/src/core/direct-functions/ai-interactive-proxy.js` (308 lines)
- ✅ `mcp-server/src/tools/ai-interactive-proxy.js` (79 lines)

### Documentation
- ✅ `mcp-server/src/tools/AI_INTERACTIVE_PROXY_USAGE.md` (265 lines)
- ✅ `mcp-server/src/tools/AI_INTERACTIVE_PROXY_README.md` (258 lines)
- ✅ `mcp-server/AI_INTERACTIVE_PROXY_CHECKLIST.md` (209 lines)
- ✅ `AI_INTERACTIVE_PROXY_SUMMARY.md` (250+ lines)

### Testing
- ✅ `mcp-server/src/core/direct-functions/__tests__/ai-interactive-proxy.test.js` (150 lines)
- ✅ `mcp-server/src/core/direct-functions/test-ai-proxy.js` (85 lines)

### Integration
- ✅ Modified `mcp-server/src/core/task-master-core.js` (3 changes)
- ✅ Modified `mcp-server/src/tools/tool-registry.js` (2 changes)

## 🧪 Testing

### Run Unit Tests
```bash
npm test
# or
npx vitest run mcp-server/src/core/direct-functions/__tests__/ai-interactive-proxy.test.js
```

### Manual Test
```bash
node mcp-server/src/core/direct-functions/test-ai-proxy.js \
  /path/to/your/project \
  "What is TypeScript?"
```

## 💾 Session Storage

Sessions are saved to:
```
<project-root>/.taskmaster/sessions/
├── 550e8400-e29b-41d4-a716-446655440000.json
└── 7c9e6679-7425-40de-944b-e07fc1f90ae7.json
```

## ❌ Error Codes

- `MISSING_PARAMETER` - Required parameter missing
- `PROJECT_NOT_FOUND` - Project path doesn't exist
- `SESSION_NOT_FOUND` - Invalid sessionId
- `SESSION_LOAD_ERROR` - Corrupted session file
- `AI_SERVICE_ERROR` - AI provider error
- `INTERNAL_ERROR` - Unexpected error

## 🔑 Key Features

✅ Multi-provider support (Anthropic, OpenAI, Google, Azure, etc.)
✅ Session persistence with conversation history
✅ Automatic context preservation
✅ Custom system prompts
✅ Token tracking and metadata
✅ Comprehensive error handling
✅ Security (UUID validation, safe paths)

## 📚 Documentation Links

- **User Guide**: `mcp-server/src/tools/AI_INTERACTIVE_PROXY_USAGE.md`
- **Developer Docs**: `mcp-server/src/tools/AI_INTERACTIVE_PROXY_README.md`
- **Checklist**: `mcp-server/AI_INTERACTIVE_PROXY_CHECKLIST.md`
- **Summary**: `AI_INTERACTIVE_PROXY_SUMMARY.md`

## 💡 Pro Tips

1. **Save sessionId**: Always keep the sessionId from responses to continue conversations
2. **Use descriptive sys_prompt**: Set clear expectations for AI behavior
3. **Monitor messageCount**: Keep track of conversation length
4. **Handle errors**: Check `success` field before using data
5. **Clean up old sessions**: Periodically remove unused session files

## ⚡ Common Use Cases

### Code Review
```json
{
  "path": "/my/project",
  "prompt": "Review the authentication logic in auth.js",
  "sys_prompt": "You are a security-focused code reviewer"
}
```

### Architecture Discussion
```json
{
  "path": "/my/project",
  "prompt": "How should I structure a microservices architecture?",
  "sys_prompt": "You are a senior software architect"
}
```

### Learning Assistant
```json
{
  "path": "/my/project",
  "prompt": "Explain dependency injection with examples"
}
```

## 🎯 Status

**Implementation**: ✅ Complete
**Testing**: ✅ Unit tests written
**Documentation**: ✅ Comprehensive docs
**Integration**: ✅ Registered in tool registry
**Ready**: ✅ Production ready

---

**Need Help?** Check the full documentation in `AI_INTERACTIVE_PROXY_USAGE.md`

