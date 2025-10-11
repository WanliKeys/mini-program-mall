# 商城小程序 Docker 部署指南

这是一个完整的商城小程序项目的Docker化部署方案，包含后端API、管理后台、数据库、缓存和反向代理等服务。

## 🏗️ 项目架构

```
mall/
├── wx-backend/          # 后端API服务 (Node.js + Express)
├── admin-server/        # 管理后台 (Node.js + Express)
├── wx-frontend/         # 微信小程序前端
├── nginx/              # Nginx反向代理配置
├── scripts/            # 数据库初始化脚本
├── docker-compose.yml  # Docker编排配置
├── deploy.sh          # 自动化部署脚本
└── README-DOCKER.md   # 部署文档
```

## 📋 服务说明

| 服务名 | 描述 | 端口 | 技术栈 |
|--------|------|------|--------|
| backend | 后端API服务 | 3000 | Node.js + Express + MySQL |
| admin | 管理后台 | 3001 | Node.js + Express |
| mysql | 数据库 | 3306 | MySQL 8.0 |
| redis | 缓存服务 | 6379 | Redis 7 |
| nginx | 反向代理 | 80/443 | Nginx Alpine |

## 🚀 快速开始

### 1. 服务器要求

- **操作系统**: Linux (推荐 Ubuntu 20.04+ / CentOS 8+)
- **内存**: 最低 2GB，推荐 4GB+
- **存储**: 最低 20GB，推荐 50GB+
- **网络**: 公网IP，开放 80、443 端口

### 2. 安装依赖

在服务器上安装 Docker 和 Docker Compose：

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

### 3. 克隆项目

```bash
git clone <your-repository-url>
cd mall
```

### 4. 配置环境变量

```bash
# 复制环境配置文件
cp .env.example .env

# 编辑配置文件，填入你的实际配置
vim .env
```

**重要配置项说明：**

```bash
# 数据库配置 - 请使用强密码
DB_PASSWORD=your_secure_db_password_here
MYSQL_ROOT_PASSWORD=your_secure_root_password_here

# JWT密钥 - 请使用32位以上随机字符串
JWT_SECRET=your_very_secure_jwt_secret_key_at_least_32_chars_long

# 微信小程序配置
WECHAT_APPID=your_wechat_appid_here
WECHAT_SECRET=your_wechat_secret_here

# 微信支付配置
WECHAT_PAY_MCHID=your_merchant_id_here
WECHAT_PAY_APIV3_KEY=your_api_v3_key_here
WECHAT_PAY_CERT_SERIAL_NO=your_cert_serial_no_here
WECHAT_PAY_NOTIFY_URL=https://your-domain.com/api/payments/callback/wechat

# 前端域名
FRONTEND_URL=https://your-domain.com
```

### 5. 配置SSL证书 (生产环境)

如果你有域名，需要配置SSL证书：

```bash
# 创建SSL证书目录
mkdir -p nginx/ssl

# 方式1: 使用自签名证书 (仅测试用)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem

# 方式2: 使用 Let's Encrypt (推荐)
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem
```

### 6. 一键部署

```bash
# 给脚本执行权限
chmod +x deploy.sh

# 初始化部署 (首次部署)
./deploy.sh --init
```

部署脚本会自动：
- ✅ 检查系统依赖
- ✅ 构建Docker镜像
- ✅ 启动所有服务
- ✅ 初始化数据库
- ✅ 检查服务健康状态

### 7. 验证部署

部署完成后，访问以下地址验证：

- **后端API**: http://your-server-ip:3000/health
- **管理后台**: http://your-server-ip:3001
- **Nginx代理**: http://your-server-ip

## 📖 部署脚本使用

部署脚本 `deploy.sh` 提供了完整的生命周期管理：

```bash
# 查看帮助
./deploy.sh --help

# 首次部署
./deploy.sh --init

# 更新应用
./deploy.sh --update

# 查看服务状态
./deploy.sh --status

# 重启服务
./deploy.sh --restart

# 停止服务
./deploy.sh --stop

# 查看日志
./deploy.sh --logs

# 备份数据库
./deploy.sh --backup

# 恢复数据库
./deploy.sh --restore backup_file.sql.gz

# 清理Docker资源
./deploy.sh --cleanup
```

## 🔧 配置说明

### Nginx 配置

Nginx配置文件位于 `nginx/conf.d/default.conf`，包含：

- **HTTPS重定向**: HTTP自动跳转到HTTPS
- **反向代理**: API请求转发到后端服务
- **静态文件**: 处理上传文件和静态资源
- **安全配置**: SSL、安全头、请求限制

### 数据库配置

- **数据持久化**: 数据存储在Docker卷中
- **自动备份**: 支持手动和自动备份
- **初始化脚本**: 自动创建表结构和默认数据

### 环境变量

所有配置通过环境变量管理，支持不同环境：

- **开发环境**: `.env.development`
- **生产环境**: `.env.production`
- **自定义环境**: `.env`

## 🔒 安全配置

### 1. 防火墙设置

```bash
# Ubuntu UFW
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# CentOS Firewalld
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 2. 数据库安全

- 使用强密码
- 限制数据库访问权限
- 定期备份数据
- 启用SSL连接

### 3. 应用安全

- 定期更新依赖包
- 使用HTTPS
- 配置安全头
- 限制文件上传类型

## 📊 监控和日志

### 查看服务状态

```bash
# 查看所有容器
docker ps

# 查看特定服务日志
docker logs mall_backend
docker logs mall_mysql

# 实时查看日志
docker-compose logs -f
```

### 性能监控

```bash
# 查看资源使用情况
docker stats

# 查看磁盘使用
df -h

# 查看内存使用
free -h
```

## 🚨 故障排除

### 常见问题

1. **端口冲突**
   ```bash
   # 检查端口占用
   sudo netstat -tlnp | grep :3000
   # 停止冲突服务
   sudo systemctl stop nginx
   ```

2. **权限问题**
   ```bash
   # 修复文件权限
   sudo chown -R $USER:$USER .
   chmod +x deploy.sh
   ```

3. **内存不足**
   ```bash
   # 增加交换空间
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

4. **数据库连接失败**
   ```bash
   # 检查数据库容器
   docker logs mall_mysql

   # 重启数据库服务
   docker-compose restart mysql
   ```

### 日志分析

```bash
# 查看应用错误日志
docker-compose logs backend | grep ERROR

# 查看Nginx访问日志
docker exec mall_nginx tail -f /var/log/nginx/access.log

# 查看数据库慢查询
docker exec mall_mysql mysql -u root -p -e "SHOW PROCESSLIST;"
```

## 🔄 更新和维护

### 应用更新

```bash
# 更新代码
git pull

# 重新构建和部署
./deploy.sh --update
```

### 数据备份

```bash
# 手动备份
./deploy.sh --backup

# 自动备份 (添加到crontab)
crontab -e
# 添加: 0 2 * * * /path/to/mall/deploy.sh --backup
```

### 系统更新

```bash
# 更新系统包
sudo apt update && sudo apt upgrade

# 更新Docker
sudo apt install docker-ce docker-ce-cli containerd.io
```

## 📞 技术支持

如果在部署过程中遇到问题，可以：

1. 查看 [GitHub Issues](https://github.com/your-repo/issues)
2. 阅读本文档的故障排除部分
3. 联系技术支持团队

## 📄 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

---

**🎉 恭喜！你的商城小程序已经成功Docker化部署！**