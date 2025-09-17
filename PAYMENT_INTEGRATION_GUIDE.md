# 💳 支付接入完整指南

## 🎯 概述

目前系统支持**模拟支付**和**真实支付**两种模式，通过环境变量自动切换：

- **开发环境** (`NODE_ENV=development`)：使用模拟支付
- **生产环境** (`NODE_ENV=production`)：使用真实支付接口

---

## 🔧 真实支付接入步骤

### 1️⃣ **微信支付接入**

#### **前置条件**
- ✅ 已认证的微信小程序
- ✅ 已开通微信支付商户号
- ✅ 商户号与小程序已关联

#### **获取必要信息**
1. **小程序信息**
   - `WECHAT_APPID`: 小程序AppID
   - `WECHAT_SECRET`: 小程序AppSecret

2. **微信支付商户信息**
   - `WECHAT_PAY_MCHID`: 微信支付商户号
   - `WECHAT_PAY_APIV3_KEY`: APIv3密钥（在商户平台设置）

3. **证书下载**
   ```bash
   # 登录微信支付商户平台
   # 账户中心 -> API安全 -> 下载证书
   # 将商户私钥保存为: backend/certs/wechat_pay_private_key.pem
   ```

4. **获取证书序列号**
   ```bash
   # 使用OpenSSL查看证书序列号
   openssl x509 -in wechat_pay_cert.pem -noout -serial
   ```

#### **环境变量配置**
```bash
# 微信小程序
WECHAT_APPID=wx1234567890abcdef
WECHAT_SECRET=your_wechat_secret

# 微信支付
WECHAT_PAY_MCHID=1234567890
WECHAT_PAY_PRIVATE_KEY_PATH=./certs/wechat_pay_private_key.pem
WECHAT_PAY_CERT_SERIAL_NO=1234567890ABCDEF
WECHAT_PAY_APIV3_KEY=your_apiv3_key_32_characters
WECHAT_PAY_NOTIFY_URL=https://yourdomain.com/api/payments/callback/wechat
```

---

### 2️⃣ **支付宝支付接入**

#### **前置条件**
- ✅ 支付宝开发者账号
- ✅ 已创建并上线的小程序应用

#### **获取必要信息**
1. **应用信息**
   - `ALIPAY_APP_ID`: 支付宝应用APPID

2. **密钥生成**
   ```bash
   # 生成RSA2私钥
   openssl genrsa -out alipay_private_key.pem 2048
   
   # 生成对应的公钥
   openssl rsa -in alipay_private_key.pem -pubout -out alipay_app_public_key.pem
   ```

3. **上传公钥**
   - 登录支付宝开放平台
   - 开发者中心 -> 网页&移动应用 -> 选择应用
   - 开发设置 -> 接口加签方式 -> 上传应用公钥
   - 下载支付宝公钥保存为 `alipay_public_key.pem`

#### **环境变量配置**
```bash
# 支付宝
ALIPAY_APP_ID=2021001234567890
ALIPAY_PRIVATE_KEY_PATH=./certs/alipay_private_key.pem
ALIPAY_PUBLIC_KEY_PATH=./certs/alipay_public_key.pem
ALIPAY_NOTIFY_URL=https://yourdomain.com/api/payments/callback/alipay
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
```

---

## 📱 **小程序端支付调用**

### **微信支付**
```javascript
// 小程序调起支付
const paymentData = await app.request.post('/api/payments/pay', {
  orderId: 123,
  paymentMethod: 'wechat'
});

// 调起微信支付
wx.requestPayment({
  timeStamp: paymentData.timeStamp,
  nonceStr: paymentData.nonceStr,
  package: paymentData.package,
  signType: paymentData.signType,
  paySign: paymentData.paySign,
  success: (res) => {
    console.log('支付成功', res);
    // 跳转到支付成功页面
  },
  fail: (err) => {
    console.error('支付失败', err);
    wx.showToast({ title: '支付失败', icon: 'error' });
  }
});
```

### **支付宝支付**
```javascript
// 小程序调起支付
const paymentData = await app.request.post('/api/payments/pay', {
  orderId: 123,
  paymentMethod: 'alipay'
});

// 调起支付宝支付
my.tradePay({
  orderStr: paymentData.orderInfo,
  success: (res) => {
    console.log('支付成功', res);
  },
  fail: (err) => {
    console.error('支付失败', err);
  }
});
```

---

## 🔄 **支付回调处理**

### **回调URL配置**
- **微信支付**: `https://yourdomain.com/api/payments/callback/wechat`
- **支付宝**: `https://yourdomain.com/api/payments/callback/alipay`

### **回调验证**
- 生产环境自动验证签名
- 开发环境跳过签名验证
- 支持数据解密（微信支付v3）

---

## 🏗️ **部署配置**

### **1. 服务器要求**
- Node.js 16+
- MySQL 8.0+
- SSL证书（HTTPS）
- 固定公网IP

### **2. 环境变量设置**
```bash
# 创建生产环境配置
cp backend/env.example backend/.env

# 编辑配置文件
vim backend/.env

# 设置生产环境
NODE_ENV=production
```

### **3. 证书部署**
```bash
# 上传证书到服务器
scp backend/certs/*.pem user@server:/path/to/project/backend/certs/

# 设置证书权限
chmod 600 backend/certs/*.pem
```

### **4. 域名和回调URL**
- 确保域名已备案（国内服务器）
- 在支付平台配置正确的回调URL
- 测试回调URL可访问性

---

## 🧪 **测试流程**

### **1. 开发环境测试**
```bash
# 使用模拟支付测试
NODE_ENV=development npm run dev

# 调用模拟支付成功接口
curl -X POST "http://localhost:3000/api/payments/mock-success" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentNo":"PAY20250917001"}'
```

### **2. 沙箱环境测试**
- 微信支付：使用测试商户号
- 支付宝：使用沙箱环境
  ```bash
  ALIPAY_GATEWAY=https://openapi.alipaydev.com/gateway.do
  ```

### **3. 生产环境验证**
- 小额测试订单
- 验证支付回调
- 确认订单状态更新
- 测试第三方通知

---

## ⚠️ **安全注意事项**

### **1. 证书安全**
- 私钥文件权限设置为 600
- 不要将私钥提交到代码仓库
- 定期更换密钥

### **2. 回调安全**
- 生产环境强制验证签名
- 防重放攻击（时间戳验证）
- IP白名单（如支持）

### **3. 数据安全**
- 订单金额验证
- 防止重复回调处理
- 敏感信息加密存储

---

## 🐛 **常见问题**

### **Q: 微信支付提示"商户号该产品权限未开通"**
A: 到微信支付商户平台开通JSAPI支付权限

### **Q: 支付宝提示"验签失败"**
A: 检查应用公钥是否正确上传到支付宝开放平台

### **Q: 回调URL无法访问**
A: 确保服务器防火墙已开放端口，域名解析正确

### **Q: 开发环境无法测试真实支付**
A: 使用模拟支付API或配置沙箱环境

---

## 📞 **技术支持**

- 微信支付文档: https://pay.weixin.qq.com/wiki/doc/apiv3/
- 支付宝文档: https://opendocs.alipay.com/
- 小程序支付指南: 参考各平台官方文档

---

**🎉 接入完成后，你的小程序就可以支持真实的微信支付和支付宝支付了！**
