require('dotenv').config();
const WeChatPay = require('./src/utils/wechatPay.js');
const crypto = require('crypto');

/**
 * 高级微信支付诊断工具
 */
async function advancedDiagnostic() {
  console.log('🔬 微信支付高级诊断工具');
  console.log('=====================================');

  const wechatPay = new WeChatPay();

  // 1. 检查所有配置
  console.log('\n📋 配置检查:');
  console.log('商户号:', wechatPay.mchId);
  console.log('小程序ID:', wechatPay.appId);
  console.log('证书序列号:', wechatPay.certSerialNo);
  console.log('APIv3密钥长度:', process.env.WECHAT_PAY_APIV3_KEY?.length || 0, '位');
  console.log('回调URL:', wechatPay.notifyUrl);

  // 2. 测试API连接
  console.log('\n🌐 测试API连接...');
  try {
    const response = await wechatPay.getPlatformCertificates();
    console.log('✅ API连接成功');
    console.log('获取到的证书数量:', response.size);
  } catch (error) {
    console.error('❌ API连接失败:', error.message);

    if (error.response) {
      console.error('HTTP状态码:', error.response.status);
      console.error('错误详情:', error.response.data);
    }

    // 分析错误类型
    if (error.message.includes('商户证书序列号有误')) {
      console.error('\n🎯 问题分析: 证书序列号与私钥不匹配');
      console.log('💡 解决方案: 重新下载正确的API证书');
    } else if (error.message.includes('SIGN_ERROR')) {
      console.error('\n🎯 问题分析: 签名错误');
      console.log('💡 解决方案: 检查私钥文件和APIv3密钥');
    } else if (error.response?.status === 401) {
      console.error('\n🎯 问题分析: 认证失败');
      console.log('💡 解决方案: 检查商户号和证书配置');
    }
    return;
  }

  // 3. 检查私钥文件
  console.log('\n🔐 检查私钥文件...');
  try {
    const fs = require('fs');
    const privateKeyContent = fs.readFileSync(wechatPay.privateKeyPath, 'utf8');

    // 检查私钥格式
    if (privateKeyContent.includes('BEGIN PRIVATE KEY')) {
      console.log('✅ 私钥格式正确 (PKCS#8)');
    } else if (privateKeyContent.includes('BEGIN RSA PRIVATE KEY')) {
      console.log('✅ 私钥格式正确 (PKCS#1)');
    } else {
      console.error('❌ 私钥格式不正确');
    }

    // 尝试加载私钥
    try {
      const publicKey = crypto.createPublicKey({
        key: privateKeyContent,
        format: 'pem'
      });
      console.log('✅ 私钥可以正常加载');
    } catch (keyError) {
      console.error('❌ 私钥加载失败:', keyError.message);
    }

  } catch (fileError) {
    console.error('❌ 私钥文件读取失败:', fileError.message);
  }

  // 4. 测试签名生成和验证
  console.log('\n🔍 测试签名功能...');
  try {
    const testMessage = 'test message';
    const signature = wechatPay.generateSignature('POST', '/test', '1234567890', 'testnonce', testMessage);
    console.log('✅ 签名生成成功');
    console.log('签名长度:', signature.length);
  } catch (signError) {
    console.error('❌ 签名生成失败:', signError.message);
  }

  // 5. 检查环境配置
  console.log('\n⚙️  环境检查:');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('WECHAT_PAY_MOCK:', process.env.WECHAT_PAY_MOCK);

  // 6. 建议的解决方案
  console.log('\n💡 建议的解决方案:');
  console.log('1. 确认微信商户号已开通小程序支付功能');
  console.log('2. 确认API证书已正确下载并配置');
  console.log('3. 确认回调URL已在商户后台配置');
  console.log('4. 检查商户API权限设置');
  console.log('5. 联系微信支付技术支持');
}

// 运行诊断
advancedDiagnostic().catch(error => {
  console.error('诊断失败:', error);
});