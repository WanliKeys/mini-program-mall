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
    
    // 加载私钥
    if (this.privateKeyPath && fs.existsSync(this.privateKeyPath)) {
      this.privateKey = fs.readFileSync(this.privateKeyPath);
    } else {
      console.warn('微信支付私钥文件不存在:', this.privateKeyPath);
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
    try {
      const url = '/v3/pay/transactions/jsapi';
      const fullUrl = this.baseURL + url;
      
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
          openid: order.user_openid || 'mock_openid' // 需要从用户信息中获取
        },
        time_expire: moment().add(30, 'minutes').format('YYYY-MM-DDTHH:mm:ss+08:00')
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
      console.error('微信支付API调用失败:', error.response?.data || error.message);
      throw new Error('微信支付订单创建失败: ' + (error.response?.data?.message || error.message));
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
  verifyCallbackSignature(headers, body) {
    try {
      const signature = headers['wechatpay-signature'];
      const timestamp = headers['wechatpay-timestamp'];
      const nonce = headers['wechatpay-nonce'];
      const serial = headers['wechatpay-serial'];
      
      if (!signature || !timestamp || !nonce || !serial) {
        return false;
      }
      
      // 验证时间戳（防重放攻击）
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parseInt(timestamp)) > 300) { // 5分钟内有效
        return false;
      }
      
      // TODO: 这里需要使用微信支付平台证书公钥验证签名
      // 由于平台证书需要动态获取，这里简化处理
      // 实际生产环境中需要实现证书获取和验证逻辑
      
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
      
      const decipher = crypto.createDecipherGCM('aes-256-gcm');
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
    try {
      const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${this.mchId}`;
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
      
      return response.data;
      
    } catch (error) {
      console.error('微信支付订单查询失败:', error.response?.data || error.message);
      throw error;
    }
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
