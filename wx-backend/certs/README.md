# 支付证书配置说明

此目录用于存放支付相关的证书文件。

## 微信支付证书

### 需要的文件：
- `wechat_pay_private_key.pem` - 微信支付商户私钥
- `wechat_pay_cert.pem` - 微信支付商户证书（可选）

### 获取步骤：
1. 登录微信支付商户平台
2. 进入【账户中心】->【API安全】
3. 下载商户证书
4. 将私钥文件重命名为 `wechat_pay_private_key.pem` 并放入此目录

### 环境变量配置：
```bash
WECHAT_PAY_MCHID=your_merchant_id
WECHAT_PAY_PRIVATE_KEY_PATH=./certs/wechat_pay_private_key.pem
WECHAT_PAY_CERT_SERIAL_NO=your_cert_serial_number
WECHAT_PAY_APIV3_KEY=your_apiv3_key
```

## 支付宝证书

### 需要的文件：
- `alipay_private_key.pem` - 应用私钥
- `alipay_public_key.pem` - 支付宝公钥

### 获取步骤：
1. 登录支付宝开放平台
2. 进入【开发者中心】->【网页&移动应用】
3. 选择你的应用，进入【开发设置】
4. 在【接口加签方式】中生成或上传RSA2密钥
5. 下载应用私钥和支付宝公钥

### 环境变量配置：
```bash
ALIPAY_APP_ID=your_app_id
ALIPAY_PRIVATE_KEY_PATH=./certs/alipay_private_key.pem
ALIPAY_PUBLIC_KEY_PATH=./certs/alipay_public_key.pem
```

## 安全注意事项

⚠️ **重要提醒：**
- 私钥文件绝对不能提交到版本控制系统
- 建议在服务器上设置适当的文件权限（600）
- 定期更换密钥以提高安全性
- 生产环境和测试环境使用不同的密钥

## gitignore

确保在 `.gitignore` 中添加：
```
# 支付证书
backend/certs/*.pem
backend/certs/*.p12
backend/certs/*.key
```
