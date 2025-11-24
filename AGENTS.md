# Repository Guidelines

## 项目结构与模块
- `wx-backend/`：Node.js API（Express），核心在 `src/routes/*` 与 `utils/`，环境模板 `env.example`。
- `wx-frontend/`：微信小程序前端，页面位于 `pages/`（如 `order/confirm`、`product/detail`），全局配置在 `app.js/app.json`。
- `admin-server/`：管理后台（前端静态资源在 `public/`，代理逻辑在 `server.js`），入口脚本 `public/app.js`。
- 其他：`nginx/` 反代配置，`docker-compose.yml` 和 `deploy.sh` 部署脚本，根目录文档若干。

## 构建、运行与开发命令
- 后端：`cd wx-backend && npm install && npm run start`（本地），生产用 `pm2 start ecosystem.config.js --only mall-backend`。环境变量来自 `.env` / `ecosystem.config.js` / 进程 env。
- 管理后台：`cd admin-server && npm install && npm run dev`（本地），生产用 `pm2 start ecosystem.config.js --only mall-admin`。
- 小程序：用微信开发者工具打开 `wx-frontend/`；如需命令行工具，再安装依赖后自行配置。
- URL Link API 冒烟示例：  
  `curl -X POST https://<domain>/api/referral/url-link -H "Content-Type: application/json" -d '{"linkCode":"<code>","partnerOrderNo":"ORDER1","notifyUrl":"https%3A%2F%2Fexample.com%2Fnotify"}'`

## 代码风格与命名
- JavaScript：2 空格缩进，保留分号，优先使用 `const/let`，函数保持小而清晰。
- 路由/JSON：路径用短横线，字段用 camelCase。
- 文件：沿用现有命名（`*.js`，小程序页面放在 `pages/<feature>/`）。

## 测试指引
- 暂无完整自动化测试；以手工冒烟为主。  
- 后端：访问健康检查/主要接口，关注 `pm2 logs mall-backend`。  
- 前端：验证小程序核心流程（商品详情 → 确认订单 → 支付）和后台“引流链接”弹窗。

## 提交与 PR
- Commit 信息：简短祈使句（如 “Add referral URL link generator” / “Fix notify retry”）。  
- PR：说明改动范围与影响；UI 变更附截图（admin/public），API 变更附 curl 示例；若有配置/环境变更请明示，关联 Issue。

## 安全与配置
- 秘钥走环境变量：`WECHAT_APPID/SECRET`（小程序）、`WECHAT_H5_APPID/SECRET`（服务号）、支付密钥等放 `.env` 或 `ecosystem.config.js`，勿入库。
- 引流 URL Link：每商品保持稳定的 `linkCode`，生产全程 HTTPS；必要时将后端出口 IP 加入微信白名单。
- 日志：`pm2 logs mall-backend` / `pm2 logs mall-admin` 用于诊断。***
