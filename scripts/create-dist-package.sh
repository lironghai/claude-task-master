#!/bin/bash
# Create distribution package for Task Master MCP Server

set -e  # Exit on error

echo "🎁 创建 Task Master MCP 服务器分发包"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "📦 版本: $VERSION"

# Clean and build
echo ""
echo "🔨 构建项目..."
npm run build

# Create package using npm pack
echo ""
echo "📦 创建 npm 包..."
npm pack

# Create additional standalone package
echo ""
echo "📦 创建独立分发包..."

DIST_NAME="task-master-mcp-v${VERSION}"
TEMP_DIR="temp-dist"

# Create temp directory
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR/$DIST_NAME"

# Copy necessary files
echo "📋 复制文件..."
cp -r dist "$TEMP_DIR/$DIST_NAME/"
cp package.json "$TEMP_DIR/$DIST_NAME/"
cp package-lock.json "$TEMP_DIR/$DIST_NAME/"
cp README.md "$TEMP_DIR/$DIST_NAME/"
cp DEPLOYMENT.md "$TEMP_DIR/$DIST_NAME/"
cp LICENSE "$TEMP_DIR/$DIST_NAME/" 2>/dev/null || echo "⚠️  No LICENSE file"

# Copy .env.example
cp -r dist/assets/env.example "$TEMP_DIR/$DIST_NAME/.env.example"

# Create README for the package
cat > "$TEMP_DIR/$DIST_NAME/README-DIST.md" << 'EOF'
# Task Master MCP Server - 分发包

## 快速开始

1. **安装依赖**
   ```bash
   npm install --production
   ```

2. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 添加 API 密钥
   ```

3. **启动服务器**
   ```bash
   # Windows PowerShell
   cd dist
   .\start-http.ps1 3002

   # Linux/macOS
   cd dist
   chmod +x start-http.sh
   ./start-http.sh 3002

   # 或直接使用 Node.js
   node dist/mcp-server.js --port 3002
   ```

## 详细文档

- [快速启动指南](dist/QUICKSTART.md)
- [完整部署指南](DEPLOYMENT.md)

## 系统要求

- Node.js >= 18.0.0
- npm >= 8.0.0
EOF

# Create archive
echo ""
echo "🗜️  压缩文件..."
cd "$TEMP_DIR"

# Create tar.gz
tar -czf "../${DIST_NAME}.tar.gz" "$DIST_NAME"
echo "✅ 创建: ${DIST_NAME}.tar.gz"

# Create zip
zip -r -q "../${DIST_NAME}.zip" "$DIST_NAME"
echo "✅ 创建: ${DIST_NAME}.zip"

cd ..

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ 完成！生成的文件："
echo ""
echo "  📦 npm 包:"
echo "     task-master-ai-${VERSION}.tgz"
echo ""
echo "  📦 独立分发包:"
echo "     ${DIST_NAME}.tar.gz"
echo "     ${DIST_NAME}.zip"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

