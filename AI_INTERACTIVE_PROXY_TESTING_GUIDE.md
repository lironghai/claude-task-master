# AI Interactive Proxy - 测试指南

## 🧪 测试目的

验证修复后的 `ai_interactive_proxy` 工具能够正确维持多轮对话的上下文。

---

## 📋 测试场景

### 场景1：基本多轮对话测试

**目标**：验证 AI 能够记住之前的对话内容

**步骤**：

#### 第1轮：初始问题
```json
{
  "tool": "ai_interactive_proxy",
  "arguments": {
    "path": "/absolute/path/to/your/project",
    "prompt": "什么是依赖注入？请简要解释。"
  }
}
```

**预期结果**：
- ✅ `success: true`
- ✅ 返回依赖注入的简要解释
- ✅ 返回 `sessionId`（保存此ID用于后续测试）
- ✅ `isNewSession: true`
- ✅ `messageCount: 3` (system + user + assistant)

#### 第2轮：后续问题（关键测试）
```json
{
  "tool": "ai_interactive_proxy",
  "arguments": {
    "path": "/absolute/path/to/your/project",
    "prompt": "能给我一个 TypeScript 的代码示例吗？",
    "sessionId": "<从第1轮获取的sessionId>"
  }
}
```

**预期结果**：
- ✅ `success: true`
- ✅ AI 提供**依赖注入的 TypeScript 代码示例**（关键：能理解"它"指依赖注入）
- ✅ 相同的 `sessionId`
- ✅ `isNewSession: false`
- ✅ `messageCount: 5` (system + user1 + assistant1 + user2 + assistant2)

**失败标志（修复前的行为）**：
- ❌ AI 回复："请问您需要什么的代码示例？"
- ❌ AI 提供通用的 TypeScript 示例，与依赖注入无关
- ❌ AI 不记得之前讨论过依赖注入

---

### 场景2：连续多轮对话

**目标**：验证支持3轮以上的对话

**步骤**：

#### 第1轮
```json
{
  "path": "/your/project",
  "prompt": "解释一下单例模式"
}
```

#### 第2轮
```json
{
  "path": "/your/project",
  "prompt": "它有什么缺点？",
  "sessionId": "<第1轮的sessionId>"
}
```

#### 第3轮
```json
{
  "path": "/your/project",
  "prompt": "如何改进这些缺点？",
  "sessionId": "<第1轮的sessionId>"
}
```

#### 第4轮
```json
{
  "path": "/your/project",
  "prompt": "给我展示改进后的代码",
  "sessionId": "<第1轮的sessionId>"
}
```

**预期结果**：
- ✅ 每轮都能理解上下文
- ✅ `messageCount` 逐轮增加：3 → 5 → 7 → 9
- ✅ 第4轮能提供"改进后的单例模式代码"

---

### 场景3：自定义系统提示

**目标**：验证系统提示的持久性

**步骤**：

#### 第1轮：创建专家角色
```json
{
  "path": "/your/project",
  "prompt": "如何优化 React 应用的性能？",
  "sys_prompt": "你是一位 React 性能优化专家，拥有10年以上的经验。你的回答应该详细、技术性强，并提供具体的代码示例。"
}
```

#### 第2轮：后续提问
```json
{
  "path": "/your/project",
  "prompt": "能详细讲讲虚拟化列表吗？",
  "sessionId": "<第1轮的sessionId>"
}
```

**预期结果**：
- ✅ 第2轮仍然保持"React 性能优化专家"的角色
- ✅ 回答详细且专业
- ✅ 提供 React 虚拟化列表的具体代码示例

---

## 🔍 诊断检查

### 检查1：日志输出

**如何检查**：
- 查看 MCP Server 的日志输出
- 或使用测试脚本的日志

**期望看到**：
```
[INFO] Calling AI service with 3 messages (including history)  # 第1轮
[INFO] Calling AI service with 5 messages (including history)  # 第2轮
[INFO] Calling AI service with 7 messages (including history)  # 第3轮
```

**Debug 日志（如果启用）**：
```
[DEBUG] Using provided message history with 3 messages
[DEBUG] Using provided message history with 5 messages
[DEBUG] Using provided message history with 7 messages
```

**失败标志**：
```
[INFO] Calling AI service with prompt: "能给我代码示例吗?"  # 修复前的日志
# 或者
[DEBUG] Building messages from systemPrompt and prompt  # 未使用历史
```

---

### 检查2：会话文件内容

**位置**：`<project-root>/.taskmaster/sessions/<sessionId>.json`

**第1轮后的文件内容**：
```json
{
  "sessionId": "...",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful AI assistant..."
    },
    {
      "role": "user",
      "content": "什么是依赖注入？"
    },
    {
      "role": "assistant",
      "content": "依赖注入是一种设计模式..."
    }
  ]
}
```

**第2轮后的文件内容**：
```json
{
  "sessionId": "...",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful AI assistant..."
    },
    {
      "role": "user",
      "content": "什么是依赖注入？"
    },
    {
      "role": "assistant",
      "content": "依赖注入是一种设计模式..."
    },
    {
      "role": "user",
      "content": "能给我一个 TypeScript 的代码示例吗？"
    },
    {
      "role": "assistant",
      "content": "当然！这里是依赖注入的 TypeScript 示例..."
    }
  ]
}
```

**验证点**：
- ✅ `messages` 数组逐轮增加
- ✅ 角色顺序正确：system → user → assistant → user → assistant ...
- ✅ 内容完整保存

---

## 🛠️ 手动测试命令

### 使用测试脚本

```bash
# 第1轮
node mcp-server/src/core/direct-functions/test-ai-proxy.js \
  "D:\project\node\claude-task-master" \
  "什么是依赖注入？"

# 记录输出的 sessionId，例如：550e8400-e29b-41d4-a716-446655440000

# 第2轮（关键测试）
node mcp-server/src/core/direct-functions/test-ai-proxy.js \
  "D:\project\node\claude-task-master" \
  "能给我代码示例吗？" \
  "550e8400-e29b-41d4-a716-446655440000"
```

### 使用 MCP 客户端（如 Claude Desktop）

**配置 MCP Server**：
```json
{
  "mcpServers": {
    "task-master": {
      "command": "node",
      "args": ["d:\\project\\node\\claude-task-master\\mcp-server\\server.js"]
    }
  }
}
```

**测试调用**：
1. 在 Claude Desktop 中说："请使用 ai_interactive_proxy 工具问问 AI：什么是依赖注入？项目路径是 D:\project\node\claude-task-master"
2. 记录返回的 sessionId
3. 继续说："请使用同样的工具和会话ID继续问：能给我代码示例吗？"

---

## ✅ 验收标准

### 必须通过
- [x] **场景1第2轮**：AI 能理解"代码示例"指依赖注入的示例
- [x] **场景2第4轮**：AI 能提供改进后的代码（而非重新解释单例模式）
- [x] **日志检查**：看到 "Using provided message history with X messages"
- [x] **会话文件**：messages 数组逐轮增长

### 应该通过
- [ ] **场景3**：系统提示在多轮对话中保持一致
- [ ] **性能**：会话加载时间 < 100ms（对于<10轮的对话）
- [ ] **错误处理**：无效 sessionId 返回清晰的错误消息

### 可选
- [ ] **并发测试**：同一会话的并发请求不冲突
- [ ] **大型会话**：20+轮对话仍然正常工作

---

## 🐛 已知问题（修复前）

### Bug #1：AI 失忆
**症状**：第2轮提问时，AI 不记得第1轮的内容
**原因**：`generateTextService` 未传递历史消息
**状态**：✅ 已修复（2024-01-15）

### Bug #2：会话历史未使用
**症状**：虽然本地存储了完整对话，但调用 AI 时未传递
**原因**：只传递了 systemPrompt 和 prompt 参数
**状态**：✅ 已修复（2024-01-15）

---

## 📊 性能基准（参考）

| 场景 | 消息数 | 响应时间 | 会话文件大小 |
|------|--------|----------|--------------|
| 首次调用 | 3 | ~2-5s | ~1-2 KB |
| 第2轮 | 5 | ~2-5s | ~3-5 KB |
| 第5轮 | 11 | ~3-6s | ~8-12 KB |
| 第10轮 | 21 | ~3-7s | ~15-20 KB |

**注意**：
- 响应时间主要取决于 AI 服务的延迟
- 会话文件大小取决于每轮对话的长度
- 上述数据为估算值，实际值会有所不同

---

## 📞 支持

如果测试失败，请检查：
1. ✅ 是否使用了最新的代码（包含修复）
2. ✅ AI 提供商配置是否正确
3. ✅ 项目路径是否为绝对路径
4. ✅ `.taskmaster/sessions/` 目录是否有写权限

**日志级别**：
```bash
# 启用 Debug 日志查看详细信息
export DEBUG=task-master:*
# 或在代码中设置 log level
```

---

**文档版本**: 1.1
**最后更新**: 2024-01-15
**适用版本**: v1.0.0+（包含消息历史修复）

