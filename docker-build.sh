#!/bin/bash

# ============================================
# Task Master AI - Docker 构建脚本
# ============================================
# 先在宿主机构建，然后打包到 Docker 镜像
# ============================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Task Master AI - Docker 构建${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# 步骤 1: 在宿主机构建
echo -e "${BLUE}[1/3]${NC} 在宿主机构建项目..."
echo "  → npm ci"
npm ci

echo "  → npm run build:production"
npm run build:production

echo -e "${GREEN}✓${NC} 构建完成"
echo -e "${BLUE}提示:${NC} node_modules 将在 Docker 容器内重新安装（避免 workspace 符号链接问题）"
echo

# 步骤 2: 构建 Docker 镜像
echo -e "${BLUE}[2/3]${NC} 构建 Docker 镜像..."
docker build -t task-master-ai:latest .
echo -e "${GREEN}✓${NC} 镜像构建完成"
echo

# 步骤 3: 完成
echo -e "${BLUE}[3/3]${NC} 完成"
echo -e "${GREEN}✓${NC} 开发环境保持不变"
echo "  node_modules 仍包含所有开发依赖，可继续本地开发"

echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  构建完成！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo "运行示例:"
echo "  docker run -d -p 3002:3002 -v \"\$(pwd):/workspace\" task-master-ai"
echo "  docker-compose up -d"
echo

