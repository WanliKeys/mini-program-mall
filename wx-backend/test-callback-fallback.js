require('dotenv').config();
const axios = require('axios');

/**
 * 测试微信支付回调
 */
async function testWeChatCallback() {
  console.log('🧪 测试微信支付回调兜底机制');
  console.log('=====================================');

  const callbackUrl = process.env.WECHAT_PAY_NOTIFY_URL;
  if (!callbackUrl) {
    console.error('❌ 未配置回调URL');
    return;
  }

  console.log('📡 回调URL:', callbackUrl);

  // 查询一个真实的支付记录作为测试数据
  const { query } = require('./src/config/database');

  try {
    const payments = await query(
      'SELECT * FROM payments WHERE status = "pending" ORDER BY created_at DESC LIMIT 1'
    );

    if (payments.length === 0) {
      console.log('❌ 没有待处理的支付记录，无法测试');
      return;
    }

    const payment = payments[0];
    console.log('✅ 找到测试支付记录:', {
      paymentNo: payment.payment_no,
      orderId: payment.order_id,
      amount: payment.amount
    });

    // 构造测试回调数据（模拟微信回调格式，但数据故意错误以触发兜底机制）
    const testCallbackData = {
      // 这些数据会被解密失败，触发兜底机制
      resource: {
        original_type: 'transaction',
        algorithm: 'AEAD_AES_256_GCM',
        ciphertext: 'invalid_ciphertext_data_here', // 故意错误的加密数据
        associated_data: 'transaction',
        nonce: 'invalid_nonce_here'
      },
      // 添加未加密的字段用于兜底
      out_trade_no: payment.payment_no,
      trade_state: 'SUCCESS',
      transaction_id: 'TEST_CALLBACK_' + Date.now(),
      amount: {
        total: Math.floor(parseFloat(payment.amount) * 100), // 转换为分
        currency: 'CNY'
      }
    };

    console.log('\n📤 发送测试回调数据...');
    console.log('测试数据:', {
      out_trade_no: testCallbackData.out_trade_no,
      trade_state: testCallbackData.trade_state,
      transaction_id: testCallbackData.transaction_id,
      hasResource: !!testCallbackData.resource
    });

    const response = await axios.post(callbackUrl, testCallbackData, {
      headers: {
        'Content-Type': 'application/json',
        'Wechatpay-Timestamp': Math.floor(Date.now() / 1000).toString(),
        'Wechatpay-Nonce': Math.random().toString(36).substr(2, 32),
        'Wechatpay-Serial': process.env.WECHAT_PAY_CERT_SERIAL_NO || 'TEST_SERIAL',
        'Wechatpay-Signature': 'test_signature_for_development'
      },
      timeout: 10000
    });

    console.log('✅ 回调响应成功:', {
      status: response.status,
      data: response.data
    });

    // 等待一秒后查询支付状态
    setTimeout(async () => {
      console.log('\n🔍 查询支付状态...');
      const updatedPayments = await query(
        'SELECT * FROM payments WHERE payment_no = ?',
        [payment.payment_no]
      );

      if (updatedPayments.length > 0) {
        const updatedPayment = updatedPayments[0];
        console.log('支付状态更新结果:', {
          paymentNo: updatedPayment.payment_no,
          oldStatus: payment.status,
          newStatus: updatedPayment.status,
          transactionId: updatedPayment.transaction_id,
          paidAt: updatedPayment.paid_at
        });

        if (updatedPayment.status === 'success') {
          console.log('🎉 兜底机制测试成功！支付状态已更新为成功');
        } else {
          console.log('⚠️ 支付状态未更新，可能需要进一步调试');
        }
      }
    }, 2000);

  } catch (error) {
    console.error('❌ 测试失败:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    if (error.response?.status === 500) {
      console.log('\n💡 可能的原因：');
      console.log('1. 解密失败但兜底机制尚未生效');
      console.log('2. 数据库连接问题');
      console.log('3. 支付成功处理逻辑异常');
      console.log('4. 检查服务器日志获取详细错误信息');
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testWeChatCallback();
}

module.exports = { testWeChatCallback };