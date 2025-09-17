const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const moment = require('moment');
const querystring = require('querystring');

/**
 * 支付宝支付工具类
 */
class AliPay {
  constructor() {
    this.appId = process.env.ALIPAY_APP_ID;
    this.privateKeyPath = process.env.ALIPAY_PRIVATE_KEY_PATH;
    this.publicKeyPath = process.env.ALIPAY_PUBLIC_KEY_PATH;
    this.gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do';
    this.notifyUrl = process.env.ALIPAY_NOTIFY_URL;
    
    // 加载私钥
    if (this.privateKeyPath && fs.existsSync(this.privateKeyPath)) {
      this.privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
    } else {
      console.warn('支付宝私钥文件不存在:', this.privateKeyPath);
    }
    
    // 加载公钥
    if (this.publicKeyPath && fs.existsSync(this.publicKeyPath)) {
      this.publicKey = fs.readFileSync(this.publicKeyPath, 'utf8');
    } else {
      console.warn('支付宝公钥文件不存在:', this.publicKeyPath);
    }
  }

  /**
   * 生成签名
   */
  generateSignature(params) {
    // 排序参数
    const sortedKeys = Object.keys(params).sort();
    const sortedParams = {};
    sortedKeys.forEach(key => {
      sortedParams[key] = params[key];
    });
    
    // 构建待签名字符串
    const signString = querystring.stringify(sortedParams, '&', '=', {
      encodeURIComponent: (str) => str
    });
    
    // 使用私钥签名
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(signString, 'utf8')
      .sign(this.privateKey, 'base64');
    
    return signature;
  }

  /**
   * 验证签名
   */
  verifySignature(params, signature) {
    try {
      // 移除sign字段
      const { sign, sign_type, ...verifyParams } = params;
      
      // 排序参数
      const sortedKeys = Object.keys(verifyParams).sort();
      const sortedParams = {};
      sortedKeys.forEach(key => {
        if (verifyParams[key]) {
          sortedParams[key] = verifyParams[key];
        }
      });
      
      // 构建待验签字符串
      const signString = querystring.stringify(sortedParams, '&', '=', {
        encodeURIComponent: (str) => str
      });
      
      // 验证签名
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(signString, 'utf8');
      
      return verify.verify(this.publicKey, signature, 'base64');
      
    } catch (error) {
      console.error('支付宝签名验证失败:', error);
      return false;
    }
  }

  /**
   * 构建请求参数
   */
  buildRequestParams(method, bizContent) {
    const params = {
      app_id: this.appId,
      method: method,
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
      version: '1.0',
      biz_content: JSON.stringify(bizContent)
    };
    
    if (this.notifyUrl && method.includes('pay')) {
      params.notify_url = this.notifyUrl;
    }
    
    // 生成签名
    params.sign = this.generateSignature(params);
    
    return params;
  }

  /**
   * 创建小程序支付订单
   */
  async createOrder(order, paymentNo) {
    try {
      const bizContent = {
        out_trade_no: paymentNo,
        total_amount: parseFloat(order.total_amount).toFixed(2),
        subject: `订单号: ${order.order_no}`,
        body: `小程序商城订单`,
        buyer_id: order.user_openid || 'mock_buyer_id', // 支付宝用户ID
        timeout_express: '30m' // 30分钟超时
      };
      
      const params = this.buildRequestParams('alipay.trade.create', bizContent);
      
      // 发送请求
      const response = await axios.post(this.gateway, querystring.stringify(params), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });
      
      const result = response.data;
      const responseKey = 'alipay_trade_create_response';
      
      if (result[responseKey] && result[responseKey].code === '10000') {
        return {
          trade_no: result[responseKey].trade_no,
          order_info: this.generateOrderInfo(order, paymentNo)
        };
      } else {
        throw new Error('支付宝订单创建失败: ' + JSON.stringify(result));
      }
      
    } catch (error) {
      console.error('支付宝API调用失败:', error.response?.data || error.message);
      throw new Error('支付宝订单创建失败: ' + error.message);
    }
  }

  /**
   * 生成小程序支付订单信息
   */
  generateOrderInfo(order, paymentNo) {
    const bizContent = {
      out_trade_no: paymentNo,
      total_amount: parseFloat(order.total_amount).toFixed(2),
      subject: `订单号: ${order.order_no}`,
      body: `小程序商城订单`,
      timeout_express: '30m'
    };
    
    const params = this.buildRequestParams('alipay.trade.app.pay', bizContent);
    
    // 返回订单信息字符串，用于小程序调起支付
    return querystring.stringify(params);
  }

  /**
   * 查询订单状态
   */
  async queryOrder(outTradeNo) {
    try {
      const bizContent = {
        out_trade_no: outTradeNo
      };
      
      const params = this.buildRequestParams('alipay.trade.query', bizContent);
      
      const response = await axios.post(this.gateway, querystring.stringify(params), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });
      
      const result = response.data;
      const responseKey = 'alipay_trade_query_response';
      
      if (result[responseKey] && result[responseKey].code === '10000') {
        return result[responseKey];
      } else {
        throw new Error('订单查询失败: ' + JSON.stringify(result));
      }
      
    } catch (error) {
      console.error('支付宝订单查询失败:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 申请退款
   */
  async refund(outTradeNo, refundAmount, refundReason = '') {
    try {
      const bizContent = {
        out_trade_no: outTradeNo,
        out_request_no: 'REFUND_' + Date.now(),
        refund_amount: refundAmount.toFixed(2),
        refund_reason: refundReason || '用户申请退款'
      };
      
      const params = this.buildRequestParams('alipay.trade.refund', bizContent);
      
      const response = await axios.post(this.gateway, querystring.stringify(params), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });
      
      const result = response.data;
      const responseKey = 'alipay_trade_refund_response';
      
      if (result[responseKey] && result[responseKey].code === '10000') {
        return result[responseKey];
      } else {
        throw new Error('退款申请失败: ' + JSON.stringify(result));
      }
      
    } catch (error) {
      console.error('支付宝退款申请失败:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 关闭订单
   */
  async closeOrder(outTradeNo) {
    try {
      const bizContent = {
        out_trade_no: outTradeNo
      };
      
      const params = this.buildRequestParams('alipay.trade.close', bizContent);
      
      const response = await axios.post(this.gateway, querystring.stringify(params), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });
      
      const result = response.data;
      const responseKey = 'alipay_trade_close_response';
      
      return result[responseKey];
      
    } catch (error) {
      console.error('支付宝订单关闭失败:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 验证支付宝回调
   */
  verifyCallback(params) {
    if (!params.sign) {
      return false;
    }
    
    return this.verifySignature(params, params.sign);
  }
}

module.exports = AliPay;
