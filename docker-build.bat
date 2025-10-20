@echo off
REM ============================================
REM Task Master AI - Docker 构建脚本 (Windows)
REM ============================================
REM 先在宿主机构建，然后打包到 Docker 镜像
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   Task Master AI - Docker 构建
echo ============================================
echo.

REM 步骤 1: 在宿主机构建
echo [1/3] 在宿主机构建项目...
echo   → npm ci
call npm ci
if %errorlevel% neq 0 (
    echo 错误: npm ci 失败
    pause
    exit /b 1
)

echo   → npm run build:production
call npm run build:production
if %errorlevel% neq 0 (
    echo 错误: 构建失败
    pause
    exit /b 1
)

echo √ 构建完成
echo 提示: node_modules 将在 Docker 容器内重新安装（避免 workspace 符号链接问题）
echo.

REM 步骤 2: 构建 Docker 镜像
echo [2/3] 构建 Docker 镜像...
docker build -t task-master-ai:latest .
if %errorlevel% neq 0 (
    echo 错误: Docker 镜像构建失败
    pause
    exit /b 1
)
echo √ 镜像构建完成
echo.

REM 步骤 3: 完成
echo [3/3] 完成
echo √ 开发环境保持不变
echo   node_modules 仍包含所有开发依赖，可继续本地开发

echo.
echo ============================================
echo   构建完成！
echo ============================================
echo.
echo 运行示例:
echo   docker run -d -p 3002:3002 -v "%cd%:/workspace" task-master-ai
echo   docker-compose up -d
echo.

pause

