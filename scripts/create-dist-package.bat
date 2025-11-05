@echo off
REM Create distribution package for Task Master MCP Server (Windows)

setlocal enabledelayedexpansion

echo ================================================
echo    Create Task Master MCP Distribution Package
echo ================================================
echo.

REM Get version from package.json
for /f "tokens=*" %%i in ('node -p "require('./package.json').version"') do set VERSION=%%i
echo Version: %VERSION%
echo.

REM Clean and build
echo Building project...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed
    exit /b 1
)
echo.

REM Create npm package
echo Creating npm package...
call npm pack
if errorlevel 1 (
    echo [ERROR] npm pack failed
    exit /b 1
)
echo.

REM Create standalone package
echo Creating standalone distribution package...
set DIST_NAME=task-master-mcp-v%VERSION%
set TEMP_DIR=temp-dist

REM Clean and create temp directory
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%\%DIST_NAME%"

REM Copy necessary files
echo Copying files...
xcopy /E /I /Q dist "%TEMP_DIR%\%DIST_NAME%\dist"
copy package.json "%TEMP_DIR%\%DIST_NAME%\"
copy package-lock.json "%TEMP_DIR%\%DIST_NAME%\"
copy README.md "%TEMP_DIR%\%DIST_NAME%\"
copy DEPLOYMENT.md "%TEMP_DIR%\%DIST_NAME%\"
copy LICENSE "%TEMP_DIR%\%DIST_NAME%\" 2>nul || echo Warning: No LICENSE file
copy dist\assets\env.example "%TEMP_DIR%\%DIST_NAME%\.env.example"

REM Create README for the package
(
echo # Task Master MCP Server - Distribution Package
echo.
echo ## Quick Start
echo.
echo 1. **Install dependencies**
echo    ```bash
echo    npm install --production
echo    ```
echo.
echo 2. **Configure environment variables**
echo    ```bash
echo    copy .env.example .env
echo    REM Edit .env and add API keys
echo    ```
echo.
echo 3. **Start server**
echo    ```bash
echo    cd dist
echo    start-http.bat 3002
echo.
echo    REM Or using Node.js directly
echo    node dist\mcp-server.js --port 3002
echo    ```
echo.
echo ## Documentation
echo.
echo - [Quick Start Guide](dist/QUICKSTART.md^)
echo - [Full Deployment Guide](DEPLOYMENT.md^)
echo.
echo ## Requirements
echo.
echo - Node.js ^>= 18.0.0
echo - npm ^>= 8.0.0
) > "%TEMP_DIR%\%DIST_NAME%\README-DIST.md"

REM Create zip archive
echo.
echo Creating ZIP archive...
powershell -command "Compress-Archive -Path '%TEMP_DIR%\%DIST_NAME%' -DestinationPath '%DIST_NAME%.zip' -Force"
if errorlevel 1 (
    echo [ERROR] ZIP creation failed
    exit /b 1
)

REM Cleanup
rmdir /s /q "%TEMP_DIR%"

echo.
echo ================================================
echo   Complete! Generated files:
echo ================================================
echo.
echo   - npm package: task-master-ai-%VERSION%.tgz
echo   - Standalone package: %DIST_NAME%.zip
echo.
echo ================================================

