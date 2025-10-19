# Task Master MCP 服务器部署指南

## 📦 打包分发

### 1. 构建项目

```bash
npm run build
```

构建完成后，`dist` 目录将包含所有必要的文件。

### 2. 分发包内容

打包后的文件结构：

```
dist/
├── mcp-server.js           # MCP 服务器主入口（可直接运行）
├── task-master.js          # CLI 工具
├── mcp-server/            # MCP 服务器源文件（打包时复制）
│   ├── src/
│   └── server.js
├── assets/                # 配置模板和资源文件
└── *.js                   # 其他打包后的模块
```

### 3. 创建分发包

#### 方式A：使用 npm pack（推荐）

```bash
npm pack
```

这将生成 `task-master-ai-<version>.tgz` 文件，包含所有必要的依赖信息。

#### 方式B：手动打包 dist 目录

```bash
# Windows PowerShell
Compress-Archive -Path dist,package.json,package-lock.json,.env.example -DestinationPath task-master-dist.zip

# Linux/macOS
tar -czf task-master-dist.tar.gz dist/ package.json package-lock.json .env.example
```

## 🚀 部署和启动

### 部署步骤

#### 使用 npm 包部署

```bash
# 1. 解压或安装包
npm install task-master-ai-<version>.tgz

# 2. 配置环境变量（复制示例文件）
cp node_modules/task-master-ai/dist/assets/env.example .env

# 3. 编辑 .env 文件，添加必要的 API 密钥
# 例如：ANTHROPIC_API_KEY=your_key_here
```

#### 使用 dist 目录部署

```bash
# 1. 解压分发包
unzip task-master-dist.zip
# 或
tar -xzf task-master-dist.tar.gz

# 2. 安装依赖
npm install --production

# 3. 配置环境变量
cp dist/assets/env.example .env
# 编辑 .env 文件
```

### 启动方式

#### 1. HTTP 模式启动（推荐用于内部服务）

```bash
# 直接运行打包后的文件
node dist/mcp-server.js --port 3002

# 或使用 npm 脚本（如果在项目目录）
npm run mcp-server-http
```

#### 2. STDIO 模式启动（用于 Cursor 等编辑器集成）

```bash
node dist/mcp-server.js
```

### 环境变量配置

创建 `.env` 文件并配置必要的 API 密钥：

```env
# Anthropic Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key

# Perplexity API（用于研究功能）
PERPLEXITY_API_KEY=your_perplexity_api_key

# OpenAI API（可选）
OPENAI_API_KEY=your_openai_api_key

# Google Gemini API（可选）
GOOGLE_API_KEY=your_google_api_key
```

## 🔧 生产环境配置

### 1. 使用 PM2 管理进程（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/mcp-server.js --name task-master-mcp -- --port 3002

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

### 2. 使用 systemd（Linux）

创建服务文件 `/etc/systemd/system/task-master-mcp.service`：

```ini
[Unit]
Description=Task Master MCP Server
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/task-master
ExecStart=/usr/bin/node /path/to/task-master/dist/mcp-server.js --port 3002
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl enable task-master-mcp
sudo systemctl start task-master-mcp
sudo systemctl status task-master-mcp
```

### 3. 使用 Docker（容器化）

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制必要文件
COPY dist ./dist
COPY package*.json ./
COPY .env.example ./.env

# 安装生产依赖
RUN npm ci --production

# 暴露端口
EXPOSE 3002

# 启动命令
CMD ["node", "dist/mcp-server.js", "--port", "3002"]
```

构建和运行：

```bash
# 构建镜像
docker build -t task-master-mcp .

# 运行容器
docker run -d \
  --name task-master-mcp \
  -p 3002:3002 \
  -e ANTHROPIC_API_KEY=your_key \
  task-master-mcp
```

## 🔍 验证部署

### 1. 检查服务状态

```bash
# 检查端口是否监听
# Windows
netstat -ano | findstr :3002

# Linux/macOS
netstat -tuln | grep 3002
# 或
lsof -i :3002
```

### 2. 测试连接

```bash
# 使用 curl 测试（如果服务支持 HTTP）
curl http://localhost:3002/health

# 或使用浏览器访问
# http://localhost:3002
```

### 3. 查看日志

```bash
# PM2
pm2 logs task-master-mcp

# systemd
sudo journalctl -u task-master-mcp -f

# Docker
docker logs -f task-master-mcp
```

## 📝 更新部署

### 更新步骤

```bash
# 1. 构建新版本
npm run build

# 2. 打包
npm pack

# 3. 在部署服务器上：
# 停止旧服务
pm2 stop task-master-mcp

# 备份旧版本
mv dist dist.backup

# 解压新版本
tar -xzf task-master-ai-<new-version>.tgz --strip-components=1

# 安装依赖
npm ci --production

# 启动新服务
pm2 start task-master-mcp
pm2 save
```

## 🛡️ 安全建议

1. **环境变量保护**
   - 不要将 `.env` 文件提交到版本控制
   - 使用环境变量管理工具（如 dotenv-vault）

2. **网络安全**
   - 在生产环境使用防火墙限制端口访问
   - 考虑使用反向代理（如 Nginx）
   - 启用 HTTPS（如果暴露到公网）

3. **访问控制**
   - 配置 IP 白名单
   - 实施身份验证机制

4. **监控和日志**
   - 设置日志轮转
   - 配置错误告警
   - 监控系统资源使用

## 📞 故障排查

### 常见问题

1. **端口已被占用**
   ```bash
   # 更换端口
   node dist/mcp-server.js --port 3003
   ```

2. **找不到模块**
   ```bash
   # 确保依赖已安装
   npm install --production
   ```

3. **权限错误**
   ```bash
   # Linux/macOS - 添加执行权限
   chmod +x dist/mcp-server.js
   ```

4. **API 密钥无效**
   - 检查 `.env` 文件配置
   - 验证 API 密钥是否有效
   - 确保密钥没有多余的空格或引号

## 📚 相关文档

- [主 README](./README.md)
- [命令参考](./docs/command-reference.md)
- [配置说明](./docs/configuration.md)

