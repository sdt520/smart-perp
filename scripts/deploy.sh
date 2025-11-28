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

# 构建前端并复制到 nginx 目录
echo "📦 Building frontend..."
docker compose -f $COMPOSE_FILE run --rm api sh -c "cp -r /app/frontend/dist/* /tmp/"
mkdir -p frontend-dist
docker compose -f $COMPOSE_FILE run --rm -v $(pwd)/frontend-dist:/output api sh -c "cp -r /app/frontend/dist/. /output/"

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

