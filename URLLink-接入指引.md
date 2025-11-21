# URL Link 跳转小程序指引（引流场景）

## 方案概览
- 使用微信官方 URL Link（w.url.cn/wxaurl.cn）生成可在外部浏览器点击的链接，自动唤起微信并进入小程序指定页面。
- 服务号凭证用于 H5 JS-SDK；小程序凭证用于 URL Link。两套凭证不可混用。

## 环境变量
- 小程序：`WECHAT_APPID` / `WECHAT_SECRET`
- 服务号（H5 签名）：`WECHAT_H5_APPID` / `WECHAT_H5_SECRET`

## 后端接口
- `POST /api/referral/url-link`
- 入参：
  - `linkCode` (必填)
  - `partnerOrderNo` (必填)
  - `notifyUrl` (必填，需 URL 编码后再传)
  - `externalOrderNo` (可选)
  - `env` (可选，默认 `release`，支持 `trial`/`develop`)
  - `expireInterval` (可选，秒；设置后生成一次性/短期链接)
- 返回：
  - `urlLink`：可直接投放的 URL Link
  - `path` / `query` / `env`

## 生成示例
```bash
curl -X POST https://jxxcfwlkj.cn/api/referral/url-link \
  -H "Content-Type: application/json" \
  -d '{"linkCode":"REF1763455251817QN43N9","partnerOrderNo":"ORDER_TEST_001","notifyUrl":"https%3A%2F%2Fexample.com%2Fnotify","env":"release"}'
```
返回示例：
```json
{
  "success": true,
  "data": {
    "urlLink": "https://wxaurl.cn/xxxxx",
    "path": "pages/product/detail/detail",
    "query": "id=...&link=...&order=...&notify=...",
    "env": "release"
  }
}
```

## 引流方使用
- 直接将 `urlLink` 用作 H5 按钮或生成二维码；外部浏览器点击会唤起微信并进入小程序。
- 可在 H5 文案提示：若未自动唤起，请用微信扫描/打开。

## 小程序侧
- 目标页面 `onLoad` 解析 `query` 参数（如 `link`/`order`/`notify`/`external_order_no`），跳转到付款流程。

## 部署注意
- 确保 `WECHAT_APPID/WECHAT_SECRET` 为小程序真实值；`WECHAT_H5_APPID/WECHAT_H5_SECRET` 为服务号。
- 修改环境变量后需重启后端：`pm2 restart mall-backend`
- 服务号、小程序已关联；业务域名/合法域名按微信要求配置。
