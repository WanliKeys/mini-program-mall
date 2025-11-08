# 腾讯云商城部署终版指引（TencentOS / CentOS 系）

适用于已经在本地验证通过的微信小程序商城，目标是在腾讯云服务器上以原生命令（非 Docker）完成上线。按顺序执行即可。

---
## 1. 服务器基础环境

### 1.1 更新系统
```bash
sudo yum update -y
sudo yum install -y epel-release
```

### 1.2 安装 Node.js 18 + npm
```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs gcc gcc-c++ make
```

### 1.3 安装 PM2（Node 进程守护）
```bash
sudo npm install -g pm2
```

### 1.4 安装并启动 MySQL、Redis、Nginx
```bash
sudo yum install -y mysql-server redis nginx
sudo systemctl enable --now mysqld redis nginx
```

> 首次安装 MySQL：执行 `sudo mysql_secure_installation` 设置 root 密码，并创建业务数据库/账号。

### 1.5 防火墙（若启用 firewalld）
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

---
## 2. 同步项目代码

```bash
sudo mkdir -p /var/www/mall
sudo chown -R $USER:$USER /var/www/mall
cd /var/www

# 方式A：直接拷贝本地代码
scp -r mall/* <本地用户名>@<服务器IP>:/var/www/mall

# 方式B：服务器上 git clone（推荐）
# git clone <你的仓库地址> mall
```

建议使用 git 方式，后续更新直接 `git pull` 更方便。

---
## 3. 后端服务（`wx-backend`）

```bash
cd /var/www/mall/wx-backend

# 3.1 配置环境变量
cp env.example .env        # 如有 .env.production 按需复制
vim .env                   # 修改数据库、Redis、JWT、微信支付等参数

# 3.2 安装依赖（使用 package-lock 时必须 ci）
npm ci --omit=dev          # 若无 package-lock，可改用 npm install --production

# 3.3 初始化数据库（首次部署）
mysql -u<db_user> -p<db_password> <db_name> < ../../scripts/init.sql

# 3.4 启动后健康检查
# 等第 5 步通过 PM2 启动服务后再执行：
curl -f http://127.0.0.1:3000/health || echo '后端健康检查失败'
```

> 微信支付证书请上传到 `wx-backend/certs/`，并在 `.env` 中配置绝对路径。

---
## 4. 管理后台（`admin-server`）

```bash
cd /var/www/mall/admin-server
cp env.example .env
vim .env                    # 更新 API_BASE_URL、端口、跨域白名单等
npm ci --omit=dev

# 启动后健康检查
# 等第 5 步通过 PM2 启动服务后再执行：
curl -f http://127.0.0.1:3001 || echo '管理后台未启动'
```

将 `API_BASE_URL` 设置为 `https://你的域名/api`，保证线上地址一致。

---
## 5. 使用 PM2 托管进程

项目根目录已提供 `ecosystem.config.js`，包含后端与管理后台的 PM2 配置。

```bash
cd /var/www/mall
pm2 start ecosystem.config.js --env production
pm2 status

# 设置开机自启
pm2 save
pm2 startup
```

常用命令：
```bash
pm2 logs mall-backend      # 查看后端日志
pm2 logs mall-admin        # 查看管理后台日志
pm2 reload ecosystem.config.js --env production   # 平滑重启全部
pm2 restart mall-backend   # 单独重启后端
```

---
## 6. 配置 Nginx

1. 将 `nginx/conf.d/jxxcfwlkj.cn.conf` 复制到 `/etc/nginx/conf.d/`：
   ```bash
   sudo cp /var/www/mall/nginx/conf.d/jxxcfwlkj.cn.conf /etc/nginx/conf.d/
   ```
2. 编辑文件，替换：
   - `server_name` → 你的正式域名
   - `ssl_certificate` / `ssl_certificate_key` → 实际证书路径
   - `/var/www/mall/.../uploads` → 若你调整过目录，请同步
3. 将正式证书放到 `/etc/nginx/ssl/`（参考《ssl-setup-instructions.md》）：
   ```bash
   sudo mkdir -p /etc/nginx/ssl
   sudo cp ~/jxxcfwlkj.cn.{crt,key} /etc/nginx/ssl/
   sudo chmod 644 /etc/nginx/ssl/jxxcfwlkj.cn.crt
   sudo chmod 600 /etc/nginx/ssl/jxxcfwlkj.cn.key
   ```
4. 检查并重新加载 Nginx：
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

> 若暂时没有证书，可先省略 `listen 443` 段，待证书就绪后再开启 HTTPS。

---
## 7. 部署验收

```bash
# 本机检查
curl -f http://127.0.0.1:3000/health
curl -f http://127.0.0.1:3001

# 对外验证
curl -I https://你的域名/api/health
curl -I https://你的域名/admin
```

同时在微信小程序后台配置服务器域名、HTTPS、支付回调地址等，确保与你的线上地址一致。

---
## 8. 后续更新流程

1. 本地功能验证 → `git push`。
2. 服务器登录后：
   ```bash
   cd /var/www/mall
git pull
npm --prefix wx-backend ci --omit=dev
npm --prefix admin-server ci --omit=dev
pm2 reload ecosystem.config.js --env production
   ```
3. 如涉及数据库变更，请提前编写脚本并在重启前执行。
4. 部署完成后检查 `curl` 健康页与 `pm2 status`，确认无异常。

---
## 9. 常见排查

- **端口占用**：`sudo lsof -i:3000` / `sudo lsof -i:3001`
- **日志检查**：`pm2 logs`、`sudo tail -f /var/log/nginx/error.log`
- **服务状态**：`systemctl status mysqld`、`redis`、`nginx`
- **证书问题**：浏览器提示不安全时，确认域名匹配、证书链完整、私钥权限正确。

执行以上步骤即可在 TencentOS 上完成商城系统的最终部署，后续迭代按第 8 节流程操作即可。EOF
