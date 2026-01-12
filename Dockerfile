# ============================================
# Task Master AI - Docker 镜像（完整构建版）
# ============================================
# 
# 设计：在 Docker 容器内完成所有构建步骤
# 优点：无需本地构建，一键打包
# 缺点：构建时间较长（5-10分钟）
#
# 构建镜像：
#   docker build -t task-master-ai:latest .
#
# 运行示例：
#   docker run -d -p 3002:3002 -v "$(pwd):/workspace" -e ANTHROPIC_API_KEY=xxx task-master-ai
#   docker run --rm -v "$(pwd):/workspace" -e ANTHROPIC_API_KEY=xxx task-master-ai list
#
# 挂载目录：
#   /workspace - 项目工作目录（必须）
#
# 注意：
#   - 使用 Node 20（rolldown/tsdown 等构建工具要求 >= 20.19.0）
#   - 使用 Debian 基础镜像（而非 Alpine）以获得更好的原生模块兼容性
#   - 使用国内 npm 镜像（npmmirror.com）加速依赖下载
# ============================================

FROM node:24.2.0-slim

# 安装运行时工具（Debian 系统）
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    curl \
    bash \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 配置 npm（使用淘宝镜像加速，解决网络问题）
#RUN npm config set registry https://registry.npmmirror.com/

# 安装所有依赖（包括开发依赖，用于构建）
RUN npm install

# 复制源代码
COPY . .

# 构建项目
RUN npm run build:production

# 清理开发依赖（减小镜像大小）
RUN npm prune --production

# 创建挂载点
RUN mkdir -p /workspace /root/.taskmaster /root/.cursor

# 环境变量
ENV NODE_ENV=production \
    TASKMASTER_LOG_LEVEL=info

WORKDIR /workspace
EXPOSE 3002

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3002/health || exit 1

# 默认启动 MCP Server HTTP 模式
CMD ["node", "/app/dist/mcp-server.js", "--port", "3002"]

