require('dotenv').config();
const WeChatPay = require('./src/utils/wechatPay');

/**
 * 测试证书解密功能
 */
async function testCertificateDecrypt() {
  console.log('🧪 测试证书解密功能');
  console.log('=====================================');

  const wechatPay = new WeChatPay();

  try {
    console.log('📡 获取平台证书...');
    const response = await wechatPay.getPlatformCertificates();

    console.log('✅ 获取成功!');
    console.log('证书数量:', response.size);

    if (response.size > 0) {
      console.log('🎉 证书解密成功！APIv3密钥配置正确');

      // 检查证书内容
      for (const [serialNo, certificate] of response.entries()) {
        console.log(`证书 ${serialNo}:`);
        console.log(`  主题: ${certificate.subject}`);
        console.log(`  有效期: ${certificate.validFrom} - ${certificate.validTo}`);
      }

      console.log('\n✅ 配置验证完成 - 所有配置都正确!');
      return true;
    } else {
      console.log('❌ 证书解密失败 - 没有成功解密任何证书');
      return false;
    }

  } catch (error) {
    console.error('❌ 证书解密测试失败:', error.message);

    if (error.message.includes('401')) {
      console.log('\n💡 401错误通常表示:');
      console.log('1. 商户证书序列号配置错误');
      console.log('2. 私钥文件不匹配');
      console.log('3. 证书已过期');
    }

    if (error.message.includes('Unsupported state')) {
      console.log('\n💡 解密失败通常表示:');
      console.log('1. APIv3密钥不匹配');
      console.log('2. 需要重置APIv3密钥');
    }

    return false;
  }
}

if (require.main === module) {
  testCertificateDecrypt();
}

module.exports = { testCertificateDecrypt };