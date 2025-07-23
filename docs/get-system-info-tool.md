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
|--------|------|---------|
| 操作系统 | 当前平台类型 | `Windows`, `macOS`, `Linux` |
| Python版本 | Python或Python3版本 | `3.12.7` 或 `未安装` |
| Node版本 | Node.js运行时版本 | `20.10.0` 或 `未安装` |
| npm版本 | npm包管理器版本 | `10.2.3` 或 `未安装` |
| Go版本 | Go编程语言版本 | `1.21.0` 或 `未安装` |
| JDK版本 | Java开发工具包版本 | `1.8.0_441` 或 `未安装` |
| Maven版本 | Apache Maven版本 | `3.9.9` 或 `未安装` |
| Git版本 | Git版本控制工具版本 | `2.49.0` 或 `未安装` |
| Docker版本 | Docker容器版本 | `28.0.4` 或 `未安装` |
| 本地IP | 本机局域网IP地址 | `192.168.1.100` 或 `无法获取` |
| 公网IP | 当前公网出口IP地址 | `101.126.15.236` 或 `无法获取` |
| 终端类型 | 当前使用的终端/编辑器 | `Cursor`, `VS Code`, `Windsurf` |
| WSL环境 | 是否运行在WSL环境中 | `true` 或 `false` |
| 远程环境 | 是否为远程开发环境 | `true` 或 `false` |

## 环境检测能力

### 终端/编辑器检测
**检测优先级（从高到低）**：
1. **运行时环境变量**（最可靠）：只有在对应编辑器中运行时才会设置
   - **Cursor**: `CURSOR_SESSION_ID`, `CURSOR_USER_ID`, `TERM_PROGRAM=Cursor`
   - **VS Code**: `VSCODE_PID`, `VSCODE_CWD`, `VSCODE_INJECTION`, `TERM_PROGRAM=vscode`
   - **Windsurf**: `WINDSURF_SESSION_ID`, `CODEIUM_API_KEY`
   - **特殊处理**: 如果检测到`TERM_PROGRAM=vscode`但PATH中包含Cursor且有`VSCODE_INJECTION=1`，则识别为Cursor（因为Cursor基于VS Code，会继承部分VS Code环境变量）
2. **终端程序标识**: `TERM_PROGRAM`（iTerm2, Terminal, Windows Terminal等）
3. **命令行终端特征**:
   - **PowerShell**: `PSMODULEPATH`、`POWERSHELL_DISTRIBUTION_CHANNEL`（区分PowerShell Core和Windows PowerShell）
   - **Command Prompt**: `PROMPT`+`COMSPEC`
   - **Git Bash**: `MSYSTEM`、`MINGW_CHOST`
   - **WSL**: `WSL_DISTRO_NAME`、`WSLENV`
4. **PATH检测**（备用）：仅在有额外确认条件时使用，避免误判

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
    "Node版本": "22.14.0",
    "npm版本": "10.9.2",
    "Go版本": "1.21.0",
    "JDK版本": "1.8.0_441",
    "Maven版本": "3.9.9", 
    "Git版本": "2.49.0",
    "Docker版本": "28.0.4",
    "本地IP": "192.168.1.100",
    "公网IP": "101.126.15.236",
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
Node版本: 22.14.0
npm版本: 10.9.2
Go版本: 1.21.0
JDK版本: 1.8.0_441
Maven版本: 3.9.9
Git版本: 2.49.0
Docker版本: 28.0.4
本地IP: 192.168.1.100
公网IP: 101.126.15.236
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

### 6. IP地址检测问题

**本地IP检测失败**：
- 确保网络接口正常工作
- 检查是否连接到网络
- 虚拟网络接口会被自动过滤，显示真实的物理网络IP

**公网IP检测失败**：
- 检查网络连接是否正常
- 确认防火墙没有阻止外部HTTP请求
- 工具会自动尝试多个IP检测服务以提高可靠性
- 如果所有服务都无法访问，会显示"无法获取"

### 7. 终端类型检测不准确

**问题**: 终端类型检测显示错误的编辑器类型

**常见原因和解决方法**：

1. **Cursor显示为VS Code**：
   - 这是因为Cursor基于VS Code，会设置`TERM_PROGRAM=vscode`
   - 工具现在会检查PATH中是否包含Cursor以及`VSCODE_INJECTION`标识来准确识别
   - 如果仍然显示错误，请检查系统PATH环境变量

2. **命令行终端在编辑器中运行**：
   - 在编辑器的集成终端中运行命令会检测为对应的编辑器
   - 这是正确的行为，因为代码确实在编辑器环境中运行
   - 如果需要检测纯命令行终端，请在独立的终端窗口中运行

3. **检测优先级说明**：
   - 运行时环境变量 > 终端程序标识 > 命令行特征 > PATH检测
   - PATH检测只在没有其他明确指示器时使用，避免误判

### 8. Webhook上报问题

**Webhook调用失败**：
- 检查网络连接是否正常
- 验证Webhook URL是否正确且可访问
- 确认Bearer Token是否有效
- 检查防火墙或代理设置

**禁用Webhook功能**：
```bash
# 设置环境变量禁用Webhook
export SYSTEM_INFO_WEBHOOK_ENABLED=false
```

**自定义Webhook配置**：
```bash
# 使用自定义Webhook URL和Token
export SYSTEM_INFO_WEBHOOK_URL=https://your-webhook.com/endpoint
export SYSTEM_INFO_WEBHOOK_TOKEN=your-token
```

### 8. 终端类型检测问题

**问题：在命令行中执行仍显示编辑器名称**
- **原因**: 旧版本优先检查PATH，导致安装了编辑器但在命令行中运行也误报
- **解决**: 已修复检测优先级，现在优先检查运行时环境变量

**检测逻辑说明**：
- ✅ **运行时环境变量优先**: 只有真正在编辑器中运行才会设置这些变量
- ✅ **命令行终端增强检测**: 更准确识别PowerShell、Command Prompt、Git Bash
- ✅ **PATH检测降级**: 仅作为最后备用，需要额外确认条件

**如果检测仍然不准确**：
- 检查环境变量：`echo $TERM_PROGRAM` (Unix/Linux) 或 `echo %TERM_PROGRAM%` (Windows)
- 验证PowerShell：`echo $PSMODULEPATH` 或 `echo %PSMODULEPATH%`
- 确认Command Prompt：`echo %COMSPEC%`

### 9. WSL检测误判
如果WSL检测结果不准确：

- 检查 `/proc/version` 文件是否存在
- 验证WSL相关环境变量设置

## 技术细节

### IP地址检测机制

**本地IP检测**：
- 使用Node.js `os.networkInterfaces()` API获取网络接口信息
- 优先选择有线网络接口（Ethernet、以太网）
- 其次选择无线网络接口（Wi-Fi、WLAN）
- 自动过滤虚拟网络接口（Docker、VMware、VirtualBox等）
- 只返回IPv4地址，排除内部环回地址

**公网IP检测**：
- 使用多个可靠的IP检测服务确保高可用性
- 服务列表：api.ipify.org、ipv4.icanhazip.com、api.ip.sb、ifconfig.me
- 3秒超时限制，自动切换到下一个服务
- IP格式验证确保返回有效的IPv4地址
- 失败时返回"无法获取"而不是抛出错误

### 安全特性
- 命令执行超时限制 (10秒)
- HTTP请求超时限制 (3秒)
- 错误处理和日志记录
- 不执行用户输入的命令
- 只检测预定义的安全命令
- 公网IP检测使用HTTPS确保安全

### Webhook自动上报功能

当调用系统信息工具时，会自动将检测结果发送到指定的Webhook地址：

**配置方式**：
- 默认Webhook URL: `https://herogames.feishu.cn/base/automation/webhook/event/Kr9XaSwApw2weEhWeX2cMqd3nuh`
- 默认认证Token: `Bearer EAz-cozSTDv-4vGRlAmUjdPK`
- 可通过环境变量自定义配置

**环境变量配置**：
```bash
# Webhook URL（可选，默认使用内置URL）
SYSTEM_INFO_WEBHOOK_URL=https://your-custom-webhook-url.com/endpoint

# 认证Token（可选，默认使用内置Token）
SYSTEM_INFO_WEBHOOK_TOKEN=your-custom-token

# 启用/禁用Webhook功能（可选，默认启用）
SYSTEM_INFO_WEBHOOK_ENABLED=true
```

**上报数据格式**：
```json
{
  "timestamp": "2024-01-20T10:30:00.000Z",
  "event_type": "system_info_collected",
  "data": {
    "操作系统": "Windows",
    "Python版本": "3.12.7",
    "Node版本": "22.14.0",
    // ... 其他系统信息
  },
  "metadata": {
    "collection_time_ms": 1250,
    "source": "taskmaster-system-info",
    "version": "1.0.0"
  }
}
```

**安全特性**：
- 5秒超时限制防止阻塞
- 失败时不影响主要功能
- 支持Bearer Token认证
- 异步处理确保响应速度

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