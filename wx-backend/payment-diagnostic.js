require('dotenv').config();
const WeChatPay = require('./src/utils/wechatPay.js');
const { query } = require('./src/config/database');

/**
 * 微信支付问题诊断和修复工具
 */
class PaymentDiagnosticTool {
  constructor() {
    this.wechatPay = new WeChatPay();
  }

  /**
   * 诊断指定支付单号的问题
   */
  async diagnosePayment(paymentNo) {
    console.log(`\n=== 开始诊断支付单: ${paymentNo} ===`);

    const diagnostic = {
      paymentNo,
      timestamp: new Date().toISOString(),
      steps: [],
      issues: [],
      recommendations: []
    };

    try {
      // 步骤1: 检查支付记录
      console.log('\n📋 步骤1: 检查本地支付记录...');
      const paymentRecord = await this.checkPaymentRecord(paymentNo, diagnostic);

      if (!paymentRecord) {
        console.error('❌ 支付记录不存在，无法继续诊断');
        return diagnostic;
      }

      // 步骤2: 检查订单状态
      console.log('\n📦 步骤2: 检查订单状态...');
      await this.checkOrderStatus(paymentRecord.order_id, diagnostic);

      // 步骤3: 查询微信支付状态
      if (paymentRecord.payment_method === 'wechat') {
        console.log('\n🔍 步骤3: 查询微信支付状态...');
        await this.queryWeChatPayStatus(paymentNo, diagnostic);
      }

      // 步骤4: 检查配置和连接
      console.log('\n⚙️  步骤4: 检查微信支付配置...');
      await this.checkWeChatPayConfig(diagnostic);

      // 步骤5: 生成修复建议
      console.log('\n💡 步骤5: 生成修复建议...');
      this.generateRecommendations(diagnostic);

      console.log('\n=== 诊断完成 ===');
      return diagnostic;

    } catch (error) {
      console.error('❌ 诊断过程中发生错误:', error.message);
      diagnostic.issues.push({
        step: 'diagnostic_error',
        severity: 'error',
        message: `诊断失败: ${error.message}`
      });
      return diagnostic;
    }
  }

  /**
   * 检查支付记录
   */
  async checkPaymentRecord(paymentNo, diagnostic) {
    try {
      const payments = await query(
        'SELECT * FROM payments WHERE payment_no = ?',
        [paymentNo]
      );

      if (payments.length === 0) {
        console.error('❌ 支付记录不存在');
        diagnostic.issues.push({
          step: 'payment_record',
          severity: 'error',
          message: '支付记录不存在'
        });
        return null;
      }

      const payment = payments[0];
      console.log('✅ 支付记录:', {
        id: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        status: payment.status,
        paymentMethod: payment.payment_method,
        createdAt: payment.created_at,
        transactionId: payment.transaction_id,
        paidAt: payment.paid_at
      });

      diagnostic.steps.push({
        name: 'payment_record',
        status: 'success',
        data: {
          paymentId: payment.id,
          status: payment.status,
          amount: payment.amount,
          paymentMethod: payment.payment_method
        }
      });

      // 检查状态异常
      if (payment.status === 'pending') {
        diagnostic.issues.push({
          step: 'payment_status',
          severity: 'warning',
          message: '支付状态仍为待付款'
        });
      }

      return payment;

    } catch (error) {
      console.error('❌ 查询支付记录失败:', error.message);
      diagnostic.issues.push({
        step: 'payment_record',
        severity: 'error',
        message: `查询支付记录失败: ${error.message}`
      });
      return null;
    }
  }

  /**
   * 检查订单状态
   */
  async checkOrderStatus(orderId, diagnostic) {
    try {
      const orders = await query(
        'SELECT * FROM orders WHERE id = ?',
        [orderId]
      );

      if (orders.length === 0) {
        console.error('❌ 订单记录不存在');
        diagnostic.issues.push({
          step: 'order_record',
          severity: 'error',
          message: '订单记录不存在'
        });
        return;
      }

      const order = orders[0];
      console.log('✅ 订单记录:', {
        id: order.id,
        orderNo: order.order_no,
        status: order.status,
        totalAmount: order.total_amount,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      });

      diagnostic.steps.push({
        name: 'order_record',
        status: 'success',
        data: {
          orderId: order.id,
          orderNo: order.order_no,
          status: order.status
        }
      });

      // 检查状态不一致
      if (order.status === 'pending') {
        diagnostic.issues.push({
          step: 'order_status',
          severity: 'warning',
          message: '订单状态仍为待付款'
        });
      }

    } catch (error) {
      console.error('❌ 查询订单记录失败:', error.message);
      diagnostic.issues.push({
        step: 'order_record',
        severity: 'error',
        message: `查询订单记录失败: ${error.message}`
      });
    }
  }

  /**
   * 查询微信支付状态
   */
  async queryWeChatPayStatus(paymentNo, diagnostic) {
    try {
      console.log('🔍 联系微信支付服务器...');
      const wechatStatus = await this.wechatPay.queryOrder(paymentNo);

      console.log('✅ 微信支付状态:', {
        tradeState: wechatStatus.trade_state,
        transactionId: wechatStatus.transaction_id,
        successTime: wechatStatus.success_time,
        bankType: wechatStatus.bank_type
      });

      diagnostic.steps.push({
        name: 'wechat_status',
        status: 'success',
        data: {
          tradeState: wechatStatus.trade_state,
          transactionId: wechatStatus.transaction_id,
          successTime: wechatStatus.success_time
        }
      });

      // 检查状态不一致
      if (wechatStatus.trade_state === 'SUCCESS') {
        diagnostic.issues.push({
          step: 'status_mismatch',
          severity: 'critical',
          message: '微信显示支付成功，但本地状态未更新',
          wechatState: 'SUCCESS',
          transactionId: wechatStatus.transaction_id
        });

        diagnostic.recommendations.push({
          action: 'sync_payment',
          description: '立即同步支付状态',
          method: 'POST',
          url: `/api/payments/sync/${paymentNo}`,
          priority: 'high'
        });
      } else if (wechatStatus.trade_state === 'CLOSED' || wechatStatus.trade_state === 'PAYERROR') {
        diagnostic.issues.push({
          step: 'payment_failed',
          severity: 'error',
          message: `支付失败: ${wechatStatus.trade_state}`
        });
      } else {
        diagnostic.issues.push({
          step: 'payment_processing',
          severity: 'info',
          message: `支付仍在处理中: ${wechatStatus.trade_state}`
        });
      }

    } catch (error) {
      console.error('❌ 查询微信支付状态失败:', error.message);
      diagnostic.issues.push({
        step: 'wechat_status',
        severity: 'error',
        message: `查询微信支付状态失败: ${error.message}`
      });

      // 检查常见错误
      if (error.message.includes('签名验证失败')) {
        diagnostic.recommendations.push({
          action: 'check_certificates',
          description: '检查微信支付证书配置',
          priority: 'high'
        });
      }

      if (error.message.includes('商户配置')) {
        diagnostic.recommendations.push({
          action: 'check_merchant_config',
          description: '检查微信商户配置',
          priority: 'high'
        });
      }
    }
  }

  /**
   * 检查微信支付配置
   */
  async checkWeChatPayConfig(diagnostic) {
    const configChecks = [];

    // 检查必要配置
    const requiredConfigs = [
      { key: 'WECHAT_APPID', name: '小程序ID' },
      { key: 'WECHAT_PAY_MCHID', name: '商户号' },
      { key: 'WECHAT_PAY_PRIVATE_KEY_PATH', name: '私钥文件路径' },
      { key: 'WECHAT_PAY_CERT_SERIAL_NO', name: '证书序列号' },
      { key: 'WECHAT_PAY_APIV3_KEY', name: 'APIv3密钥' },
      { key: 'WECHAT_PAY_NOTIFY_URL', name: '回调URL' }
    ];

    let configIssues = 0;
    for (const config of requiredConfigs) {
      const value = process.env[config.key];
      if (!value) {
        console.error(`❌ 缺少配置: ${config.name} (${config.key})`);
        diagnostic.issues.push({
          step: 'config_check',
          severity: 'error',
          message: `缺少配置: ${config.name}`
        });
        configIssues++;
      } else {
        console.log(`✅ ${config.name}: ${config.key.includes('SECRET') || config.key.includes('KEY') ? '[已配置]' : value}`);
      }
    }

    if (configIssues === 0) {
      console.log('✅ 微信支付配置检查通过');
      diagnostic.steps.push({
        name: 'config_check',
        status: 'success',
        data: { allConfigsPresent: true }
      });
    } else {
      diagnostic.steps.push({
        name: 'config_check',
        status: 'failed',
        data: { missingConfigs: configIssues }
      });
    }

    // 检查回调URL
    const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL;
    if (notifyUrl) {
      if (notifyUrl.startsWith('https://')) {
        console.log('✅ 回调URL使用HTTPS协议');
      } else {
        console.warn('⚠️  回调URL建议使用HTTPS协议');
        diagnostic.issues.push({
          step: 'notify_url',
          severity: 'warning',
          message: '回调URL建议使用HTTPS协议'
        });
      }
    }

    // 检查模拟支付模式
    const mockMode = process.env.WECHAT_PAY_MOCK;
    if (mockMode === 'true') {
      console.warn('⚠️  当前处于模拟支付模式');
      diagnostic.issues.push({
        step: 'mock_mode',
        severity: 'info',
        message: '当前处于模拟支付模式'
      });
    }
  }

  /**
   * 生成修复建议
   */
  generateRecommendations(diagnostic) {
    console.log('\n🔧 修复建议:');

    // 基于问题生成建议
    diagnostic.issues.forEach(issue => {
      switch (issue.step) {
        case 'status_mismatch':
          console.log(`🚨 高优先级: ${issue.message}`);
          console.log(`   解决方案: 调用支付状态同步接口`);
          break;

        case 'payment_status':
          console.log(`⚠️  中优先级: 支付状态仍为待付款`);
          console.log(`   解决方案: 检查支付回调或手动同步状态`);
          break;

        case 'config_check':
          console.log(`❌ 高优先级: 配置问题`);
          console.log(`   解决方案: 检查环境变量配置`);
          break;

        case 'wechat_status':
          console.log(`⚠️  中优先级: 微信支付状态查询失败`);
          console.log(`   解决方案: 检查网络连接和微信支付配置`);
          break;
      }
    });

    // 通用建议
    console.log('\n📝 通用检查清单:');
    console.log('1. 确保ngrok正在运行且可访问');
    console.log('2. 检查服务器日志中的回调记录');
    console.log('3. 验证微信支付商户配置');
    console.log('4. 确认小程序支付功能已开通');

    // 添加测试建议
    const criticalIssues = diagnostic.issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      console.log('\n🧪 建议进行测试:');
      console.log('1. 调用支付状态同步接口测试');
      console.log('2. 检查日志文件中的详细错误信息');
      console.log('3. 使用微信支付沙箱环境进行测试');
    }
  }

  /**
   * 生成诊断报告
   */
  generateReport(diagnostic) {
    const report = {
      summary: {
        paymentNo: diagnostic.paymentNo,
        timestamp: diagnostic.timestamp,
        totalIssues: diagnostic.issues.length,
        criticalIssues: diagnostic.issues.filter(i => i.severity === 'critical').length,
        warnings: diagnostic.issues.filter(i => i.severity === 'warning').length
      },
      steps: diagnostic.steps,
      issues: diagnostic.issues,
      recommendations: diagnostic.recommendations
    };

    return report;
  }
}

// 主程序
async function main() {
  const paymentNo = process.argv[2];

  if (!paymentNo) {
    console.log('使用方法: node payment-diagnostic.js <payment_no>');
    console.log('示例: node payment-diagnostic.js PAY202501011200001234');
    return;
  }

  console.log('🔍 微信支付诊断工具');
  console.log('=====================================');

  const tool = new PaymentDiagnosticTool();
  const diagnostic = await tool.diagnosePayment(paymentNo);
  const report = tool.generateReport(diagnostic);

  // 保存报告到文件
  try {
    const fs = require('fs');
    const reportPath = `./logs/payment-diagnostic-${paymentNo}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 诊断报告已保存到: ${reportPath}`);
  } catch (error) {
    console.error('保存诊断报告失败:', error.message);
  }

  console.log('\n✅ 诊断完成');
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('工具运行失败:', error);
    process.exit(1);
  });
}

module.exports = PaymentDiagnosticTool;