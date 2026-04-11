# PM2 部署指引

项目线上运行方式统一为 PM2，不再维护 Docker 部署方案。

## 1. 服务器准备

```bash
sudo yum update -y
sudo yum install -y epel-release git nginx mysql-server redis
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs gcc gcc-c++ make
sudo npm install -g pm2
sudo systemctl enable --now mysqld redis nginx
```

## 2. 拉代码

```bash
sudo mkdir -p /var/www/mall
sudo chown -R $USER:$USER /var/www/mall
cd /var/www/mall
git clone <你的仓库地址> .    # 首次部署
```

后续更新：

```bash
cd /var/www/mall
git pull
```

## 3. 配置后端

```bash
cd /var/www/mall/wx-backend
cp env.example .env
vim .env
npm ci --omit=dev
```

首次部署初始化数据库：

```bash
mysql -u<db_user> -p<db_password> <db_name> < ../../scripts/init.sql
```

微信支付证书放到：

```bash
/var/www/mall/wx-backend/certs/
```

## 4. 配置管理后台

```bash
cd /var/www/mall/admin-server
cp env.example .env
vim .env
npm ci --omit=dev
```

## 5. 使用 PM2 启动

项目根目录已提供 [ecosystem.config.js](/Users/liwanli/Documents/GitHub/mall/ecosystem.config.js)。
后端和管理后台都会在各自目录读取 `.env`。

```bash
cd /var/www/mall
sudo mkdir -p /var/log/mall
sudo chown -R $USER:$USER /var/log/mall

pm2 start ecosystem.config.js
pm2 status
pm2 save
pm2 startup
```

常用命令：

```bash
pm2 logs mall-backend
pm2 logs mall-admin
pm2 restart mall-backend
pm2 restart mall-admin
pm2 reload ecosystem.config.js
```

## 6. Nginx

仓库里提供了基础反代配置：

```bash
/var/www/mall/nginx/conf.d/default.conf
```

部署时复制到系统目录并按实际域名修改：

```bash
sudo cp /var/www/mall/nginx/conf.d/default.conf /etc/nginx/conf.d/mall.conf
sudo vim /etc/nginx/conf.d/mall.conf
sudo nginx -t
sudo systemctl reload nginx
```

至少检查这些项：

- `server_name`
- `ssl_certificate`
- `ssl_certificate_key`
- `/api/` 是否代理到 `127.0.0.1:3000` 或当前后端监听地址
- `/admin/` 是否代理到 `127.0.0.1:3001`

## 7. 验收

```bash
curl -f http://127.0.0.1:3000/health
curl -I https://你的域名/api/health
pm2 status
```

## 8. 更新流程

```bash
cd /var/www/mall
git pull
npm --prefix wx-backend ci --omit=dev
npm --prefix admin-server ci --omit=dev
pm2 reload ecosystem.config.js
```

如果改了环境变量：

```bash
pm2 restart mall-backend
pm2 restart mall-admin
```
