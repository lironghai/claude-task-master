# Task Master AI - Docker 部署指南

本指南详细说明如何使用 Docker 部署和运行 Task Master AI。

## 目录

- [快速开始](#快速开始)
- [挂载目录说明](#挂载目录说明)
- [环境变量配置](#环境变量配置)
- [运行模式](#运行模式)
- [使用示例](#使用示例)
- [故障排查](#故障排查)

## 快速开始

### 1. 构建镜像

```bash
# 克隆项目（如果还没有）
git clone https://github.com/eyaltoledano/claude-task-master.git
cd claude-task-master

# 构建 Docker 镜像
docker build -t task-master-ai:latest .
```

### 2. 配置环境变量

创建 `.env` 文件并配置至少一个 AI 提供商的 API Key：

```bash
# 创建 .env 文件
cat > .env << EOF
ANTHROPIC_API_KEY=your_anthropic_api_key_here
PERPLEXITY_API_KEY=your_perplexity_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
EOF
```

### 3. 启动服务

使用 docker-compose（推荐）：

```bash
# 启动 MCP Server
docker-compose up -d task-master-server

# 查看日志
docker-compose logs -f task-master-server
```

或使用 docker run：

```bash
docker run -d \
  --name task-master-server \
  -p 3002:3002 \
  -v "$(pwd):/workspace" \
  --env-file .env \
  task-master-ai:latest mcp-server-http
```

## 挂载目录说明

### 必须挂载的目录

#### `/workspace` - 项目工作目录

**用途**: Task Master 的主要工作目录，存储项目任务、配置和数据。

**重要性**: ⭐⭐⭐⭐⭐ 必须挂载

**存储内容**:
- `.taskmaster/` - Task Master 配置和数据目录
  - `tasks/tasks.json` - 任务数据文件
  - `config.json` - 项目配置
  - `state.json` - 标签系统状态
  - `docs/` - PRD 和文档
  - `reports/` - 分析报告
  - `templates/` - 模板文件

**挂载方式**:
```bash
# Docker run
-v /path/to/your/project:/workspace

# Docker Compose
volumes:
  - ./:/workspace
```

**示例**:
```bash
# 挂载当前项目目录
docker run -v "$(pwd):/workspace" task-master-ai:latest list

# 挂载指定项目目录
docker run -v "/home/user/my-project:/workspace" task-master-ai:latest next
```

### 可选挂载的目录

#### `/root/.taskmaster` - 全局配置目录

**用途**: Task Master 的全局配置、缓存和用户数据。

**重要性**: ⭐⭐⭐ 推荐挂载（如需共享全局配置）

**存储内容**:
- 全局模型配置
- 用户偏好设置
- 缓存数据
- 全局统计信息

**挂载方式**:
```bash
# Docker run
-v ~/.taskmaster:/root/.taskmaster

# Docker Compose
volumes:
  - ~/.taskmaster:/root/.taskmaster
```

#### `/root/.cursor` - Cursor MCP 配置

**用途**: Cursor 编辑器的 MCP 集成配置。

**重要性**: ⭐⭐ 可选（仅在使用 Cursor MCP 时）

**挂载方式**:
```bash
# Docker run
-v ~/.cursor:/root/.cursor

# Docker Compose
volumes:
  - ~/.cursor:/root/.cursor
```

#### `/root/.ollama` - Ollama 本地模型

**用途**: 如果使用本地 Ollama AI 模型。

**重要性**: ⭐⭐ 可选（仅在使用 Ollama 时）

**挂载方式**:
```bash
# Docker run
-v ~/.ollama:/root/.ollama

# Docker Compose
volumes:
  - ~/.ollama:/root/.ollama
```

## 环境变量配置

### 必需的环境变量

至少需要配置一个 AI 提供商的 API Key：

| 环境变量 | 说明 | 获取地址 |
|---------|------|---------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) API Key | https://console.anthropic.com/ |
| `OPENAI_API_KEY` | OpenAI API Key | https://platform.openai.com/api-keys |
| `GOOGLE_API_KEY` | Google (Gemini) API Key | https://makersuite.google.com/app/apikey |

### 推荐的环境变量

| 环境变量 | 说明 | 获取地址 |
|---------|------|---------|
| `PERPLEXITY_API_KEY` | Perplexity (研究模型) | https://www.perplexity.ai/settings/api |
| `GROQ_API_KEY` | Groq (快速推理) | https://console.groq.com/ |
| `XAI_API_KEY` | xAI (Grok) | https://console.x.ai/ |

### 可选的环境变量

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `NODE_ENV` | Node.js 运行环境 | `production` |
| `TASKMASTER_LOG_LEVEL` | 日志级别 | `info` |
| `OLLAMA_BASE_URL` | Ollama API 地址 | `http://localhost:11434/api` |

### 配置方式

#### 方式 1: 使用 .env 文件（推荐）

```bash
# 创建 .env 文件
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-xxxxx
PERPLEXITY_API_KEY=pplx-xxxxx
OPENAI_API_KEY=sk-xxxxx
TASKMASTER_LOG_LEVEL=info
EOF

# 使用 docker-compose（自动读取 .env）
docker-compose up -d

# 或使用 docker run
docker run --env-file .env task-master-ai:latest
```

#### 方式 2: 直接传递环境变量

```bash
docker run \
  -e ANTHROPIC_API_KEY=sk-ant-xxxxx \
  -e PERPLEXITY_API_KEY=pplx-xxxxx \
  task-master-ai:latest
```

#### 方式 3: 在 docker-compose.yml 中配置

```yaml
services:
  task-master-server:
    environment:
      - ANTHROPIC_API_KEY=sk-ant-xxxxx
      - PERPLEXITY_API_KEY=pplx-xxxxx
```

## 运行模式

Task Master 支持多种运行模式：

### 1. MCP Server (HTTP 模式)

**用途**: 为 Cursor、Windsurf 等编辑器提供 MCP 服务。

**端口**: 3002

**启动命令**:
```bash
# Docker Compose
docker-compose up -d task-master-server

# Docker Run
docker run -d \
  -p 3002:3002 \
  -v "$(pwd):/workspace" \
  --env-file .env \
  --name task-master-server \
  task-master-ai:latest mcp-server-http
```

**访问**: 
- Health Check: http://localhost:3002/health
- MCP API: http://localhost:3002

### 2. MCP Server (stdio 模式)

**用途**: 标准输入输出模式，用于 MCP 客户端直接通信。

**启动命令**:
```bash
docker run -i \
  -v "$(pwd):/workspace" \
  --env-file .env \
  task-master-ai:latest mcp-server
```

### 3. CLI 模式

**用途**: 直接执行 task-master CLI 命令。

**示例命令**:
```bash
# 列出任务
docker-compose run --rm task-master list

# 显示下一个任务
docker-compose run --rm task-master next

# 显示特定任务
docker-compose run --rm task-master show 1,2,3

# 解析 PRD
docker-compose run --rm task-master parse-prd scripts/prd.txt

# 初始化项目
docker-compose run --rm task-master init
```

### 4. 交互式 Shell

**用途**: 进入容器进行调试或执行多个命令。

**启动命令**:
```bash
# Docker Compose
docker-compose run --rm task-master cli

# Docker Run
docker run -it --rm \
  -v "$(pwd):/workspace" \
  --env-file .env \
  task-master-ai:latest cli
```

在 Shell 中可以执行：
```bash
node /app/dist/task-master.js list
node /app/dist/task-master.js next
node /app/dist/mcp-server.js --port 3002
```

## 使用示例

### 场景 1: 开发环境 - MCP Server 集成

1. 启动 MCP Server：
```bash
docker-compose up -d task-master-server
```

2. 在 Cursor/Windsurf 中配置 MCP：
```json
{
  "mcpServers": {
    "task-master-ai": {
      "url": "http://localhost:3002"
    }
  }
}
```

3. 在编辑器中使用：
```
"Initialize taskmaster-ai in my project"
"Parse my PRD at scripts/prd.txt"
"What's the next task I should work on?"
```

### 场景 2: CI/CD 环境 - 自动化任务管理

```bash
# Jenkins/GitLab CI 示例
docker run --rm \
  -v "$PWD:/workspace" \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  task-master-ai:latest list --status pending

docker run --rm \
  -v "$PWD:/workspace" \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  task-master-ai:latest generate
```

### 场景 3: 本地开发 - 使用 CLI

```bash
# 查看当前任务
docker-compose run --rm task-master list

# 获取下一个任务
docker-compose run --rm task-master next

# 展开复杂任务
docker-compose run --rm task-master expand --id=5 --research

# 更新任务状态
docker-compose run --rm task-master set-status --id=5 --status=done

# 研究最新技术
docker-compose run --rm task-master research \
  "What are the latest best practices for React Query v5?"
```

### 场景 4: 使用本地 AI 模型 (Ollama)

1. 取消注释 docker-compose.yml 中的 ollama 服务

2. 启动服务：
```bash
docker-compose up -d
```

3. 下载模型：
```bash
docker-compose exec ollama ollama pull llama2
docker-compose exec ollama ollama pull codellama
```

4. 配置 Task Master 使用 Ollama：
```bash
docker-compose run --rm task-master cli
# 在容器内
node /app/dist/task-master.js models --set-main ollama/llama2 --ollama
```

## 故障排查

### 问题 1: 容器启动失败

**症状**: 容器无法启动或立即退出

**解决方案**:
```bash
# 查看容器日志
docker-compose logs task-master-server

# 检查容器状态
docker-compose ps

# 验证环境变量
docker-compose config
```

### 问题 2: 无法访问 MCP Server

**症状**: http://localhost:3002 无法访问

**解决方案**:
```bash
# 检查端口是否被占用
lsof -i :3002  # macOS/Linux
netstat -ano | findstr :3002  # Windows

# 检查容器网络
docker-compose exec task-master-server curl http://localhost:3002/health

# 查看容器日志
docker-compose logs -f task-master-server
```

### 问题 3: 挂载目录权限问题

**症状**: 容器无法读写 /workspace 目录

**解决方案**:
```bash
# Linux: 检查目录权限
ls -la /path/to/project

# 修复权限
chmod -R 755 /path/to/project

# 或使用用户映射（Docker run）
docker run --user $(id -u):$(id -g) ...
```

### 问题 4: API Key 无效

**症状**: AI 命令失败，提示 API key 错误

**解决方案**:
```bash
# 验证环境变量是否正确传递
docker-compose exec task-master-server env | grep API_KEY

# 重新配置 API keys
# 1. 编辑 .env 文件
# 2. 重启容器
docker-compose restart task-master-server
```

### 问题 5: 容器内无法访问本地 Ollama

**症状**: 使用 Ollama 时连接失败

**解决方案**:
```bash
# macOS/Windows Docker Desktop
# 使用 host.docker.internal 代替 localhost
OLLAMA_BASE_URL=http://host.docker.internal:11434/api

# Linux
# 使用主机 IP 或 --network host
docker run --network host ...
# 或
OLLAMA_BASE_URL=http://172.17.0.1:11434/api
```

### 问题 6: 健康检查失败

**症状**: 容器状态显示 unhealthy

**解决方案**:
```bash
# 检查健康检查日志
docker inspect task-master-server | grep -A 10 Health

# 手动测试健康检查
docker-compose exec task-master-server curl -f http://localhost:3002/health

# 如果 MCP Server 没有 /health 端点，修改 Dockerfile 中的健康检查
```

## 高级配置

### 自定义构建

如果需要修改 Dockerfile：

```bash
# 修改 Dockerfile 后重新构建
docker-compose build --no-cache

# 或使用自定义构建参数
docker build \
  --build-arg NODE_VERSION=20 \
  --build-arg BUILD_ENV=production \
  -t task-master-ai:custom .
```

### 多阶段构建优化

Dockerfile 已经使用了多阶段构建来优化镜像大小：

- **构建阶段**: 安装所有依赖并构建项目
- **运行阶段**: 只包含运行时必需的文件

### 资源限制

在生产环境中建议设置资源限制：

```yaml
# docker-compose.yml
services:
  task-master-server:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### 日志管理

配置日志驱动和日志轮换：

```yaml
# docker-compose.yml
services:
  task-master-server:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## 安全建议

1. **不要在镜像中硬编码 API Keys**
   - 始终使用环境变量或密钥管理服务

2. **限制容器权限**
   ```bash
   docker run --read-only --tmpfs /tmp ...
   ```

3. **使用非 root 用户**
   - 可以在 Dockerfile 中添加：
   ```dockerfile
   RUN adduser -D taskmaster
   USER taskmaster
   ```

4. **定期更新基础镜像**
   ```bash
   docker pull node:18-alpine
   docker build --no-cache -t task-master-ai:latest .
   ```

5. **扫描安全漏洞**
   ```bash
   docker scan task-master-ai:latest
   ```

## 性能优化

1. **使用 BuildKit**
   ```bash
   DOCKER_BUILDKIT=1 docker build -t task-master-ai:latest .
   ```

2. **缓存层优化**
   - Dockerfile 已经优化了层的顺序
   - 先复制 package.json，再复制源代码

3. **使用 .dockerignore**
   - 减少构建上下文大小
   - 加快构建速度

## 总结

使用 Docker 部署 Task Master AI 的优势：

✅ **一致性**: 确保在不同环境中的行为一致  
✅ **隔离性**: 不影响主机系统  
✅ **便携性**: 轻松迁移和部署  
✅ **可扩展性**: 支持容器编排和集群部署  
✅ **版本控制**: 精确控制依赖版本  

关键要点：

1. **挂载 /workspace** 是必须的
2. **至少配置一个 AI API Key**
3. **根据使用场景选择运行模式**
4. **使用 docker-compose 简化管理**
5. **定期更新镜像和依赖**

## 参考资源

- [Task Master 文档](https://docs.task-master.dev)
- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [MCP 协议文档](https://modelcontextprotocol.io/)

## 获取帮助

如果遇到问题：

1. 查看 [GitHub Issues](https://github.com/eyaltoledano/claude-task-master/issues)
2. 加入 [Discord 社区](https://discord.gg/taskmasterai)
3. 查看项目文档: https://docs.task-master.dev


