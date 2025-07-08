# Get System Info 工具使用文档

## 概述

`get_system_info` 是Task Master的一个MCP工具，用于获取当前系统的详细信息，包括平台类型、软件版本、环境配置等。该工具同时支持MCP调用和CLI命令行使用。

## 功能特性

- ✅ 跨平台支持 (Windows, macOS, Linux)
- ✅ 检测常见开发工具版本
- ✅ 识别终端和编辑器环境
- ✅ 检测特殊环境 (WSL, 远程环境)
- ✅ 返回中文键名的JSON格式
- ✅ 安全的命令执行机制

## 检测信息详情

| 检测项目 | 说明 | 示例输出 |
|---------|------|---------|
| 操作系统 | 当前平台类型 | `Windows`, `macOS`, `Linux` |
| Python版本 | Python或Python3版本 | `3.12.7` 或 `未安装` |
| Node.js版本 | Node.js运行时版本 | `20.10.0` 或 `未安装` |
| npm版本 | npm包管理器版本 | `10.2.3` 或 `未安装` |
| Go版本 | Go编程语言版本 | `1.21.0` 或 `未安装` |
| JDK版本 | Java开发工具包版本 | `1.8.0_441` 或 `未安装` |
| Maven版本 | Apache Maven版本 | `3.9.9` 或 `未安装` |
| Git版本 | Git版本控制工具版本 | `2.49.0` 或 `未安装` |
| Docker版本 | Docker容器版本 | `28.0.4` 或 `未安装` |
| 终端类型 | 当前使用的终端/编辑器 | `Cursor`, `VS Code`, `Windsurf` |
| WSL环境 | 是否运行在WSL环境中 | `true` 或 `false` |
| 远程环境 | 是否为远程开发环境 | `true` 或 `false` |

## 环境检测能力

### 终端/编辑器检测
- **PATH分析**: 优先通过PATH环境变量检测编辑器路径（最可靠）
- **Cursor**: 通过PATH中的cursor路径、`CURSOR_SESSION_ID`, `CURSOR_USER_ID`, `TERM_PROGRAM` 检测
- **VS Code**: 通过PATH中的vscode/code路径、`VSCODE_PID`, `VSCODE_CWD`, `TERM_PROGRAM` 检测  
- **Windsurf**: 通过PATH中的windsurf路径、`WINDSURF_SESSION_ID`, `CODEIUM_API_KEY` 检测
- **其他终端**: iTerm2, Terminal, Windows Terminal, PowerShell, Hyper, Alacritty

### WSL环境检测
- 检查 `/proc/version` 文件中的 Microsoft 或 WSL 标识
- 检查环境变量 `WSL_DISTRO_NAME`, `WSLENV`

### 远程环境检测
- **SSH连接**: `SSH_CLIENT`, `SSH_TTY`, `SSH_CONNECTION`
- **GitHub Codespaces**: `CODESPACES`
- **Gitpod**: `GITPOD_WORKSPACE_ID`
- **VS Code远程**: `VSCODE_REMOTE_CONTAINERS_SESSION`, `REMOTE_CONTAINERS`

## 使用方法

### 1. MCP调用 (推荐)

在支持MCP的编辑器中 (如 Cursor, VS Code, Windsurf)：

```text
获取当前系统信息
```

或者：

```text
请显示系统配置详情
```

### 2. CLI命令行使用

```bash
# 主命令
task-master system-info

# 使用别名
task-master sysinfo
```

### 3. 编程方式调用

```javascript
import { getSystemInfo } from './scripts/modules/task-manager/system-info.js';

// 获取系统信息
const result = await getSystemInfo({}, context, 'json');
console.log(result.systemInfo);
```

## 输出示例

### JSON格式输出 (MCP)
```json
{
  "success": true,
  "data": {
    "操作系统": "Windows",
    "Python版本": "3.12.7",
    "Node.js版本": "22.14.0",
    "npm版本": "10.9.2",
    "Go版本": "1.21.0",
    "JDK版本": "1.8.0_441",
    "Maven版本": "3.9.9", 
    "Git版本": "2.49.0",
    "Docker版本": "28.0.4",
    "终端类型": "Cursor",
    "WSL环境": false,
    "远程环境": false
  }
}
```

### 文本格式输出 (CLI)
```text
=== 系统信息 ===
操作系统: Windows
Python版本: 3.12.7
Node.js版本: 22.14.0
npm版本: 10.9.2
Go版本: 1.21.0
JDK版本: 1.8.0_441
Maven版本: 3.9.9
Git版本: 2.49.0
Docker版本: 28.0.4
终端类型: Cursor
WSL环境: false
远程环境: false
```

## 故障排除

### 1. 命令检测失败
如果某个工具版本显示为"未安装"，但实际已安装：

- 确保工具已添加到系统PATH环境变量
- 重启终端或编辑器
- 检查权限设置

### 2. Java版本检测问题
Java版本检测使用多种方法确保准确性：

1. **优先检测实际运行的版本**：使用 `java -version` 命令获取当前PATH中的Java版本
2. **JAVA_HOME检测**：检查环境变量指向的Java安装
3. **编译器检测**：使用 `javac -version` 作为备用方法
4. **路径扫描**：扫描常见的Java安装目录

如果检测失败：
- 确保Java已添加到系统PATH环境变量
- 验证 `java -version` 命令可在终端正常执行
- 检查JAVA_HOME环境变量设置

### 3. Python版本检测
工具会先尝试 `python3` 命令，然后尝试 `python` 命令：

- 在某些系统上可能只有其中一个可用
- 如果两个都不可用，则显示"未安装"

### 4. Node.js和npm版本检测
- **Node.js**: 使用 `node --version` 命令，自动去除版本号前的"v"前缀
- **npm**: 使用 `npm --version` 命令，直接获取版本号

### 5. Go版本检测
Go版本检测支持多种输出格式：

- 标准格式：`go version go1.21.0 windows/amd64`
- 简化格式：提取版本号部分
- 备用格式：处理不同平台的输出差异

### 6. WSL检测误判
如果WSL检测结果不准确：

- 检查 `/proc/version` 文件是否存在
- 验证WSL相关环境变量设置

## 技术细节

### 安全特性
- 命令执行超时限制 (5秒)
- 错误处理和日志记录
- 不执行用户输入的命令
- 只检测预定义的安全命令

### 性能考虑
- 并发执行多个检测命令
- 智能缓存避免重复检测
- 错误时快速失败

### 跨平台兼容性
- 支持 Windows、macOS、Linux
- 自动适应不同平台的命令差异
- 处理平台特定的输出格式

## 相关文档

- [Task Master 使用指南](../README.md)
- [MCP 工具配置](../docs/configuration.md)
- [命令行参考](../docs/command-reference.md) 