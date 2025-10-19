# Task Master MCP Server - Windows 安装和启动脚本 (PowerShell)
# 用途：自动安装 task-master-ai 包并启动 HTTP 模式服务器

param(
    [string]$PackageSource = "",  # 包源：留空则自动查找最新.tgz，或指定文件路径，或使用 "npm" 从registry安装
    [int]$Port = 3002,             # HTTP服务器端口
    [switch]$Local,                # 本地安装（默认为全局安装）
    [switch]$SkipConfigSetup       # 跳过配置文件拷贝
)

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# 查找最新的 .tgz 包
function Find-LatestTgzPackage {
    Write-ColorOutput "在当前目录查找 .tgz 包..." "Yellow"
    
    $tgzFiles = Get-ChildItem -Path "." -Filter "*.tgz" -File | Where-Object {
        $_.Name -match "task-master.*\.tgz$"
    } | Sort-Object LastWriteTime -Descending
    
    if ($tgzFiles.Count -gt 0) {
        $latestTgz = $tgzFiles[0].FullName
        Write-ColorOutput "✓ 找到包文件: $($tgzFiles[0].Name)" "Green"
        return $latestTgz
    }
    
    Write-ColorOutput "⚠ 未找到 .tgz 包文件，将从 npm registry 安装" "Yellow"
    return $null
}

# 显示横幅
function Show-Banner {
    Write-Host ""
    Write-ColorOutput "================================================" "Cyan"
    Write-ColorOutput "   Task Master MCP Server - 安装和启动工具" "Cyan"
    Write-ColorOutput "================================================" "Cyan"
    Write-Host ""
}

# 检查 Node.js
function Test-NodeJS {
    Write-ColorOutput "检查 Node.js..." "Yellow"
    try {
        $nodeVersion = node --version
        $npmVersion = npm --version
        Write-ColorOutput "✓ Node.js 版本: $nodeVersion" "Green"
        Write-ColorOutput "✓ npm 版本: $npmVersion" "Green"
        
        # 检查版本是否满足要求 (>= 18.0.0)
        $versionNumber = $nodeVersion -replace 'v', ''
        $majorVersion = [int]($versionNumber -split '\.')[0]
        if ($majorVersion -lt 18) {
            Write-ColorOutput "✗ 错误: Node.js 版本过低 (需要 >= 18.0.0)" "Red"
            return $false
        }
        return $true
    } catch {
        Write-ColorOutput "✗ 错误: Node.js 未安装或不在 PATH 中" "Red"
        Write-ColorOutput "  请访问 https://nodejs.org 下载并安装 Node.js" "Yellow"
        return $false
    }
}

# 安装包
function Install-Package {
    param([string]$Source, [bool]$IsGlobal)
    
    Write-Host ""
    Write-ColorOutput "开始安装 Task Master..." "Yellow"
    
    $installCmd = if ($IsGlobal) { "npm install -g" } else { "npm install" }
    
    if ($Source) {
        # 从本地 .tgz 文件安装
        if (Test-Path $Source) {
            Write-ColorOutput "从本地包安装: $Source" "Cyan"
            $fullPath = Resolve-Path $Source
            & npm install $(if ($IsGlobal) { "-g" }) $fullPath
        } else {
            Write-ColorOutput "✗ 错误: 找不到包文件: $Source" "Red"
            return $false
        }
    } else {
        # 从 npm registry 安装
        Write-ColorOutput "从 npm registry 安装最新版本..." "Cyan"
        & npm install $(if ($IsGlobal) { "-g" }) task-master-ai
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "✓ 安装成功!" "Green"
        return $true
    } else {
        Write-ColorOutput "✗ 安装失败!" "Red"
        return $false
    }
}

# 拷贝配置文件到用户目录
function Copy-ConfigToUserDir {
    Write-Host ""
    Write-ColorOutput "配置 Task Master..." "Yellow"
    
    # 获取用户主目录
    $userHome = $env:USERPROFILE
    $taskMasterDir = Join-Path $userHome ".taskmaster"
    $targetConfigPath = Join-Path $taskMasterDir "config.json"
    
    # 查找 config.json 文件
    $configSource = $null
    $possiblePaths = @(
        "config.json",
        "assets\config.json",
        "dist\assets\config.json",
        "node_modules\task-master-ai\dist\assets\config.json"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $configSource = $path
            break
        }
    }
    
    if (-not $configSource) {
        Write-ColorOutput "⚠ 未找到 config.json 模板文件" "Yellow"
        Write-ColorOutput "  服务器将使用默认配置" "Yellow"
        return $false
    }
    
    Write-ColorOutput "找到配置文件: $configSource" "Cyan"
    
    # 创建 .taskmaster 目录（如果不存在）
    if (-not (Test-Path $taskMasterDir)) {
        Write-ColorOutput "创建目录: $taskMasterDir" "Cyan"
        New-Item -ItemType Directory -Path $taskMasterDir -Force | Out-Null
    }
    
    # 检查目标文件是否已存在
    if (Test-Path $targetConfigPath) {
        Write-ColorOutput "⚠ 配置文件已存在: $targetConfigPath" "Yellow"
        Write-ColorOutput "是否要覆盖现有配置？(Y/N): " "Yellow" -NoNewline
        $response = Read-Host
        
        if ($response -ne "Y" -and $response -ne "y") {
            Write-ColorOutput "✓ 保留现有配置" "Green"
            return $true
        }
    }
    
    # 拷贝配置文件
    try {
        Copy-Item $configSource $targetConfigPath -Force
        Write-ColorOutput "✓ 配置文件已拷贝到: $targetConfigPath" "Green"
        Write-Host ""
        Write-ColorOutput "📝 提示：您可以编辑此文件来配置 AI 模型和参数" "Cyan"
        return $true
    } catch {
        Write-ColorOutput "✗ 拷贝配置文件失败: $_" "Red"
        return $false
    }
}

# 启动服务器
function Start-Server {
    param([int]$ServerPort, [bool]$IsGlobal)
    
    Write-Host ""
    Write-ColorOutput "================================================" "Cyan"
    Write-ColorOutput "   启动 Task Master MCP Server (HTTP模式)" "Cyan"
    Write-ColorOutput "================================================" "Cyan"
    Write-Host ""
    Write-ColorOutput "端口: $ServerPort" "Green"
    Write-ColorOutput "地址: http://localhost:$ServerPort/mcp" "Green"
    Write-Host ""
    
    # 最后检查 .env
    if (-not (Test-Path ".env")) {
        Write-ColorOutput "⚠ 警告: 未找到 .env 文件" "Yellow"
        Write-ColorOutput "  服务器可能无法正常工作，请确保已配置 API 密钥" "Yellow"
        Write-Host ""
    }
    
    # 检查配置文件
    $userHome = $env:USERPROFILE
    $configPath = Join-Path $userHome ".taskmaster\config.json"
    if (-not (Test-Path $configPath)) {
        Write-ColorOutput "⚠ 警告: 未找到配置文件" "Yellow"
        Write-ColorOutput "  配置文件应位于: $configPath" "Yellow"
        Write-Host ""
    }
    
    Write-ColorOutput "正在启动服务器..." "Cyan"
    Write-Host ""
    
    try {
        if ($IsGlobal) {
            # 全局安装，使用命令
            & task-master-mcp --port $ServerPort
        } else {
            # 本地安装，使用 npx
            & npx task-master-mcp --port $ServerPort
        }
    } catch {
        Write-ColorOutput "✗ 启动失败: $_" "Red"
        Write-Host ""
        Write-ColorOutput "请尝试手动启动：" "Yellow"
        if ($IsGlobal) {
            Write-ColorOutput "  task-master-mcp --port $ServerPort" "White"
        } else {
            Write-ColorOutput "  npx task-master-mcp --port $ServerPort" "White"
        }
    }
}

# 主流程
function Main {
    Show-Banner
    
    # 1. 检查 Node.js
    if (-not (Test-NodeJS)) {
        exit 1
    }
    
    Write-Host ""
    
    # 确定包源
    $actualPackageSource = $PackageSource
    if (-not $actualPackageSource -or $actualPackageSource -eq "") {
        # 自动查找最新的 .tgz 包
        $actualPackageSource = Find-LatestTgzPackage
        if (-not $actualPackageSource) {
            $actualPackageSource = "npm"
        }
    }
    
    # 确定是否全局安装（默认全局，除非指定 -Local）
    $isGlobal = -not $Local
    
    Write-ColorOutput "安装配置：" "Cyan"
    if ($actualPackageSource -eq "npm") {
        Write-ColorOutput "  包源: npm registry" "White"
    } else {
        Write-ColorOutput "  包源: $actualPackageSource" "White"
    }
    Write-ColorOutput "  安装方式: $(if ($isGlobal) { '全局安装' } else { '本地安装' })" "White"
    Write-ColorOutput "  服务器端口: $Port" "White"
    Write-Host ""
    
    # 2. 安装包
    $packageToInstall = if ($actualPackageSource -eq "npm") { "" } else { $actualPackageSource }
    if (-not (Install-Package -Source $packageToInstall -IsGlobal $isGlobal)) {
        exit 1
    }
    
    # 3. 拷贝配置文件到用户目录
    if (-not $SkipConfigSetup) {
        Copy-ConfigToUserDir
    }
    
    # 4. 启动服务器
    Write-Host ""
    Write-ColorOutput "是否立即启动服务器？(Y/N): " "Yellow" -NoNewline
    $startResponse = Read-Host
    
    if ($startResponse -eq "Y" -or $startResponse -eq "y") {
        Start-Server -ServerPort $Port -IsGlobal $isGlobal
    } else {
        Write-Host ""
        Write-ColorOutput "安装完成！" "Green"
        Write-Host ""
        Write-ColorOutput "📁 配置文件位置: $env:USERPROFILE\.taskmaster\config.json" "Cyan"
        Write-Host ""
        Write-ColorOutput "稍后可以使用以下命令启动服务器：" "Cyan"
        if ($isGlobal) {
            Write-ColorOutput "  task-master-mcp --port $Port" "White"
        } else {
            Write-ColorOutput "  npx task-master-mcp --port $Port" "White"
        }
        Write-Host ""
    }
}

# 执行主流程
Main

