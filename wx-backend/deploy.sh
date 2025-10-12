#!/bin/bash

# 小程序后端快速部署脚本
# 使用方法: ./deploy.sh [env]
# env: dev(开发) | prod(生产)

set -e

ENV=${1:-dev}
PROJECT_DIR="/var/www/mall"
SERVICE_NAME="mall-backend"

echo "🚀 开始部署小程序后端 - 环境: $ENV"
echo "====================================="

# 检查Node.js环境
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js v16+"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装，请先安装 npm"
    exit 1
fi

# 检查PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 安装 PM2..."
    npm install -g pm2
fi

# 创建项目目录
if [ ! -d "$PROJECT_DIR" ]; then
    echo "📁 创建项目目录: $PROJECT_DIR"
    sudo mkdir -p $PROJECT_DIR
    sudo chown $USER:$USER $PROJECT_DIR
fi

# 进入项目目录
cd $PROJECT_DIR

# 如果是生产环境，进行额外检查
if [ "$ENV" = "prod" ]; then
    echo "🔍 生产环境部署检查..."

    # 检查环境文件
    if [ ! -f ".env" ]; then
        if [ -f ".env.production" ]; then
            echo "📋 复制生产环境配置..."
            cp .env.production .env
            echo "⚠️  请编辑 .env 文件，配置正确的数据库密码和其他敏感信息！"
        else
            echo "❌ 未找到 .env.production 文件"
            echo "请先配置生产环境变量文件"
            exit 1
        fi
    fi

    # 检查证书目录
    if [ ! -d "certs" ]; then
        echo "📁 创建证书目录..."
        mkdir -p certs
        echo "⚠️  请上传微信支付证书文件到 certs/ 目录！"
    fi

    # 检查SSL证书
    if [ ! -f "/etc/ssl/certs/jxxcfwlkj.cn.pem" ]; then
        echo "⚠️  未找到SSL证书，请配置SSL证书"
    fi
fi

# 安装依赖
echo "📦 安装依赖包..."
npm install --production

# 数据库检查
echo "🗄️ 检查数据库连接..."
node -e "
require('dotenv').config();
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
}).then(conn => {
  console.log('✅ 数据库连接成功');
  conn.end();
}).catch(err => {
  console.error('❌ 数据库连接失败:', err.message);
  process.exit(1);
});
"

# 启动/重启服务
echo "🔄 启动应用服务..."

if [ "$ENV" = "prod" ]; then
    # 生产环境使用PM2
    pm2 delete $SERVICE_NAME 2>/dev/null || true
    pm2 start src/app.js --name $SERVICE_NAME --env production
    pm2 save
    pm2 startup

    echo "✅ 生产环境服务已启动"
    echo "📊 查看服务状态: pm2 status"
    echo "📋 查看日志: pm2 logs $SERVICE_NAME"

else
    # 开发环境直接启动
    if pgrep -f "node.*src/app.js" > /dev/null; then
        echo "🔄 重启开发服务..."
        pkill -f "node.*src/app.js" || true
    fi

    nohup node src/app.js > app.log 2>&1 &
    echo "✅ 开发环境服务已启动"
    echo "📋 查看日志: tail -f app.log"
fi

# 健康检查
echo "🔍 健康检查..."
sleep 3

if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ 服务健康检查通过"
else
    echo "❌ 服务健康检查失败"
    exit 1
fi

echo ""
echo "🎉 部署完成！"
echo "====================================="
echo "服务地址: http://localhost:3000"
echo "API文档: http://localhost:3000/health"
echo "环境: $ENV"

if [ "$ENV" = "prod" ]; then
    echo ""
    echo "📋 后续配置提醒："
    echo "1. 配置 Nginx 反向代理"
    echo "2. 更新微信支付回调URL"
    echo "3. 配置 SSL 证书"
    echo "4. 设置域名解析"
    echo ""
    echo "📖 详细指南请查看: wx-frontend/生产环境发布指南.md"
fi