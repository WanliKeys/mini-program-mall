require('dotenv').config();
const crypto = require('crypto');

/**
 * 测试 APIv3 密钥
 */
function testApiV3Key() {
  console.log('🔑 APIv3 密钥测试工具');
  console.log('=====================================');

  const apiV3Key = process.env.WECHAT_PAY_APIV3_KEY;

  console.log('当前 APIv3 密钥:', apiV3Key);
  console.log('密钥长度:', apiV3Key?.length || 0, '位');

  if (!apiV3Key) {
    console.error('❌ APIv3 密钥未配置');
    return;
  }

  if (apiV3Key.length !== 32) {
    console.error('❌ APIv3 密钥长度不正确，应该是32位');
    return;
  }

  console.log('✅ APIv3 密钥长度正确');

  // 测试 AES-256-GCM 加密解密
  try {
    const testMessage = 'Hello, WeChat Pay!';
    const iv = crypto.randomBytes(12); // 96-bit IV

    console.log('\n🔐 测试 AES-256-GCM 加密解密...');

    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), iv);

    let encrypted = cipher.update(testMessage, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    console.log('✅ 加密成功');
    console.log('加密数据长度:', encrypted.length);
    console.log('认证标签长度:', authTag.length);

    // 测试解密
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    console.log('✅ 解密成功');
    console.log('原始消息:', testMessage);
    console.log('解密消息:', decrypted);
    console.log('消息匹配:', testMessage === decrypted ? '✅' : '❌');

  } catch (error) {
    console.error('❌ AES-256-GCM 加密解密测试失败:', error.message);
  }

  console.log('\n💡 如果测试失败，说明 APIv3 密钥不正确');
  console.log('请到微信商户平台重新生成 APIv3 密钥');
}

testApiV3Key();