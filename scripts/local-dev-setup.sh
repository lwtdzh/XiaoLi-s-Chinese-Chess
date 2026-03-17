#!/bin/bash

# ============================================
# 中国象棋本地开发环境初始化脚本
# XiaoLi Chinese Chess Local Development Setup
# ============================================

set -e

echo "=========================================="
echo "🎮 中国象棋本地开发环境初始化"
echo "🎮 XiaoLi Chinese Chess Local Dev Setup"
echo "=========================================="
echo ""

# 检查 Node.js
echo "📦 检查 Node.js 版本..."
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js，请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低，需要 18+，当前版本: $(node -v)"
    exit 1
fi
echo "✅ Node.js 版本: $(node -v)"

# 检查 npm
echo "📦 检查 npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ 未安装 npm"
    exit 1
fi
echo "✅ npm 版本: $(npm -v)"

# 安装依赖
echo ""
echo "📦 安装项目依赖..."
npm install
echo "✅ 依赖安装完成"

# 检查 Wrangler CLI
echo ""
echo "🔧 检查 Wrangler CLI..."
if ! command -v wrangler &> /dev/null; then
    echo "⚠️  Wrangler CLI 未全局安装，使用项目本地版本"
fi
echo "✅ Wrangler 准备就绪"

# 初始化本地 D1 数据库
echo ""
echo "🗄️  初始化本地 D1 数据库..."
if [ -f "./schema.sql" ]; then
    npm run db:init
    echo "✅ 本地数据库初始化完成"
else
    echo "❌ 未找到 schema.sql 文件"
    exit 1
fi

# 构建前端
echo ""
echo "🔨 构建前端资源..."
npm run build
echo "✅ 前端构建完成"

# 创建必要的目录
echo ""
echo "📁 检查项目目录结构..."
mkdir -p .wrangler/state/v3/d1/miniflare-D1DatabaseObject
mkdir -p .wrangler/state/v3/kv
echo "✅ 目录结构准备完成"

echo ""
echo "=========================================="
echo "✅ 本地开发环境初始化完成！"
echo "=========================================="
echo ""
echo "🚀 启动开发服务器:"
echo "   npm run dev:local"
echo ""
echo "📝 可用命令:"
echo "   npm run dev          - 启动前端开发服务器 (Vite)"
echo "   npm run dev:local    - 启动本地 Pages 开发服务器"
echo "   npm run test         - 运行所有测试"
echo "   npm run test:watch   - 监听模式运行测试"
echo "   npm run build        - 构建生产版本"
echo "   npm run deploy       - 部署到 Cloudflare Pages"
echo ""
echo "🌐 开发服务器地址:"
echo "   http://localhost:8788"
echo ""
echo "📖 更多信息请参考 README.md"
echo ""
