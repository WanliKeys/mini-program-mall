const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const moment = require('moment');

/**
 * 微信支付工具类
 */
class WeChatPay {
  constructor() {
    this.appId = process.env.WECHAT_APPID;
    this.mchId = process.env.WECHAT_PAY_MCHID;
    this.privateKeyPath = process.env.WECHAT_PAY_PRIVATE_KEY_PATH;
    this.certSerialNo = process.env.WECHAT_PAY_CERT_SERIAL_NO;
    this.apiV3Key = process.env.WECHAT_PAY_APIV3_KEY;
    this.notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL;

    this.baseURL = 'https://api.mch.weixin.qq.com';
    this.platformCertificates = new Map(); // 缓存平台证书

    // 加载私钥
    if (this.privateKeyPath && fs.existsSync(this.privateKeyPath)) {
      this.privateKey = fs.readFileSync(this.privateKeyPath);
    } else {
      console.error('微信支付私钥文件不存在:', this.privateKeyPath);
      throw new Error('微信支付私钥文件不存在');
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

      // 解密证书
      for (const cert of data) {
        const decryptedCert = this.decryptCertificate(cert.encrypt_certificate);
        if (decryptedCert) {
          this.platformCertificates.set(cert.serial_no, decryptedCert);
        }
      }

      return this.platformCertificates;

    } catch (error) {
      console.error('获取平台证书失败:', error.response?.data || error.message);
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
      const iv = Buffer.from(nonce, 'base64');
      const encrypted = Buffer.from(ciphertext, 'base64');
      const authTag = encrypted.slice(-16);
      const data = encrypted.slice(0, -16);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      if (associated_data) {
        decipher.setAAD(Buffer.from(associated_data, 'utf8'));
      }

      let decrypted = decipher.update(data, null, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error) {
      console.error('平台证书解密失败:', error);
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

    if (!this.privateKey) {
      throw new Error('微信支付私钥未配置');
    }

    const signature = crypto
      .createSign('RSA-SHA256')
      .update(message)
      .sign(this.privateKey, 'base64');

    return signature;
  }

  /**
   * 生成请求头Authorization
   */
  generateAuthorizationHeader(method, url, body = '') {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.random().toString(36).substr(2, 15);
    const signature = this.generateSignature(method, url, timestamp, nonce, body);
    
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${this.certSerialNo}",signature="${signature}"`;
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
    try {
      const signature = headers['wechatpay-signature'];
      const timestamp = headers['wechatpay-timestamp'];
      const nonce = headers['wechatpay-nonce'];
      const serial = headers['wechatpay-serial'];

      if (!signature || !timestamp || !nonce || !serial) {
        console.error('微信支付回调缺少必要的签名信息');
        return false;
      }

      // 验证时间戳（防重放攻击）
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parseInt(timestamp)) > 300) { // 5分钟内有效
        console.error('微信支付回调时间戳过期');
        return false;
      }

      // 确保已获取平台证书
      if (this.platformCertificates.size === 0) {
        await this.getPlatformCertificates();
      }

      // 使用平台证书验证签名
      const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
      const isValid = this.verifySignature(timestamp, nonce, bodyString, signature, serial);

      if (!isValid) {
        console.error('微信支付回调签名验证失败');
        return false;
      }

      return true;

    } catch (error) {
      console.error('微信支付回调签名验证失败:', error);
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
      const iv = Buffer.from(nonce, 'base64');
      const encrypted = Buffer.from(ciphertext, 'base64');
      const authTag = encrypted.slice(-16);
      const data = encrypted.slice(0, -16);
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      if (associated_data) {
        decipher.setAAD(Buffer.from(associated_data, 'utf8'));
      }
      
      let decrypted = decipher.update(data, null, 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
      
    } catch (error) {
      console.error('微信支付回调数据解密失败:', error);
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
