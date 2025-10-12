require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

/**
 * APIv3密钥问题诊断工具
 */
async function diagnoseAPIv3Key() {
  console.log('🔍 APIv3密钥问题诊断');
  console.log('=====================================');

  const config = {
    mchid: process.env.WECHAT_PAY_MCHID,
    serialNo: process.env.WECHAT_PAY_CERT_SERIAL_NO,
    apiv3Key: process.env.WECHAT_PAY_APIV3_KEY
  };

  console.log('\n📋 当前配置信息:');
  console.log('商户号:', config.mchid);
  console.log('证书序列号:', config.serialNo);
  console.log('APIv3密钥:', config.apiv3Key ? `${config.apiv3Key.substring(0, 8)}...${config.apiv3Key.substring(config.apiv3Key.length - 4)}` : '未配置');
  console.log('APIv3密钥长度:', config.apiv3Key ? config.apiv3Key.length : 0, '位');

  // 问题1: 证书序列号不匹配
  console.log('\n🔍 问题分析 1: 证书序列号');
  console.log('=====================================');

  // 获取平台证书信息
  try {
    const url = 'https://api.mch.weixin.qq.com/v3/certificates';
    const auth = generateAuthHeader('GET', url);

    console.log('📡 尝试获取平台证书...');
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': auth,
        'User-Agent': 'Mall-MiniProgram'
      },
      timeout: 10000
    });

    console.log('✅ API调用成功，状态码:', response.status);

    if (response.data && response.data.data) {
      console.log('📊 获取到平台证书信息:');
      response.data.data.forEach((cert, index) => {
        console.log(`证书${index + 1}:`);
        console.log(`  序列号: ${cert.serial_no}`);
        console.log(`  有效时间: ${cert.effective_time} ~ ${cert.expire_time}`);
        console.log(`  加密算法: ${cert.encrypt_certificate.algorithm}`);
      });

      // 检查是否有序列号不匹配的问题
      const platformSerialNos = response.data.data.map(cert => cert.serial_no);
      if (!platformSerialNos.includes(config.serialNo)) {
        console.log('\n❌ 发现问题: 配置的商户证书序列号与平台不符');
        console.log('当前配置:', config.serialNo);
        console.log('平台期望:', platformSerialNos);
        console.log('\n💡 解决方案:');
        console.log('1. 检查是否使用了错误的证书序列号');
        console.log('2. 可能需要重新下载商户API证书');
        console.log('3. 确认证书文件与商户账号匹配');
      } else {
        console.log('\n✅ 证书序列号匹配');
      }
    }

  } catch (error) {
    if (error.response?.status === 401) {
      console.log('❌ 401 未授权错误 - 通常表示证书序列号不匹配');
      console.log('💡 解决方案: 请检查商户API证书序列号是否正确');
    } else {
      console.log('❌ 获取证书失败:', error.message);
    }
  }

  // 问题2: APIv3密钥验证
  console.log('\n🔍 问题分析 2: APIv3密钥');
  console.log('=====================================');

  if (!config.apiv3Key) {
    console.log('❌ APIv3密钥未配置');
    return;
  }

  if (config.apiv3Key.length !== 32) {
    console.log('❌ APIv3密钥长度错误，应为32位，当前为', config.apiv3Key.length, '位');
    return;
  }

  // 验证密钥格式（应该是32位十六进制字符）
  const hexPattern = /^[0-9a-fA-F]{32}$/;
  if (!hexPattern.test(config.apiv3Key)) {
    console.log('❌ APIv3密钥格式错误，应为32位十六进制字符');
    console.log('当前密钥包含非十六进制字符:', config.apiv3Key.replace(/[0-9a-fA-F]/g, '?'));
    console.log('💡 解决方案: 重新生成正确的32位十六进制APIv3密钥');
    return;
  }

  console.log('✅ APIv3密钥格式正确');

  // 尝试解密示例数据来验证密钥
  console.log('\n🔍 问题分析 3: 密钥有效性验证');
  console.log('=====================================');

  try {
    // 获取一个真实的加密数据进行测试
    const url = 'https://api.mch.weixin.qq.com/v3/certificates';
    const auth = generateAuthHeader('GET', url);

    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': auth,
        'User-Agent': 'Mall-MiniProgram'
      },
      timeout: 10000
    });

    if (response.data?.data?.[0]?.encrypt_certificate) {
      const encryptedCert = response.data.data[0].encrypt_certificate;

      console.log('📊 测试解密平台证书:');
      console.log('算法:', encryptedCert.algorithm);
      console.log('密文长度:', encryptedCert.ciphertext.length);
      console.log('关联数据:', encryptedCert.associated_data);
      console.log('随机数长度:', encryptedCert.nonce.length);

      // 尝试解密
      try {
        const key = Buffer.from(config.apiv3Key, 'utf8');
        const iv = Buffer.from(encryptedCert.nonce, 'base64');
        const encrypted = Buffer.from(encryptedCert.ciphertext, 'base64');

        // AES-256-GCM解密
        const authTag = encrypted.slice(-16);
        const data = encrypted.slice(0, -16);

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        if (encryptedCert.associated_data) {
          decipher.setAAD(Buffer.from(encryptedCert.associated_data, 'utf8'));
        }

        let decrypted = decipher.update(data, null, 'utf8');
        decrypted += decipher.final('utf8');

        console.log('✅ 解密成功！APIv3密钥正确');
        console.log('解密数据长度:', decrypted.length, '字符');
        console.log('解密数据前50位:', decrypted.substring(0, 50) + '...');

      } catch (decryptError) {
        console.log('❌ 解密失败:', decryptError.message);
        console.log('\n💡 这就是问题的根本原因！');
        console.log('APIv3密钥与微信商户平台设置不匹配');
        console.log('\n🔧 解决方案:');
        console.log('1. 登录微信商户平台: https://pay.weixin.qq.com');
        console.log('2. 导航: 产品中心 → 开发配置 → API安全 → APIv3密钥');
        console.log('3. 重置APIv3密钥');
        console.log('4. 生成新的32位十六进制密钥');
        console.log('5. 更新.env文件中的WECHAT_PAY_APIV3_KEY');
        console.log('6. 重启后端服务');
      }
    }

  } catch (error) {
    console.log('❌ 无法获取测试数据:', error.message);
  }

  console.log('\n📋 总结');
  console.log('=====================================');
  console.log('基于以上诊断，问题很可能是:');
  console.log('1. 证书序列号配置错误（导致401错误）');
  console.log('2. APIv3密钥不匹配（导致解密失败）');
  console.log('\n建议按优先级处理:');
  console.log('🥇 首先修复证书序列号问题');
  console.log('🥈 然后重置APIv3密钥');
}

// 生成签名头
function generateAuthHeader(method, url) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).substr(2, 32);

  // 构造签名字符串
  const urlPath = new URL(url).pathname + new URL(url).search;
  const signStr = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n\n`;

  // 读取私钥
  const fs = require('fs');
  const privateKey = fs.readFileSync(process.env.WECHAT_PAY_PRIVATE_KEY_PATH, 'utf8');

  // 签名
  const sign = crypto.createSign('RSA-SHA256').update(signStr).sign(privateKey, 'base64');

  // 构造认证头
  const mchid = process.env.WECHAT_PAY_MCHID;
  const serialNo = process.env.WECHAT_PAY_CERT_SERIAL_NO;

  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${sign}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

if (require.main === module) {
  diagnoseAPIv3Key();
}

module.exports = { diagnoseAPIv3Key };