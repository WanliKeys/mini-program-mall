# 小程序商城后端API

## 🚀 项目介绍

这是一个为微信小程序商城开发的后端API服务，提供完整的电商功能支持，特别针对引流场景进行了优化。

## ✨ 主要功能

- 🔐 **用户认证**: 微信小程序静默登录、JWT认证
- 🛍️ **商品管理**: 商品列表、详情、搜索、分类
- 🛒 **购物车**: 添加、删除、修改商品
- 📦 **订单管理**: 订单创建、支付、状态管理
- 🎯 **引流追踪**: 外部平台订单追踪和数据统计
- 💳 **支付集成**: 微信支付、支付宝支付
- 📍 **地址管理**: 收货地址增删改查

## 🛠️ 技术栈

- **运行环境**: Node.js 16+
- **Web框架**: Express.js
- **数据库**: MySQL 8.0
- **认证**: JWT
- **安全**: Helmet, CORS
- **日志**: Morgan
- **文件上传**: Multer
- **HTTP客户端**: Axios

## 📋 环境要求

- Node.js >= 16.0.0
- MySQL >= 8.0
- npm >= 8.0.0

## 🔧 安装和配置

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

主要配置项：
```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=mall_db
DB_USER=root
DB_PASSWORD=your_password

# JWT密钥
JWT_SECRET=your_jwt_secret_key

# 微信小程序配置
WECHAT_APPID=your_wechat_appid
WECHAT_SECRET=your_wechat_secret
```

### 3. 初始化数据库
```bash
mysql -u root -p < database.sql
```

### 4. 启动服务

开发环境：
```bash
# 推荐：一键重启（避免多进程残留）
../../scripts/dev-restart.sh

# 或直接前台跑单实例
npm run start
```

生产环境：
```bash
npm start
```

## 📚 API文档

### 基础信息
- **基础URL**: `http://localhost:3000/api`
- **认证方式**: Bearer Token (JWT)
- **响应格式**: JSON

### 主要接口

#### 用户认证
- `POST /auth/login` - 微信小程序登录
- `GET /auth/profile` - 获取用户信息
- `PUT /auth/profile` - 更新用户信息

#### 商品管理
- `GET /products` - 获取商品列表
- `GET /products/:id` - 获取商品详情
- `GET /products/search` - 搜索商品

#### 购物车
- `GET /cart` - 获取购物车
- `POST /cart` - 添加到购物车
- `PUT /cart/:id` - 更新商品数量
- `DELETE /cart/:id` - 删除商品

#### 订单管理
- `GET /orders` - 获取订单列表
- `POST /orders` - 创建订单
- `GET /orders/:id` - 获取订单详情

## 🎯 引流功能特性

### 引流订单追踪
- 支持外部平台订单号传递
- 订单来源识别（`source` 字段）
- 引流数据统计和分析

### 使用示例
```javascript
// 小程序端创建引流订单
POST /api/orders
{
  "items": [...],
  "externalOrderNo": "TK20241215001",
  "source": "external"
}
```

## 🔒 安全特性

- **JWT认证**: 用户身份验证
- **CORS配置**: 跨域请求控制
- **Helmet防护**: 安全头部设置
- **参数验证**: 输入数据校验
- **SQL注入防护**: 参数化查询

## 🚀 部署建议

### 生产环境配置
1. 使用 PM2 进程管理
2. 配置 Nginx 反向代理
3. 启用 HTTPS (Let's Encrypt)
4. 配置数据库连接池
5. 设置日志轮转

### Docker部署
```dockerfile
# Dockerfile示例
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📈 性能优化

- 数据库查询优化
- 接口响应缓存
- 分页查询支持
- 连接池配置

## 🐛 问题排查

### 常见问题

1. **数据库连接失败**
   - 检查数据库服务是否启动
   - 验证连接配置参数

2. **微信登录失败**
   - 检查 AppID 和 Secret 配置（`.env`）并确认重启后生效
   - 确认每次 `wx.login` 都拿到新 code（避免复用）
   - 后端仅运行 1 个实例（可用 `../../scripts/dev-restart.sh`）
   - 直连微信测试：`curl "https://api.weixin.qq.com/sns/jscode2session?..."`

3. **Token验证失败**
   - 检查JWT密钥配置
   - 确认token格式正确

## 📞 技术支持

如有问题，请通过以下方式联系：
- 项目Issues
- 技术文档
- 开发团队

## 📄 许可证

MIT License
