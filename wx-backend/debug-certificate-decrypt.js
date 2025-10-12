require('dotenv').config();
const WeChatPay = require('./src/utils/wechatPay.js');
const crypto = require('crypto');

/**
 * 详细调试证书解密过程
 */
async function debugCertificateDecrypt() {
  console.log('🔍 详细调试证书解密过程');
  console.log('=====================================');

  const wechatPay = new WeChatPay();

  try {
    // 获取证书数据
    console.log('\n📡 获取微信平台证书...');
    const response = await wechatPay.getPlatformCertificates();

    console.log('✅ API调用成功');
    console.log('返回的证书数量:', response.size);

    if (response.size === 0) {
      console.log('❌ 没有成功解密任何证书');

      // 手动尝试解密第一个证书
      console.log('\n🔧 手动调试解密过程...');

      // 这里我们直接调用微信API获取原始数据
      const axios = require('axios');
      const url = 'https://api.mch.weixin.qq.com/v3/certificates';
      const authorization = wechatPay.generateAuthorizationHeader('GET', url);

      const rawResponse = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': authorization,
          'User-Agent': 'Mall-MiniProgram'
        },
        timeout: 10000
      });

      const certData = rawResponse.data.data[0];
      const encryptedCert = certData.encrypt_certificate;

      console.log('\n📊 加密数据详情:');
      console.log('算法:', encryptedCert.algorithm);
      console.log('密文长度:', encryptedCert.ciphertext.length);
      console.log('密文前20位:', encryptedCert.ciphertext.substring(0, 20) + '...');
      console.log('关联数据:', encryptedCert.associated_data);
      console.log('随机数长度:', encryptedCert.nonce.length);
      console.log('随机数:', encryptedCert.nonce);

      // 手动解密
      console.log('\n🔐 尝试手动解密...');
      const apiV3Key = process.env.WECHAT_PAY_APIV3_KEY;
      console.log('使用的APIv3密钥:', apiV3Key);

      try {
        const key = Buffer.from(apiV3Key, 'utf8');
        const iv = Buffer.from(encryptedCert.nonce, 'base64');
        const encrypted = Buffer.from(encryptedCert.ciphertext, 'base64');

        console.log('密钥长度:', key.length, '字节');
        console.log('IV长度:', iv.length, '字节');
        console.log('加密数据长度:', encrypted.length, '字节');

        // 尝试不同的 authTag 提取方式
        console.log('\n🔍 测试不同的 authTag 提取方式...');

        // 方式1：最后16个字节
        const authTag1 = encrypted.slice(-16);
        const data1 = encrypted.slice(0, -16);

        console.log('方式1 - authTag长度:', authTag1.length);
        console.log('方式1 - data长度:', data1.length);

        const decipher1 = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher1.setAuthTag(authTag1);
        if (encryptedCert.associated_data) {
          decipher1.setAAD(Buffer.from(encryptedCert.associated_data, 'utf8'));
        }

        try {
          let decrypted1 = decipher1.update(data1, null, 'utf8');
          decrypted1 += decipher1.final('utf8');
          console.log('✅ 方式1解密成功!');
          console.log('解密数据长度:', decrypted1.length);
          console.log('解密数据前50位:', decrypted1.substring(0, 50) + '...');
        } catch (error1) {
          console.log('❌ 方式1解密失败:', error1.message);
        }

        // 方式2：尝试不同的 authTag 位置
        console.log('\n🔍 测试方式2...');
        const decipher2 = crypto.createDecipheriv('aes-256-gcm', key, iv);

        // 先不设置 authTag，看看会不会有不同的错误
        if (encryptedCert.associated_data) {
          decipher2.setAAD(Buffer.from(encryptedCert.associated_data, 'utf8'));
        }

        let decrypted2 = decipher2.update(data1, null, 'utf8');

        try {
          decipher2.setAuthTag(authTag1);
          decrypted2 += decipher2.final('utf8');
          console.log('✅ 方式2解密成功!');
        } catch (error2) {
          console.log('❌ 方式2解密失败:', error2.message);
        }

      } catch (decryptError) {
        console.error('❌ 解密过程出错:', decryptError.message);
      }
    }

  } catch (error) {
    console.error('❌ 获取证书失败:', error.message);
  }
}

debugCertificateDecrypt();