# 部署指南

本文档介绍如何将 Smart Perp Radar 部署到云服务器。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         云服务器                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │
│  │  Nginx  │───▶│   API   │───▶│ Worker  │    │PostgreSQL│    │
│  │  :80    │    │  :3001  │    │ (cron)  │    │  :5432  │     │
│  │  :443   │    └─────────┘    └─────────┘    └─────────┘     │
│  └─────────┘         │              │              ▲           │
│       │              └──────────────┴──────────────┘           │
│       │                                                        │
│       ▼                                                        │
│  ┌─────────────┐                                               │
│  │ 前端静态文件 │                                               │
│  │  (React)    │                                               │
│  └─────────────┘                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 云服务器推荐

| 服务商 | 推荐配置 | 预估月费 |
|--------|---------|---------|
| **阿里云 ECS** | 2核4G | ¥100-200/月 |
| **腾讯云 CVM** | 2核4G | ¥100-200/月 |
| **AWS EC2** | t3.small | $15-25/月 |
| **DigitalOcean** | Basic Droplet | $12-24/月 |

> 💡 推荐选择 **2核4G内存** 以上配置，系统选择 **Ubuntu 22.04 LTS**

## 快速部署步骤

### 1. 准备云服务器

购买云服务器后，确保开放以下端口：
- **22**: SSH
- **80**: HTTP
- **443**: HTTPS (如需)

### 2. SSH 连接到服务器

```bash
ssh root@your-server-ip
```

### 3. 运行初始化脚本

```bash
# 下载并运行初始化脚本
curl -fsSL https://raw.githubusercontent.com/你的用户名/smart-perp/main/scripts/setup-server.sh | bash

# 或者手动执行
cd /opt/smart-perp
./scripts/setup-server.sh
```

### 4. 配置环境变量

```bash
cd /opt/smart-perp
nano .env
```

修改以下内容：
```env
DB_PASSWORD=你的安全密码
```

### 5. 首次部署

```bash
./scripts/deploy.sh
```

### 6. 验证部署

访问 `http://your-server-ip` 查看网站是否正常运行。

## 配置 HTTPS (可选但推荐)

### 使用 Let's Encrypt 免费证书

```bash
# 安装 certbot
sudo apt install certbot -y

# 停止 nginx 以释放 80 端口
docker compose -f docker-compose.prod.yml stop nginx

# 获取证书（替换为你的域名）
sudo certbot certonly --standalone -d your-domain.com

# 复制证书到项目目录
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/
sudo chown $USER:$USER nginx/ssl/*.pem

# 编辑 nginx.conf，取消 HTTPS server block 的注释
nano nginx/nginx.conf

# 重启 nginx
docker compose -f docker-compose.prod.yml up -d nginx
```

### 自动续期证书

```bash
# 添加定时任务
sudo crontab -e

# 添加以下行（每月1号凌晨3点续期）
0 3 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/your-domain.com/*.pem /opt/smart-perp/nginx/ssl/ && docker exec smart-perp-nginx nginx -s reload
```

## GitHub Actions 自动部署

### 1. 配置 GitHub Secrets

进入你的 GitHub 仓库 → Settings → Secrets and variables → Actions，添加以下 Secrets：

| Secret Name | 说明 | 示例 |
|------------|------|-----|
| `SERVER_HOST` | 服务器 IP 或域名 | `123.45.67.89` |
| `SERVER_USER` | SSH 用户名 | `root` |
| `SERVER_SSH_KEY` | SSH 私钥 | 见下方说明 |

### 2. 生成 SSH 密钥

```bash
# 在本地生成新的 SSH 密钥对
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy

# 复制公钥到服务器
ssh-copy-id -i ~/.ssh/github_deploy.pub root@your-server-ip

# 复制私钥内容（用于 GitHub Secret）
cat ~/.ssh/github_deploy
```

将私钥的全部内容（包括 `-----BEGIN` 和 `-----END`）粘贴到 `SERVER_SSH_KEY` Secret 中。

### 3. 触发部署

现在每次推送到 `main` 分支都会自动部署：

```bash
git add .
git commit -m "feat: new feature"
git push origin main
```

## 本地开发工作流

### 日常开发

```bash
# 1. 启动本地数据库
docker-compose up -d postgres

# 2. 启动后端开发服务器
cd server && npm run dev

# 3. 启动 Worker（另一个终端）
cd server && npm run worker

# 4. 启动前端开发服务器（另一个终端）
npm run dev

# 访问 http://localhost:5173
```

### 部署到云端

```bash
# 方式一：推送代码自动部署
git add .
git commit -m "your changes"
git push origin main

# 方式二：手动部署
ssh root@your-server-ip
cd /opt/smart-perp
./scripts/deploy.sh
```

## 常用命令

### 查看日志

```bash
# 查看所有服务日志
docker compose -f docker-compose.prod.yml logs -f

# 查看特定服务日志
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f worker
docker compose -f docker-compose.prod.yml logs -f nginx
```

### 重启服务

```bash
# 重启所有服务
docker compose -f docker-compose.prod.yml restart

# 重启特定服务
docker compose -f docker-compose.prod.yml restart api
```

### 手动触发 Worker

```bash
# 进入 worker 容器执行一次性同步
docker compose -f docker-compose.prod.yml exec worker node server/dist/worker/index.js --once
```

### 数据库备份

```bash
# 备份数据库
docker exec smart-perp-db pg_dump -U smartperp smartperp > backup_$(date +%Y%m%d).sql

# 恢复数据库
docker exec -i smart-perp-db psql -U smartperp smartperp < backup_20241128.sql
```

## 监控与告警

### 简单健康检查脚本

```bash
# 创建监控脚本
cat > /opt/smart-perp/scripts/health-check.sh << 'EOF'
#!/bin/bash
if ! curl -sf http://localhost/api/health > /dev/null; then
    echo "❌ API is down! Restarting..."
    cd /opt/smart-perp
    docker compose -f docker-compose.prod.yml restart api
fi
EOF

chmod +x /opt/smart-perp/scripts/health-check.sh

# 添加定时任务（每5分钟检查一次）
crontab -e
# 添加: */5 * * * * /opt/smart-perp/scripts/health-check.sh
```

## 故障排查

### 服务无法启动

```bash
# 检查容器状态
docker compose -f docker-compose.prod.yml ps

# 查看详细日志
docker compose -f docker-compose.prod.yml logs api --tail=100
```

### 数据库连接失败

```bash
# 检查数据库容器
docker compose -f docker-compose.prod.yml logs postgres

# 测试数据库连接
docker exec smart-perp-db psql -U smartperp -d smartperp -c "SELECT 1"
```

### 前端显示空白

```bash
# 检查前端文件是否存在
ls -la frontend-dist/

# 检查 nginx 日志
docker compose -f docker-compose.prod.yml logs nginx
```

## 费用估算

| 项目 | 预估费用 |
|-----|---------|
| 云服务器 (2核4G) | ¥100-200/月 |
| 域名 | ¥50-100/年 |
| SSL 证书 (Let's Encrypt) | 免费 |
| **总计** | **约 ¥100-200/月** |

---

如有问题，请提交 Issue 或联系维护者。

