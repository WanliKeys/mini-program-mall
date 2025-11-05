const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const moment = require('moment');

/**
 * 微信支付工具类
 */
class WeChatPay {
  constructor() {
    // 添加硬编码的默认值作为备用
    this.appId = process.env.WECHAT_APPID || 'wx0b1ce2aa786ec457';
    this.mchId = process.env.WECHAT_PAY_MCHID || '1728730424';
    this.privateKeyPath = process.env.WECHAT_PAY_PRIVATE_KEY_PATH || '/var/www/mall/wx-backend/certs/apiclient_key.pem';
    this.certSerialNo = process.env.WECHAT_PAY_CERT_SERIAL_NO || '52561F95DFC276248CAB5F5B328AACBD29796490';
    this.apiV3Key = (process.env.WECHAT_PAY_APIV3_KEY || '6A17F7871DD7E4B83F0092EC44819F98').trim();
    this.notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL || 'https://jxxcfwlkj.cn/api/payments/callback/wechat';

    // 添加详细的调试日志
    console.log('微信支付配置调试:', {
      appId: this.appId,
      mchId: this.mchId,
      privateKeyPath: this.privateKeyPath,
      certSerialNo: this.certSerialNo,
      certSerialNoLength: this.certSerialNo ? this.certSerialNo.length : 0,
      apiV3KeyLength: this.apiV3Key.length,
      notifyUrl: this.notifyUrl,
      envCertSerialNo: process.env.WECHAT_PAY_CERT_SERIAL_NO
    });

    this.baseURL = 'https://api.mch.weixin.qq.com';
    this.platformCertificates = new Map(); // 缓存平台证书

    // 加载私钥
    if (this.privateKeyPath && fs.existsSync(this.privateKeyPath)) {
      this.privateKey = fs.readFileSync(this.privateKeyPath);
    } else {
      console.error('微信支付私钥文件不存在:', this.privateKeyPath);
      throw new Error('微信支付私钥文件不存在');
    }

    // 校验 APIv3 密钥
    if (!this.apiV3Key || this.apiV3Key.length !== 32) {
      console.error('APIv3 密钥无效: 长度应为32个字符', {
        configured: !!this.apiV3Key,
        length: this.apiV3Key ? this.apiV3Key.length : 0
      });
      throw new Error('微信支付 APIv3 密钥配置不正确（需要32位）');
    }
  }

  /**
   * 获取平台证书
   */
  async getPlatformCertificates() {
    try {
      const url = '/v3/certificates';
      const fullUrl = this.baseURL + url;

      const authorization = this.generateAuthorizationHeader('GET', url);

      const response = await axios.get(fullUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': authorization,
          'User-Agent': 'Mall-MiniProgram'
        },
        timeout: 10000
      });

      const { data } = response.data;

      console.log('🔍 获取到的证书数据:', {
        certificateCount: data.length,
        firstCertSerialNo: data[0]?.serial_no,
        firstCertEncryptInfo: data[0]?.encrypt_certificate ? {
          algorithm: data[0].encrypt_certificate.algorithm,
          ciphertextLength: data[0].encrypt_certificate.ciphertext?.length,
          nonceLength: data[0].encrypt_certificate.nonce?.length,
          associatedDataLength: data[0].encrypt_certificate.associated_data?.length
        } : null
      });

      // 解密证书
      for (const cert of data) {
        console.log(`🔐 开始解密证书: ${cert.serial_no}`);
        const decryptedCert = this.decryptCertificate(cert.encrypt_certificate);
        if (decryptedCert) {
          this.platformCertificates.set(cert.serial_no, decryptedCert);
          console.log(`✅ 证书解密成功: ${cert.serial_no.substring(0, 10)}***`);
        } else {
          console.log(`❌ 证书解密失败: ${cert.serial_no.substring(0, 10)}***`);
        }
      }

      return this.platformCertificates;

    } catch (error) {
      console.error('获取平台证书失败:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack
      });
      throw new Error('获取平台证书失败');
    }
  }

  /**
   * 解密平台证书
   */
  decryptCertificate(encryptedCert) {
    try {
      const { algorithm, ciphertext, associated_data, nonce } = encryptedCert;

      if (algorithm !== 'AEAD_AES_256_GCM') {
        throw new Error('不支持的加密算法');
      }

      const key = Buffer.from(this.apiV3Key, 'utf8');
      const iv = Buffer.from(nonce, 'utf8');
      const encrypted = Buffer.from(ciphertext, 'base64');

      // AES-256-GCM 的认证标签是最后 16 个字节
      const authTag = encrypted.slice(-16);
      const data = encrypted.slice(0, -16);

      console.log('🔍 平台证书解密调试:', {
        algorithm,
        ciphertextLength: ciphertext.length,
        nonceLength: nonce.length,
        associatedDataLength: associated_data?.length || 0,
        encryptedDataLength: encrypted.length,
        authTagLength: authTag.length,
        dataLength: data.length
      });

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      if (associated_data) {
        decipher.setAAD(Buffer.from(associated_data, 'utf8'));
      }

      let decrypted = decipher.update(data, null, 'utf8');
      decrypted += decipher.final('utf8');

      console.log('✅ 平台证书解密成功');
      return decrypted;

    } catch (error) {
      console.error('平台证书解密失败:', {
        error: error.message,
        code: error.code,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * 验证平台证书签名
   */
  verifySignature(timestamp, nonce, body, signature, serialNo) {
    try {
      const publicKey = this.platformCertificates.get(serialNo);
      if (!publicKey) {
        console.warn('未找到序列号为', serialNo, '的平台证书');
        return false;
      }

      const message = `${timestamp}\n${nonce}\n${body}\n`;

      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(message);

      return verify.verify(publicKey, signature, 'base64');

    } catch (error) {
      console.error('平台证书签名验证失败:', error);
      return false;
    }
  }

  /**
   * 生成签名
   */
  generateSignature(method, url, timestamp, nonce, body = '') {
    const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;

    console.log('微信支付签名信息:', {
      method,
      url,
      timestamp,
      nonce,
      bodyLength: body.length,
      body: body.length > 200 ? body.substring(0, 200) + '...' : body,
      message: message.replace(/\n/g, '\\n')
    });

    if (!this.privateKey) {
      throw new Error('微信支付私钥未配置');
    }

    const signature = crypto
      .createSign('RSA-SHA256')
      .update(message)
      .sign(this.privateKey, 'base64');

    console.log('微信支付签名结果:', {
      signatureLength: signature.length,
      signaturePrefix: signature.substring(0, 20) + '...'
    });

    return signature;
  }

  /**
   * 生成请求头Authorization
   */
  generateAuthorizationHeader(method, url, body = '') {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.random().toString(36).substr(2, 15);
    const signature = this.generateSignature(method, url, timestamp, nonce, body);

    const authHeader = `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${this.certSerialNo}",signature="${signature}"`;

    console.log('微信支付Authorization头信息:', {
      mchid: this.mchId,
      nonce_str: nonce,
      timestamp: timestamp,
      serial_no: this.certSerialNo,
      signatureLength: signature.length,
      authHeaderLength: authHeader.length
    });

    return authHeader;
  }

  /**
   * 创建小程序支付订单
   */
  async createOrder(order, paymentNo) {
    const startTime = Date.now();

    try {
      const url = '/v3/pay/transactions/jsapi';
      const fullUrl = this.baseURL + url;

      // 验证必要参数
      if (!order.order_no || !paymentNo || !order.total_amount) {
        throw new Error('微信支付创建订单缺少必要参数');
      }

      if (!order.user_openid && process.env.NODE_ENV === 'production') {
        throw new Error('生产环境缺少用户openid');
      }

      const requestBody = {
        appid: this.appId,
        mchid: this.mchId,
        description: `订单号: ${order.order_no}`,
        out_trade_no: paymentNo,
        notify_url: this.notifyUrl,
        amount: {
          total: Math.floor(parseFloat(order.total_amount) * 100), // 转换为分
          currency: 'CNY'
        },
        payer: {
          openid: order.user_openid || 'mock_openid'
        },
        time_expire: moment().add(30, 'minutes').format('YYYY-MM-DDTHH:mm:ss+08:00')
      };

      console.log('微信支付创建订单请求:', {
        appid: this.appId,
        mchid: this.mchId,
        out_trade_no: paymentNo,
        total_amount: requestBody.amount.total,
        openid: order.user_openid ? `${order.user_openid.substring(0, 8)}***` : 'mock_openid'
      });

      const bodyString = JSON.stringify(requestBody);
      const authorization = this.generateAuthorizationHeader('POST', url, bodyString);

      const response = await axios.post(fullUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': authorization,
          'User-Agent': 'Mall-MiniProgram'
        },
        timeout: 15000 // 增加超时时间
      });

      const duration = Date.now() - startTime;
      console.log('微信支付API调用成功:', {
        prepay_id: response.data.prepay_id,
        duration: `${duration}ms`,
        paymentNo
      });

      if (response.data.prepay_id) {
        // 生成小程序调起支付所需参数
        const paymentParams = this.generateMiniProgramPayParams(response.data.prepay_id);

        return {
          prepay_id: response.data.prepay_id,
          ...paymentParams
        };
      } else {
        throw new Error('微信支付订单创建失败: ' + JSON.stringify(response.data));
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorInfo = {
        paymentNo,
        duration: `${duration}ms`,
        error: error.message,
        response: error.response?.data || 'No response data'
      };

      console.error('微信支付API调用失败:', errorInfo);

      // 根据错误类型返回更具体的错误信息
      if (error.response?.status === 400) {
        throw new Error('微信支付参数错误: ' + (error.response.data?.message || '请求参数有误'));
      } else if (error.response?.status === 401) {
        throw new Error('微信支付认证失败，请检查商户配置');
      } else if (error.response?.status === 403) {
        throw new Error('微信支付权限不足，请检查商户权限设置');
      } else if (error.response?.status === 429) {
        throw new Error('微信支付请求频率过高，请稍后重试');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('微信支付请求超时，请检查网络连接');
      } else {
        throw new Error('微信支付订单创建失败: ' + (error.response?.data?.message || error.message));
      }
    }
  }

  /**
   * 生成小程序调起支付的参数
   */
  generateMiniProgramPayParams(prepayId) {
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = Math.random().toString(36).substr(2, 15);
    const packageValue = `prepay_id=${prepayId}`;
    
    // 生成小程序支付签名
    const message = `${this.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
    const paySign = crypto
      .createSign('RSA-SHA256')
      .update(message)
      .sign(this.privateKey, 'base64');
    
    return {
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: 'RSA',
      paySign
    };
  }

  /**
   * 验证支付回调签名
   */
  async verifyCallbackSignature(headers, body) {
    const verifyStart = Date.now();

    try {
      console.log('🔐 开始验证微信支付回调签名...');

      const signature = headers['wechatpay-signature'];
      const timestamp = headers['wechatpay-timestamp'];
      const nonce = headers['wechatpay-nonce'];
      const serial = headers['wechatpay-serial'];

      // 检查必要的签名信息
      const missingFields = [];
      if (!signature) missingFields.push('signature');
      if (!timestamp) missingFields.push('timestamp');
      if (!nonce) missingFields.push('nonce');
      if (!serial) missingFields.push('serial');

      if (missingFields.length > 0) {
        console.error('❌ 微信支付回调缺少必要的签名信息:', {
          missingFields,
          receivedHeaders: Object.keys(headers).filter(key => key.startsWith('wechatpay-'))
        });
        return false;
      }

      console.log('✅ 签名信息检查通过:', {
        serial: serial.substring(0, 10) + '***',
        timestamp: timestamp,
        nonce: nonce.substring(0, 6) + '***'
      });

      // 验证时间戳（防重放攻击）
      const now = Math.floor(Date.now() / 1000);
      const timestampNum = parseInt(timestamp);
      const timeDiff = Math.abs(now - timestampNum);

      if (timeDiff > 300) { // 5分钟内有效
        console.error('❌ 微信支付回调时间戳过期:', {
          receivedTime: new Date(timestampNum * 1000).toISOString(),
          currentTime: new Date(now * 1000).toISOString(),
          timeDifference: timeDiff + ' seconds',
          maxAllowed: 300 + ' seconds'
        });
        return false;
      }

      console.log('✅ 时间戳验证通过:', {
        timeDifference: timeDiff + ' seconds',
        withinTolerance: true
      });

      // 确保已获取平台证书
      if (this.platformCertificates.size === 0) {
        console.log('📥 首次获取平台证书...');
        const certStart = Date.now();

        try {
          await this.getPlatformCertificates();
          console.log('✅ 平台证书获取成功:', {
            certificateCount: this.platformCertificates.size,
            duration: Date.now() - certStart + 'ms'
          });
        } catch (certError) {
          console.error('❌ 平台证书获取失败:', {
            error: certError.message,
            duration: Date.now() - certStart + 'ms'
          });
          return false;
        }
      }

      // 使用平台证书验证签名
      const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
      console.log('🔍 开始签名验证:', {
        bodyLength: bodyString.length,
        certificateSerial: serial.substring(0, 10) + '***'
      });

      const signVerifyStart = Date.now();
      const isValid = this.verifySignature(timestamp, nonce, bodyString, signature, serial);
      const signVerifyDuration = Date.now() - signVerifyStart;

      console.log(isValid ? '✅' : '❌', '签名验证结果:', {
        isValid: isValid,
        duration: signVerifyDuration + 'ms',
        totalDuration: Date.now() - verifyStart + 'ms'
      });

      if (!isValid) {
        console.error('❌ 微信支付回调签名验证失败:', {
          timestamp,
          nonce,
          serial: serial.substring(0, 10) + '***',
          bodyHash: crypto.createHash('md5').update(bodyString).digest('hex').substring(0, 8) + '***',
          signatureLength: signature.length
        });
        return false;
      }

      console.log('✅ 微信支付回调签名验证完全通过');
      return true;

    } catch (error) {
      console.error('❌ 微信支付回调签名验证异常:', {
        error: error.message,
        stack: error.stack.split('\n')[0], // 只显示第一行堆栈
        duration: Date.now() - verifyStart + 'ms'
      });
      return false;
    }
  }

  /**
   * 解密回调数据
   */
  decryptCallbackData(encryptedData) {
    try {
      const { algorithm, ciphertext, associated_data, nonce } = encryptedData;
      
      if (algorithm !== 'AEAD_AES_256_GCM') {
        throw new Error('不支持的加密算法');
      }
      
      const key = Buffer.from(this.apiV3Key, 'utf8');
      const encrypted = Buffer.from(ciphertext, 'base64');
      const authTag = encrypted.slice(-16);
      const data = encrypted.slice(0, -16);

      const tryDecrypt = (ivBuffer) => {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
        decipher.setAuthTag(authTag);
        if (associated_data) {
          decipher.setAAD(Buffer.from(associated_data, 'utf8'));
        }
        let decrypted = decipher.update(data, null, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      };

      let plaintext;
      try {
        // 首选：nonce 为明文 UTF-8（官方文档）
        plaintext = tryDecrypt(Buffer.from(nonce, 'utf8'));
      } catch (primaryErr) {
        // 兜底：个别上游/代理可能把 nonce 以 base64 形式转发
        try {
          plaintext = tryDecrypt(Buffer.from(nonce, 'base64'));
          console.warn('⚠️ 使用 base64 IV 兼容路径解密成功（请确认上游未改写 nonce 编码）');
        } catch (fallbackErr) {
          throw primaryErr; // 仍以首错抛出，保持错误定位
        }
      }

      return JSON.parse(plaintext);
      
    } catch (error) {
      console.error('微信支付回调数据解密失败:', {
        message: error.message,
        code: error.code,
        algorithm: encryptedData?.algorithm,
        ciphertextLength: encryptedData?.ciphertext?.length || 0,
        nonceLength: encryptedData?.nonce?.length || 0,
        associatedDataLength: encryptedData?.associated_data?.length || 0
      });
      throw error;
    }
  }

  /**
   * 查询订单状态
   */
  async queryOrder(outTradeNo) {
    const startTime = Date.now();

    try {
      const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${this.mchId}`;
      const fullUrl = this.baseURL + url;

      console.log('查询微信支付订单状态:', { outTradeNo });

      const authorization = this.generateAuthorizationHeader('GET', url);

      const response = await axios.get(fullUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': authorization,
          'User-Agent': 'Mall-MiniProgram'
        },
        timeout: 10000
      });

      const duration = Date.now() - startTime;
      console.log('微信支付订单查询成功:', {
        outTradeNo,
        tradeState: response.data.trade_state,
        transactionId: response.data.transaction_id,
        duration: `${duration}ms`
      });

      return response.data;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorInfo = {
        outTradeNo,
        duration: `${duration}ms`,
        error: error.message,
        response: error.response?.data || 'No response data'
      };

      console.error('微信支付订单查询失败:', errorInfo);
      throw error;
    }
  }

  /**
   * 主动查询订单状态，用于处理支付异常
   */
  async checkPaymentStatus(paymentNo, maxRetries = 6, interval = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`查询支付状态 [${attempt}/${maxRetries}]:`, paymentNo);

        const orderStatus = await this.queryOrder(paymentNo);

        if (orderStatus.trade_state === 'SUCCESS') {
          return {
            success: true,
            transactionId: orderStatus.transaction_id,
            paidAt: orderStatus.success_time
          };
        } else if (orderStatus.trade_state === 'CLOSED' || orderStatus.trade_state === 'PAYERROR') {
          return {
            success: false,
            state: orderStatus.trade_state,
            reason: '支付失败或已关闭'
          };
        }

        // 如果仍在处理中，继续等待
        if (attempt < maxRetries) {
          console.log(`支付仍在处理中，${interval/1000}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, interval));
        }

      } catch (error) {
        console.error(`查询支付状态失败 [${attempt}/${maxRetries}]:`, error.message);

        if (attempt === maxRetries) {
          throw error;
        }

        // 等待后重试
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
    }

    return {
      success: false,
      reason: '查询超时'
    };
  }

  /**
   * 申请退款
   */
  async refund(outTradeNo, refundAmount, totalAmount, refundReason = '') {
    try {
      const url = '/v3/refund/domestic/refunds';
      const fullUrl = this.baseURL + url;
      
      const requestBody = {
        out_trade_no: outTradeNo,
        out_refund_no: 'REFUND_' + Date.now(),
        reason: refundReason || '用户申请退款',
        notify_url: process.env.WECHAT_PAY_REFUND_NOTIFY_URL,
        amount: {
          refund: Math.floor(refundAmount * 100),
          total: Math.floor(totalAmount * 100),
          currency: 'CNY'
        }
      };
      
      const bodyString = JSON.stringify(requestBody);
      const authorization = this.generateAuthorizationHeader('POST', url, bodyString);
      
      const response = await axios.post(fullUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': authorization,
          'User-Agent': 'Mall-MiniProgram'
        },
        timeout: 10000
      });
      
      return response.data;
      
    } catch (error) {
      console.error('微信支付退款申请失败:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = WeChatPay;
