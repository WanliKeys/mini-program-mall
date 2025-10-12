require('dotenv').config();

/**
 * 微信支付配置检查工具
 */
function checkWeChatConfig() {
  console.log('🔍 微信支付配置检查工具');
  console.log('=====================================');

  // 检查关键配置
  const config = {
    '小程序ID': process.env.WECHAT_APPID,
    '商户号': process.env.WECHAT_PAY_MCHID,
    '证书序列号': process.env.WECHAT_PAY_CERT_SERIAL_NO,
    'APIv3密钥': process.env.WECHAT_PAY_APIV3_KEY,
    '私钥文件': process.env.WECHAT_PAY_PRIVATE_KEY_PATH,
    '回调URL': process.env.WECHAT_PAY_NOTIFY_URL
  };

  console.log('\n📋 当前配置：');
  Object.entries(config).forEach(([key, value]) => {
    if (key.includes('SECRET') || key.includes('KEY') || key.includes('PRIVATE')) {
      console.log(`${key}: ${value ? '[已配置]' : '[未配置]'} ${value ? `(${value.length}位)` : ''}`);
    } else {
      console.log(`${key}: ${value || '[未配置]'}`);
    }
  });

  console.log('\n🔧 配置检查结果：');

  // 检查必需配置
  const requiredConfigs = [
    'WECHAT_APPID',
    'WECHAT_PAY_MCHID',
    'WECHAT_PAY_CERT_SERIAL_NO',
    'WECHAT_PAY_APIV3_KEY',
    'WECHAT_PAY_PRIVATE_KEY_PATH'
  ];

  let allConfigured = true;
  requiredConfigs.forEach(configKey => {
    const value = process.env[configKey];
    if (!value) {
      console.error(`❌ 缺少配置: ${configKey}`);
      allConfigured = false;
    } else {
      console.log(`✅ ${configKey}: 已配置`);
    }
  });

  // 检查APIv3密钥格式
  const apiV3Key = process.env.WECHAT_PAY_APIV3_KEY;
  if (apiV3Key) {
    if (apiV3Key.length === 32) {
      console.log('✅ APIv3密钥长度正确 (32位)');
    } else {
      console.error(`❌ APIv3密钥长度错误 (${apiV3Key.length}位，需要32位)`);
      allConfigured = false;
    }
  }

  // 检查私钥文件
  const fs = require('fs');
  const privateKeyPath = process.env.WECHAT_PAY_PRIVATE_KEY_PATH;
  if (privateKeyPath && fs.existsSync(privateKeyPath)) {
    console.log('✅ 私钥文件存在');
  } else {
    console.error(`❌ 私钥文件不存在: ${privateKeyPath}`);
    allConfigured = false;
  }

  // 检查回调URL
  const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL;
  if (notifyUrl) {
    if (notifyUrl.startsWith('https://')) {
      console.log('✅ 回调URL使用HTTPS协议');
    } else {
      console.warn('⚠️  回调URL建议使用HTTPS协议');
    }
  }

  console.log('\n💡 下一步操作：');

  if (allConfigured) {
    console.log('✅ 所有配置都正确');
    console.log('📋 请到微信商户平台验证APIv3密钥是否匹配：');
    console.log('   1. 登录 https://pay.weixin.qq.com');
    console.log('   2. 导航：产品中心 → 开发配置 → API安全 → APIv3密钥');
    console.log('   3. 查看并确认密钥是否匹配');
    console.log('   4. 如不匹配，请重置密钥并更新配置');
  } else {
    console.log('❌ 配置不完整，请先修复上述问题');
  }

  console.log('\n🚀 配置完成后，请重启后端服务并测试支付');
}

checkWeChatConfig();