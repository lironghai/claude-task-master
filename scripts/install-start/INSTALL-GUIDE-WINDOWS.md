# Task Master MCP Server - Windows 安装和启动指南

## 📦 快速安装脚本

本项目提供了两个 Windows 安装脚本，可以自动完成安装和启动：

### PowerShell 脚本（推荐）

功能更强大，支持更多选项和彩色输出。

**基本用法：**
```powershell
# 自动查找最新 .tgz 并全局安装（推荐）
.\install-and-start.ps1

# 指定 .tgz 文件路径
.\install-and-start.ps1 -PackageSource "task-master-ai-0.29.0.tgz"

# 从 npm registry 安装（需要明确指定）
.\install-and-start.ps1 -PackageSource "npm"

# 本地安装（而不是默认的全局安装）
.\install-and-start.ps1 -Local

# 指定端口
.\install-and-start.ps1 -Port 3003

# 跳过环境变量配置
.\install-and-start.ps1 -SkipEnvSetup

# 组合使用
.\install-and-start.ps1 -PackageSource "task-master-ai-0.29.0.tgz" -Port 3003
```

**参数说明：**
- `-PackageSource`: 包源路径
  - 留空：自动查找当前目录最新的 .tgz 文件
  - `"npm"`: 从 npm registry 安装
  - 文件路径：使用指定的 .tgz 文件
- `-Port`: HTTP 服务器端口（默认：3002）
- `-Local`: 本地安装开关（默认为全局安装）
- `-SkipEnvSetup`: 跳过环境变量配置向导

### 批处理脚本

兼容性更好，适用于所有 Windows 系统。

**基本用法：**
```cmd
# 自动查找最新 .tgz 并全局安装（推荐）
install-and-start.bat

# 指定 .tgz 文件路径，全局安装，端口 3002
install-and-start.bat task-master-ai-0.29.0.tgz

# 指定 .tgz 文件路径，端口 3003，全局安装
install-and-start.bat task-master-ai-0.29.0.tgz 3003

# 本地安装（而不是默认的全局安装）
install-and-start.bat task-master-ai-0.29.0.tgz 3002 local

# 从 npm registry 安装（参数1留空）
install-and-start.bat "" 3002 global
```

**参数说明（按顺序）：**
1. 包源路径
   - 留空：自动查找当前目录最新的 .tgz 文件
   - 文件路径：使用指定的 .tgz 文件
2. 端口号（默认：3002）
3. 安装类型（`local` 或 `global`，默认：`global`）

## 🛠️ 脚本功能

两个脚本都会自动执行以下步骤：

### 1. 检查环境
- ✅ 验证 Node.js 是否安装（需要 >= 18.0.0）
- ✅ 检查 npm 版本

### 2. 安装包
- 📦 从 npm registry 安装最新版本，或
- 📦 从本地 .tgz 文件安装

### 3. 配置 Task Master
- 🔍 查找当前目录的 `config.json` 文件
- 📁 自动拷贝到用户目录 `~/.taskmaster/config.json`
- ⚙️ 配置文件包含 AI 模型和参数设置

### 4. 启动服务器
- 🚀 询问是否立即启动
- 🌐 启动 HTTP 模式服务器
- 📊 显示访问地址

## 📋 使用场景

### 场景 1：最简单的使用（推荐）

将 .tgz 文件和脚本放在同一目录，直接运行：

```powershell
# PowerShell - 自动查找 .tgz，全局安装，端口 3002
.\install-and-start.ps1

# 或批处理
install-and-start.bat
```

安装后可以直接使用：
```cmd
task-master-mcp --port 3002
```

### 场景 2：分发给团队成员（开箱即用）

```powershell
# 1. 首先创建 .tgz 包
npm pack

# 2. 将以下文件打包分发给团队：
#    - task-master-ai-0.29.0.tgz
#    - install-and-start.ps1
#    - install-and-start.bat

# 3. 团队成员只需双击运行批处理文件，或在 PowerShell 中执行：
.\install-and-start.ps1
```

### 场景 3：开发环境（本地安装）

```powershell
# 本地安装，不污染全局环境
.\install-and-start.ps1 -Local
```

### 场景 4：从 npm 安装（无 .tgz 文件）

```powershell
# 明确指定从 npm registry 安装
.\install-and-start.ps1 -PackageSource "npm"
```

### 场景 5：快速测试（跳过环境配置）

```powershell
# 快速安装测试，稍后手动配置环境变量
.\install-and-start.ps1 -SkipEnvSetup
```

## ⚙️ 配置文件

脚本会自动将 `config.json` 拷贝到用户目录，无需手动配置环境变量。

**配置文件位置：**
- Windows: `C:\Users\<用户名>\.taskmaster\config.json`
- 该文件包含 AI 模型选择、参数和其他设置

**配置说明：**
- 模型配置：`models.main.provider` 和 `models.main.modelId`
- API 密钥：通过环境变量或 MCP 配置文件设置
- 详细配置选项请查看配置文件中的注释

## 🎯 安装后的使用

### 本地安装

```cmd
# 使用 npx 运行
npx task-master-mcp --port 3002

# 或使用 npm 脚本（如果在 package.json 中配置）
npm run mcp-server-http
```

### 全局安装

```cmd
# 直接运行命令
task-master-mcp --port 3002

# 或使用别名
task-master-ai --port 3002
```

## 🔧 故障排除

### 问题 1：PowerShell 执行策略限制

**错误信息：**
```
无法加载文件 install-and-start.ps1，因为在此系统上禁止运行脚本
```

**解决方案：**
```powershell
# 临时允许当前会话运行脚本
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# 然后运行脚本
.\install-and-start.ps1
```

或者使用批处理脚本：
```cmd
install-and-start.bat
```

### 问题 2：Node.js 版本过低

**错误信息：**
```
Node.js 版本过低 (需要 >= 18.0.0)
```

**解决方案：**
1. 访问 https://nodejs.org
2. 下载并安装 LTS 版本
3. 重新运行安装脚本

### 问题 3：找不到 env.example

**错误信息：**
```
未找到 env.example 模板
```

**解决方案：**
手动创建 `.env` 文件：
```env
# 添加至少一个 API 密钥
ANTHROPIC_API_KEY=your_key_here
```

### 问题 4：端口被占用

**错误信息：**
```
Error: listen EADDRINUSE: address already in use :::3002
```

**解决方案：**
```cmd
# 方法 1：使用不同端口
.\install-and-start.ps1 -Port 3003

# 方法 2：找到并关闭占用端口的进程
netstat -ano | findstr :3002
taskkill /PID <进程ID> /F
```

### 问题 5：全局安装后找不到命令

**错误信息：**
```
'task-master-mcp' 不是内部或外部命令
```

**解决方案：**
```cmd
# 检查全局包路径
npm config get prefix

# 确保该路径在系统 PATH 中
# 或使用完整路径运行
%APPDATA%\npm\task-master-mcp --port 3002
```

## 📝 手动安装步骤

如果脚本无法正常工作，可以手动执行以下步骤：

```cmd
# 1. 安装包
npm install -g task-master-ai-0.29.0.tgz
# 或从 npm
npm install -g task-master-ai

# 2. 创建 .env 文件
copy node_modules\task-master-ai\dist\assets\env.example .env
notepad .env

# 3. 启动服务器
task-master-mcp --port 3002
```

## 🌐 验证安装

启动后，您应该看到：

```
================================================
   Task Master MCP Server - HTTP Mode
================================================

Port: 3002

✓ Node.js version: v18.x.x
Starting server...

Server listening at http://localhost:3002/mcp
```

**测试连接：**
```cmd
# Windows
curl http://localhost:3002/mcp

# 或在浏览器中访问
# http://localhost:3002/mcp
```

## 📚 相关文档

- [快速启动指南](./QUICKSTART.md)
- [环境变量配置](./assets/env.example)
- [完整部署文档](../DEPLOYMENT.md)

## 🆘 获取帮助

如遇问题，请：
1. 查看上述故障排除章节
2. 检查 [GitHub Issues](https://github.com/your-repo/task-master/issues)
3. 提交新的 Issue 并附上详细错误信息

---

**祝您使用愉快！** 🎉

