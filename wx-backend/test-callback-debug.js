require('dotenv').config();
const WeChatPay = require('./src/utils/wechatPay.js');

/**
 * 调试微信支付回调问题的工具
 */
async function debugCallbackIssues() {
  console.log('🔍 微信支付回调调试工具');
  console.log('=====================================');

  try {
    // 1. 检查基本配置
    console.log('\n📋 步骤1: 检查微信支付配置...');
    const wechatPay = new WeChatPay();

    console.log('✅ 微信支付配置检查通过:', {
      appId: wechatPay.appId,
      mchId: wechatPay.mchId,
      certSerialNo: wechatPay.certSerialNo,
      notifyUrl: wechatPay.notifyUrl
    });

    // 2. 测试签名生成
    console.log('\n🔐 步骤2: 测试签名生成...');
    const testSignature = wechatPay.generateSignature(
      'POST',
      '/api/payments/callback/wechat',
      Math.floor(Date.now() / 1000).toString(),
      'testnonce123',
      '{"test": "data"}'
    );
    console.log('✅ 签名生成成功，长度:', testSignature.length);

    // 3. 测试平台证书获取
    console.log('\n📜 步骤3: 测试平台证书获取...');
    try {
      const certificates = await wechatPay.getPlatformCertificates();
      console.log('✅ 平台证书获取成功，数量:', certificates.size);

      certificates.forEach((cert, serialNo) => {
        console.log(`  证书序列号: ${serialNo.substring(0, 10)}***`);
      });
    } catch (certError) {
      console.error('❌ 平台证书获取失败:', certError.message);
      console.log('💡 可能的解决方案:');
      console.log('   1. 检查商户号和API密钥配置');
      console.log('   2. 确认商户API证书配置正确');
      console.log('   3. 检查网络连接');
      return;
    }

    // 4. 测试签名验证
    console.log('\n🔍 步骤4: 测试签名验证...');

    // 模拟微信回调的headers和body
    const mockHeaders = {
      'wechatpay-timestamp': Math.floor(Date.now() / 1000).toString(),
      'wechatpay-nonce': 'testnonce123',
      'wechatpay-serial': Array.from(wechatPay.platformCertificates.keys())[0] || 'test_serial',
      'wechatpay-signature': 'test_signature'
    };

    const mockBody = {
      resource: {
        ciphertext: 'test_encrypted_data',
        associated_data: 'test',
        nonce: 'test_nonce',
        algorithm: 'AEAD_AES_256_GCM'
      }
    };

    console.log('模拟的回调headers:', {
      timestamp: mockHeaders['wechatpay-timestamp'],
      nonce: mockHeaders['wechatpay-nonce'],
      serial: mockHeaders['wechatpay-serial'].substring(0, 10) + '***',
      signature: '[模拟]'
    });

    try {
      // 这里会失败，因为用的是假签名，但我们可以看到验证流程
      const isValid = await wechatPay.verifyCallbackSignature(mockHeaders, mockBody);
      console.log('签名验证结果:', isValid);
    } catch (verifyError) {
      console.log('✅ 签名验证流程正常（预期失败，因为使用模拟数据）');
      console.log('   错误信息:', verifyError.message);
    }

    console.log('\n✅ 调试完成 - 基础功能正常');
    console.log('\n💡 如果仍有400错误，请检查:');
    console.log('   1. 微信商户号是否正确开通小程序支付');
    console.log('   2. 回调URL是否在微信商户后台正确配置');
    console.log('   3. 证书文件是否存在且格式正确');
    console.log('   4. 网络连接是否正常');

  } catch (error) {
    console.error('❌ 调试过程中发生错误:', error.message);
    console.error('详细错误:', error.stack);
  }
}

// 运行调试
debugCallbackIssues();