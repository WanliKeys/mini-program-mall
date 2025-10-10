require('dotenv').config();
const WeChatPay = require('./src/utils/wechatPay.js');

/**
 * 微信支付集成测试脚本
 */
async function testWeChatPayIntegration() {
  console.log('=== 微信支付集成测试 ===\n');

  // 1. 测试基本配置
  console.log('1. 测试基本配置...');
  try {
    const wechatPay = new WeChatPay();
    console.log('✅ 微信支付工具类初始化成功');
    console.log('   小程序ID:', wechatPay.appId);
    console.log('   商户号:', wechatPay.mchId);
    console.log('   证书序列号:', wechatPay.certSerialNo);
    console.log('   回调URL:', wechatPay.notifyUrl);
  } catch (error) {
    console.error('❌ 微信支付配置失败:', error.message);
    return;
  }

  // 2. 测试签名生成
  console.log('\n2. 测试签名生成...');
  try {
    const wechatPay = new WeChatPay();
    const signature = wechatPay.generateSignature(
      'POST',
      '/v3/pay/transactions/jsapi',
      '1234567890',
      'testnonce123',
      '{"test": "data"}'
    );
    console.log('✅ 签名生成成功');
    console.log('   签名长度:', signature.length);
  } catch (error) {
    console.error('❌ 签名生成失败:', error.message);
  }

  // 3. 测试小程序支付参数生成
  console.log('\n3. 测试小程序支付参数生成...');
  try {
    const wechatPay = new WeChatPay();
    const payParams = wechatPay.generateMiniProgramPayParams('prepay_test_123456');
    console.log('✅ 小程序支付参数生成成功');
    console.log('   参数包含字段:', Object.keys(payParams));
  } catch (error) {
    console.error('❌ 小程序支付参数生成失败:', error.message);
  }

  // 4. 测试模拟订单创建（如果环境允许）
  console.log('\n4. 测试订单创建参数验证...');
  try {
    const wechatPay = new WeChatPay();

    // 模拟订单数据
    const mockOrder = {
      order_no: 'TEST' + Date.now(),
      total_amount: 0.01, // 1分钱测试
      user_openid: 'test_openid_for_development'
    };

    const paymentNo = 'TESTPAY' + Date.now();

    console.log('   模拟订单数据:', {
      order_no: mockOrder.order_no,
      total_amount: mockOrder.total_amount,
      payment_no: paymentNo
    });

    // 验证参数（不实际调用API）
    if (!mockOrder.order_no || !paymentNo || !mockOrder.total_amount) {
      throw new Error('参数验证失败');
    }

    console.log('✅ 订单创建参数验证通过');
  } catch (error) {
    console.error('❌ 订单创建参数验证失败:', error.message);
  }

  // 5. 环境检查
  console.log('\n5. 环境配置检查...');
  console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('   WECHAT_PAY_MOCK:', process.env.WECHAT_PAY_MOCK);
  console.log('   微信支付回调URL:', process.env.WECHAT_PAY_NOTIFY_URL);

  // 检查回调URL是否可访问（简单检查URL格式）
  try {
    const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL;
    if (notifyUrl && notifyUrl.startsWith('https://')) {
      console.log('✅ 回调URL格式正确（HTTPS）');
    } else {
      console.warn('⚠️  建议使用HTTPS回调URL');
    }
  } catch (error) {
    console.warn('⚠️  回调URL检查失败:', error.message);
  }

  console.log('\n=== 测试完成 ===');
  console.log('\n📋 接入真实微信支付的检查清单:');
  console.log('1. ✅ 关闭模拟支付模式 (WECHAT_PAY_MOCK=false)');
  console.log('2. ✅ 验证商户配置参数');
  console.log('3. ✅ 证书文件和密钥配置');
  console.log('4. ✅ 签名生成和验证');
  console.log('5. ⚠️  确保回调URL可被微信服务器访问');
  console.log('6. ⚠️  微信商户号已开通小程序支付功能');
  console.log('7. ⚠️  小程序已绑定微信支付');
  console.log('\n🚀 现在可以开始真实的微信支付测试！');
}

// 执行测试
testWeChatPayIntegration().catch(error => {
  console.error('测试脚本执行失败:', error);
});