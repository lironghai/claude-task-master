@echo off
REM Task Master MCP Server - Windows 安装和启动脚本 (批处理)
REM 用途：自动安装 task-master-ai 包并启动 HTTP 模式服务器

SETLOCAL EnableDelayedExpansion

REM ==================== 配置参数 ====================
SET PACKAGE_SOURCE=%1
SET PORT=%2
SET INSTALL_TYPE=%3

REM 设置默认值
IF "%PORT%"=="" SET PORT=3002
IF "%INSTALL_TYPE%"=="" SET INSTALL_TYPE=global

REM ==================== 显示横幅 ====================
echo.
echo ================================================
echo    Task Master MCP Server - 安装和启动工具
echo ================================================
echo.

REM ==================== 检查 Node.js ====================
echo [1/4] 检查 Node.js...
node --version >nul 2>&1
IF ERRORLEVEL 1 (
    echo [错误] Node.js 未安装或不在 PATH 中
    echo 请访问 https://nodejs.org 下载并安装 Node.js
    pause
    exit /b 1
)

FOR /F "tokens=*" %%i IN ('node --version') DO SET NODE_VERSION=%%i
FOR /F "tokens=*" %%i IN ('npm --version') DO SET NPM_VERSION=%%i
echo [成功] Node.js 版本: %NODE_VERSION%
echo [成功] npm 版本: %NPM_VERSION%

REM ==================== 查找最新的 .tgz 包 ====================
IF "%PACKAGE_SOURCE%"=="" (
    echo.
    echo 在当前目录查找 .tgz 包...
    
    REM 查找 task-master 开头的 .tgz 文件
    FOR /F "delims=" %%F IN ('dir /b /o-d task-master*.tgz 2^>nul') DO (
        SET PACKAGE_SOURCE=%%F
        GOTO :FOUND_TGZ
    )
    
    :NOT_FOUND_TGZ
    echo [警告] 未找到 .tgz 包文件，将从 npm registry 安装
    SET USE_NPM=1
    GOTO :SHOW_CONFIG
    
    :FOUND_TGZ
    echo [成功] 找到包文件: !PACKAGE_SOURCE!
    SET USE_NPM=0
)

:SHOW_CONFIG
REM ==================== 显示配置 ====================
echo.
echo 安装配置：
IF "%USE_NPM%"=="1" (
    echo   包源: npm registry
) ELSE IF "%PACKAGE_SOURCE%"=="" (
    echo   包源: npm registry
    SET USE_NPM=1
) ELSE (
    echo   包源: %PACKAGE_SOURCE%
    SET USE_NPM=0
)
IF "%INSTALL_TYPE%"=="global" (
    echo   安装方式: 全局安装
) ELSE (
    echo   安装方式: 本地安装
)
echo   服务器端口: %PORT%
echo.

REM ==================== 安装包 ====================
echo [2/4] 开始安装 Task Master...
echo.

IF "%USE_NPM%"=="1" (
    REM 从 npm registry 安装
    echo 从 npm registry 安装最新版本...
    IF "%INSTALL_TYPE%"=="global" (
        call npm install -g task-master-ai
    ) ELSE (
        call npm install task-master-ai
    )
) ELSE (
    REM 从本地 .tgz 文件安装
    IF NOT EXIST "%PACKAGE_SOURCE%" (
        echo [错误] 找不到包文件: %PACKAGE_SOURCE%
        pause
        exit /b 1
    )
    echo 从本地包安装: %PACKAGE_SOURCE%
    IF "%INSTALL_TYPE%"=="global" (
        call npm install -g "%PACKAGE_SOURCE%"
    ) ELSE (
        call npm install "%PACKAGE_SOURCE%"
    )
)

IF ERRORLEVEL 1 (
    echo.
    echo [错误] 安装失败！
    pause
    exit /b 1
)

echo.
echo [成功] 安装完成！

REM ==================== 拷贝配置文件 ====================
echo.
echo [3/4] 配置 Task Master...

REM 获取用户目录
SET USER_HOME=%USERPROFILE%
SET TASKMASTER_DIR=%USER_HOME%\.taskmaster
SET TARGET_CONFIG=%TASKMASTER_DIR%\config.json

REM 查找 config.json 文件
SET CONFIG_SOURCE=
IF EXIST "config.json" SET CONFIG_SOURCE=config.json
IF EXIST "assets\config.json" SET CONFIG_SOURCE=assets\config.json
IF EXIST "dist\assets\config.json" SET CONFIG_SOURCE=dist\assets\config.json
IF EXIST "node_modules\task-master-ai\dist\assets\config.json" SET CONFIG_SOURCE=node_modules\task-master-ai\dist\assets\config.json

IF "%CONFIG_SOURCE%"=="" (
    echo [警告] 未找到 config.json 模板文件
    echo 服务器将使用默认配置
    GOTO :START_SERVER
)

echo 找到配置文件: %CONFIG_SOURCE%

REM 创建 .taskmaster 目录（如果不存在）
IF NOT EXIST "%TASKMASTER_DIR%" (
    echo 创建目录: %TASKMASTER_DIR%
    mkdir "%TASKMASTER_DIR%"
)

REM 检查目标文件是否已存在
IF EXIST "%TARGET_CONFIG%" (
    echo [警告] 配置文件已存在: %TARGET_CONFIG%
    SET /P OVERWRITE="是否要覆盖现有配置？(Y/N): "
    IF /I NOT "!OVERWRITE!"=="Y" (
        echo [成功] 保留现有配置
        GOTO :START_SERVER
    )
)

REM 拷贝配置文件
copy "%CONFIG_SOURCE%" "%TARGET_CONFIG%" >nul 2>&1
IF ERRORLEVEL 1 (
    echo [错误] 拷贝配置文件失败
) ELSE (
    echo [成功] 配置文件已拷贝到: %TARGET_CONFIG%
    echo.
    echo [提示] 您可以编辑此文件来配置 AI 模型和参数
)

REM ==================== 启动服务器 ====================
:START_SERVER
echo.
echo [4/4] 启动服务器...
echo.
SET /P START_NOW="是否立即启动服务器？(Y/N): "

IF /I NOT "%START_NOW%"=="Y" (
    echo.
    echo 安装完成！
    echo.
    echo [配置文件位置] %USERPROFILE%\.taskmaster\config.json
    echo.
    echo 稍后可以使用以下命令启动服务器：
    IF "%INSTALL_TYPE%"=="global" (
        echo   task-master-mcp --port %PORT%
    ) ELSE (
        echo   npx task-master-mcp --port %PORT%
    )
    echo.
    pause
    exit /b 0
)

REM 显示启动信息
echo.
echo ================================================
echo    启动 Task Master MCP Server ^(HTTP模式^)
echo ================================================
echo.
echo 端口: %PORT%
echo 地址: http://localhost:%PORT%/mcp
echo.

REM 检查配置文件
IF NOT EXIST "%USERPROFILE%\.taskmaster\config.json" (
    echo [警告] 未找到配置文件
    echo 配置文件应位于: %USERPROFILE%\.taskmaster\config.json
    echo.
)

echo 正在启动服务器...
echo.

REM 启动服务器
IF "%INSTALL_TYPE%"=="global" (
    task-master-mcp --port %PORT%
) ELSE (
    npx task-master-mcp --port %PORT%
)

IF ERRORLEVEL 1 (
    echo.
    echo [错误] 启动失败！
    echo.
    echo 请尝试手动启动：
    IF "%INSTALL_TYPE%"=="global" (
        echo   task-master-mcp --port %PORT%
    ) ELSE (
        echo   npx task-master-mcp --port %PORT%
    )
    echo.
    pause
    exit /b 1
)

ENDLOCAL

