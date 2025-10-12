require('dotenv').config();

/**
 * 验证API修复效果
 */
async function verifyAPIFix() {
  console.log('🔍 验证APIv3配置修复效果');
  console.log('=====================================');

  const { diagnoseAPIv3Key } = require('./api-v3-key-diagnostic');

  // 运行完整诊断
  await diagnoseAPIv3Key();

  console.log('\n🚀 下一步操作:');
  console.log('1. 如果诊断显示"解密成功"，则配置修复完成');
  console.log('2. 重启后端服务: npm start');
  console.log('3. 进行真实支付测试');
  console.log('4. 检查支付状态: node check-payment-records.js');
}

if (require.main === module) {
  verifyAPIFix();
}

module.exports = { verifyAPIFix };