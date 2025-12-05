#!/bin/bash
# 服务器初始化脚本 - 在新服务器上运行一次

set -e

echo "🔧 Setting up server for Smart Perp..."

# 更新系统
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# 安装 Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

# 安装 Docker Compose
echo "🐳 Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# 安装 Git
echo "📚 Installing Git..."
sudo apt install -y git

# 创建应用目录
echo "📁 Creating application directory..."
sudo mkdir -p /opt/smart-perp
sudo chown $USER:$USER /opt/smart-perp

# 克隆仓库（如果尚未克隆）
cd /opt
if [ ! -d "smart-perp/.git" ]; then
    echo "📥 Cloning repository..."
    echo "请输入你的 GitHub 仓库地址 (例如: https://github.com/username/smart-perp.git):"
    read REPO_URL
    git clone $REPO_URL smart-perp
fi

cd smart-perp

# 创建环境变量文件
echo "⚙️  Creating environment file..."
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
# Database
DB_USER=smartperp
DB_PASSWORD=your_secure_password_here
DB_NAME=smartperp

# Worker Schedule (UTC timezone)
WORKER_LEADERBOARD_CRON=0 0,12 * * *
WORKER_TRADES_CRON=30 0,12 * * *
EOF
    echo "⚠️  请编辑 .env 文件，设置安全的数据库密码！"
fi

# 创建 SSL 目录
mkdir -p nginx/ssl

# 创建前端输出目录
mkdir -p frontend-dist

# 设置脚本权限
chmod +x scripts/*.sh

echo ""
echo "✅ Server setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. 编辑 .env 文件，设置安全的数据库密码"
echo "2. 运行 './scripts/deploy.sh' 开始部署"
echo "3. (可选) 配置 SSL 证书用于 HTTPS"
echo ""
echo "🔐 To setup SSL with Let's Encrypt:"
echo "   sudo apt install certbot"
echo "   sudo certbot certonly --standalone -d your-domain.com"
echo "   cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/"
echo "   cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/"


