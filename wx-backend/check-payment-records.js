require('dotenv').config();
const { query } = require('./src/config/database');

/**
 * 检查支付记录
 */
async function checkPaymentRecords() {
  console.log('🔍 检查支付记录');
  console.log('=====================================');

  try {
    // 查询最近的支付记录
    const recentPayments = await query(
      'SELECT * FROM payments ORDER BY created_at DESC LIMIT 5'
    );

    console.log('\n📋 最近的支付记录:');
    if (recentPayments.length === 0) {
      console.log('没有找到支付记录');
      return;
    }

    recentPayments.forEach((payment, index) => {
      console.log(`${index + 1}. 支付单号: ${payment.payment_no}`);
      console.log(`   订单ID: ${payment.order_id}`);
      console.log(`   金额: ${payment.amount}`);
      console.log(`   状态: ${payment.status}`);
      console.log(`   支付方式: ${payment.payment_method}`);
      console.log(`   交易ID: ${payment.transaction_id || 'null'}`);
      console.log(`   创建时间: ${payment.created_at}`);
      console.log(`   更新时间: ${payment.updated_at}`);
      console.log('');
    });

    // 查询对应的订单状态
    const orderIds = recentPayments.map(p => p.order_id);
    const orders = await query(
      `SELECT * FROM orders WHERE id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds
    );

    console.log('📦 对应的订单状态:');
    orders.forEach((order, index) => {
      const payment = recentPayments.find(p => p.order_id === order.id);
      console.log(`${index + 1}. 订单号: ${order.order_no}`);
      console.log(`   订单ID: ${order.id}`);
      console.log(`   订单状态: ${order.status}`);
      console.log(`   订单金额: ${order.total_amount}`);
      console.log(`   对应支付单号: ${payment.payment_no}`);
      console.log(`   支付状态: ${payment.status}`);
      console.log('');
    });

    // 检查是否有待付款状态的支付记录
    const pendingPayments = await query(
      'SELECT * FROM payments WHERE status = "pending" ORDER BY created_at DESC LIMIT 3'
    );

    if (pendingPayments.length > 0) {
      console.log('⚠️  待付款状态的支付记录:');
      pendingPayments.forEach((payment, index) => {
        console.log(`${index + 1}. 支付单号: ${payment.payment_no}`);
        console.log(`   创建时间: ${payment.created_at}`);
        console.log('');
      });
    }

    // 检查今天的支付记录
    const todayPayments = await query(
      'SELECT COUNT(*) as total, SUM(CASE WHEN status = "success" THEN 1 ELSE 0 END) as success_count FROM payments WHERE DATE(created_at) = CURDATE()'
    );

    console.log('📊 今日支付统计:');
    console.log(`   总支付数: ${todayPayments[0].total}`);
    console.log(`   成功支付数: ${todayPayments[0].success_count}`);

  } catch (error) {
    console.error('❌ 查询支付记录失败:', error.message);
  }
}

checkPaymentRecords();