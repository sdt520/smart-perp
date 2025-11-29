#!/bin/bash
# 部署脚本 - 在云服务器上运行

set -e

echo "🚀 Starting deployment..."

# 配置
APP_DIR="/opt/smart-perp"
COMPOSE_FILE="docker-compose.prod.yml"

cd $APP_DIR

# 拉取最新代码
echo "📥 Pulling latest code..."
git pull origin main

# 构建镜像
echo "🔨 Building Docker images..."
docker compose -f $COMPOSE_FILE build --no-cache

# 复制前端文件到 nginx 目录
echo "📦 Copying frontend files..."
rm -rf frontend-dist
docker cp smart-perp-api:/app/frontend/dist ./frontend-dist || {
    # 如果 api 容器不存在，先启动它，复制文件，然后继续
    docker compose -f $COMPOSE_FILE up -d api
    sleep 5
    docker cp smart-perp-api:/app/frontend/dist ./frontend-dist
}

# 停止旧容器
echo "⏹️  Stopping old containers..."
docker compose -f $COMPOSE_FILE down

# 启动新容器
echo "▶️  Starting new containers..."
docker compose -f $COMPOSE_FILE up -d

# 等待服务启动
echo "⏳ Waiting for services to start..."
sleep 10

# 健康检查
echo "🏥 Health check..."
if curl -s http://localhost/api/health | grep -q "ok"; then
    echo "✅ API is healthy!"
else
    echo "❌ API health check failed!"
    docker compose -f $COMPOSE_FILE logs api
    exit 1
fi

# 清理旧镜像
echo "🧹 Cleaning up old images..."
docker image prune -f

echo ""
echo "✅ Deployment complete!"
echo "🌐 Your site is now live!"

