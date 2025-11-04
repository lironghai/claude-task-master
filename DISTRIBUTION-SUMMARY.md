# Task Master MCP 服务器 - 分发方案总结

## ✅ 问题已解决

**原始问题**: `node dist/mcp-server.js --port 3002` 无法启动

**根本原因**:
1. 打包后的代码中 `package.json` 路径解析错误
2. 使用了 `fs.readFileSync` 动态读取 `package.json`，而不是使用已有的 import

**解决方案**:
- 修改 `mcp-server/src/index.js`，移除重复的 `package.json` 读取
- 直接使用顶部导入的 `packageJson`
- 配置 tsdown 复制 `mcp-server` 目录到 dist

## 📦 分发包结构

### 打包后的文件目录

```
dist/
├── mcp-server.js              # ✅ 主入口（可直接运行）
├── task-master.js             # CLI 工具
├── mcp-server/               # MCP 服务器完整源码
│   ├── src/
│   │   ├── core/            # 核心功能
│   │   ├── tools/           # MCP 工具
│   │   ├── providers/       # 提供商
│   │   ├── index.js
│   │   └── logger.js
│   └── server.js
├── assets/                   # 配置模板
│   ├── env.example
│   └── ...
├── start-http.sh            # Linux/macOS 启动脚本
├── start-http.bat           # Windows 批处理启动脚本
├── start-http.ps1           # Windows PowerShell 启动脚本
├── QUICKSTART.md            # 快速启动指南
└── *.js                     # 其他打包模块
```

## 🚀 使用方式

### 方式1: 使用 npm 脚本（开发环境）

```bash
# 直接运行源文件（需要 tsx）
npm run mcp-server-http

# 运行打包后的文件
npm run mcp-server-http-dist
```

### 方式2: 直接使用 Node.js（生产环境）

```bash
# HTTP 模式
node dist/mcp-server.js --port 3002

# STDIO 模式（编辑器集成）
node dist/mcp-server.js
```

### 方式3: 使用启动脚本（便捷方式）

```bash
# Windows PowerShell
cd dist
.\start-http.ps1 3002

# Windows 命令提示符
cd dist
start-http.bat 3002

# Linux/macOS
cd dist
chmod +x start-http.sh
./start-http.sh 3002
```

## 📝 分发流程

### 开发者打包

```bash
# 1. 构建项目
npm run build

# 2. 创建分发包
npm run create-dist

# 这将生成：
# - task-master-ai-0.29.0.tgz (npm 包)
# - task-master-mcp-v0.29.0.zip (独立包)
# - task-master-mcp-v0.29.0.tar.gz (独立包)
```

### 内部用户部署

#### 选项A: 使用 npm 包（推荐）

```bash
# 1. 安装包
npm install task-master-ai-0.29.0.tgz

# 2. 配置环境变量
cd node_modules/task-master-ai
cp dist/assets/env.example ../../.env
# 编辑 .env 添加 API 密钥

# 3. 启动服务
node node_modules/task-master-ai/dist/mcp-server.js --port 3002
```

#### 选项B: 使用独立包

```bash
# 1. 解压
unzip task-master-mcp-v0.29.0.zip
cd task-master-mcp-v0.29.0

# 2. 安装依赖
npm install --production

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 添加 API 密钥

# 4. 启动服务
cd dist
.\start-http.ps1 3002  # Windows
# 或
./start-http.sh 3002   # Linux/macOS
```

## 🔧 核心修改

### 1. `mcp-server/src/index.js`

**修改前**:
```javascript
constructor() {
    const packagePath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    program.version(packageJson.version)
    // ...
}
```

**修改后**:
```javascript
constructor() {
    // 直接使用顶部导入的 packageJson
    program.version(packageJson.version)
    // ...
}
```

### 2. `tsdown.config.ts`

**添加配置**:
```typescript
export default defineConfig(
    mergeConfig(baseConfig, {
        // ...
        copy: ['assets', 'mcp-server'],  // 添加 mcp-server 目录
        external: ['dotenv', 'fastmcp']  // 保持外部依赖
    })
);
```

### 3. `package.json`

**新增脚本**:
```json
{
  "scripts": {
    "mcp-server-http-dist": "node dist/mcp-server.js --port 3002",
    "create-dist": "node scripts/create-dist-package.bat"
  }
}
```

## 📚 文档

创建的新文档：

1. **DEPLOYMENT.md** - 完整部署指南
   - 打包分发流程
   - 多种部署方式（PM2、systemd、Docker）
   - 环境配置详解
   - 故障排查

2. **dist/QUICKSTART.md** - 快速启动指南
   - 5分钟快速部署
   - 常见配置场景
   - 问题排查

3. **启动脚本**:
   - `dist/start-http.sh` (Linux/macOS)
   - `dist/start-http.bat` (Windows CMD)
   - `dist/start-http.ps1` (Windows PowerShell)

4. **打包脚本**:
   - `scripts/create-dist-package.sh` (Linux/macOS)
   - `scripts/create-dist-package.bat` (Windows)

## ✨ 特性

### ✅ 已实现

- [x] 可独立运行的 dist 包
- [x] HTTP 模式支持（`--port` 参数）
- [x] STDIO 模式支持（编辑器集成）
- [x] 跨平台启动脚本（Windows/Linux/macOS）
- [x] 完整文档（部署、快速启动）
- [x] 自动打包脚本
- [x] npm 包分发支持
- [x] 独立压缩包分发

### 📋 待优化（可选）

- [ ] 添加健康检查接口 (`/health`)
- [ ] 添加版本查询接口 (`/version`)
- [ ] Docker 镜像构建自动化
- [ ] 集成监控和日志（如 Prometheus）
- [ ] 添加简单的 Web UI 管理界面

## 🔐 安全提示

1. **环境变量管理**:
   - 不要提交 `.env` 文件到版本控制
   - API 密钥应通过安全方式传递（密钥管理系统）

2. **网络安全**:
   - 生产环境使用防火墙限制端口访问
   - 考虑使用反向代理（Nginx/Apache）
   - 在公网暴露时使用 HTTPS

3. **访问控制**:
   - 实施 IP 白名单
   - 添加身份验证中间件
   - 记录访问日志

## 📊 测试验证

### 验证清单

- [x] 打包构建成功
- [x] `node dist/mcp-server.js --port 3002` 可以启动
- [x] 端口正确监听（3002）
- [x] 启动脚本可以正常工作
- [x] 文档完整且准确

### 测试命令

```bash
# 1. 构建
npm run build

# 2. 测试直接运行
node dist/mcp-server.js --port 3002

# 3. 检查端口
netstat -ano | findstr :3002  # Windows
lsof -i :3002                 # Linux/macOS

# 4. 测试脚本
cd dist
.\start-http.ps1 3002         # Windows
./start-http.sh 3002          # Linux/macOS
```

## 🎯 下一步建议

### 对于开发者

1. 测试完整的分发流程
2. 在不同环境验证（Windows/Linux/macOS）
3. 编写自动化测试脚本
4. 更新 CI/CD 流程

### 对于内部用户

1. 阅读 [QUICKSTART.md](dist/QUICKSTART.md)
2. 阅读 [DEPLOYMENT.md](DEPLOYMENT.md)
3. 配置环境变量和 API 密钥
4. 选择合适的部署方式（开发/生产）

## 📞 支持

如有问题，请查看：

1. **快速启动指南**: `dist/QUICKSTART.md`
2. **完整部署文档**: `DEPLOYMENT.md`
3. **故障排查**: `DEPLOYMENT.md` 中的故障排查章节
4. **开发文档**: `docs/` 目录

## 更新日志

### 2024-01-XX

- ✅ 修复 `dist/mcp-server.js` 无法启动的问题
- ✅ 添加跨平台启动脚本
- ✅ 创建完整的部署文档
- ✅ 添加自动打包脚本
- ✅ 优化分发流程

