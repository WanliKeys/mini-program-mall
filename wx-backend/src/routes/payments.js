const express = require('express');
const router = express.Router();
const { success, error } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { query } = require('../config/database');
const axios = require('axios');
const moment = require('moment');
const { confirmReservation, assignCardCodes } = require('../utils/inventory');
const WeChatPay = require('../utils/wechatPay');
const { verifyMd5, createGatewayOrder, queryGatewayOrder } = require('../utils/gatewayPay');
const { beginTransaction, commit, rollback } = require('../config/database');

// 所有支付接口都需要认证（除了回调接口）
router.use((req, res, next) => {
  // 回调接口不需要认证（/callback/* 和 /notify）
  if (req.path.includes('/callback/') || req.path === '/notify') {
    return next();
  }
  return authenticate(req, res, next);
});

function unwrapRequestParams(params) {
  const normalized = {};

  Object.keys(params || {}).forEach((key) => {
    const value = params[key];
    normalized[key] = Array.isArray(value) ? value[0] : value;
  });

  return normalized;
}

/**
 * 发起支付
 * POST /api/payments/pay
 */
router.post('/pay', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, paymentMethod: requestedMethod } = req.body;
    const paymentMethod = (process.env.PAY_FORCE_METHOD || requestedMethod || process.env.PAY_DEFAULT_METHOD || 'wechat').toString();

    console.log('💳 /payments/pay method resolved:', {
      orderId,
      userId,
      requestedMethod: requestedMethod || null,
      PAY_FORCE_METHOD: process.env.PAY_FORCE_METHOD || null,
      PAY_DEFAULT_METHOD: process.env.PAY_DEFAULT_METHOD || null,
      resolved: paymentMethod
    });
    
    // 验证订单
    const orders = await query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = ?',
      [orderId, userId, 'pending']
    );
    
    if (orders.length === 0) {
      return error(res, '订单不存在或状态异常', 404);
    }
    
    const order = orders[0];
    
    // 生成支付单号
    const paymentNo = 'PAY' + moment().format('YYYYMMDDHHmmss') + Math.random().toString(36).substr(2, 6).toUpperCase();
    
    // 创建支付记录
    const paymentResult = await query(
      `INSERT INTO payments (
        payment_no, order_id, amount, payment_method, 
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [paymentNo, orderId, order.total_amount, paymentMethod, 'pending']
    );
    
    const paymentId = paymentResult.insertId || (Array.isArray(paymentResult) ? paymentResult[0]?.insertId : undefined);
    if (!paymentId) {
      throw new Error('创建支付记录失败：未获取到插入ID');
    }
    
    let paymentData = {};

    // 模拟支付开关：最小改动，直接走成功路径（用于联调/发卡密流程验证）
    if (process.env.WECHAT_PAY_MOCK === 'true') {
      await handlePaymentSuccess(paymentNo, 'MOCK_TRANSACTION', paymentMethod);
      paymentData = { paymentId, paymentNo, paymentMethod, mock: true };
    } else if (paymentMethod === 'wechat') {
      // 微信支付（原生小程序 wx.requestPayment）
      try {
        const wechatPay = new WeChatPay();
        
        // 获取用户openid（从用户表中获取）
        const users = await query('SELECT openid FROM users WHERE id = ?', [userId]);
        const userOpenid = users.length > 0 ? users[0].openid : null;
        
        if (!userOpenid && process.env.NODE_ENV === 'production') {
          return error(res, '用户openid不存在', 400);
        }
        
        const orderWithOpenid = { ...order, user_openid: userOpenid };
        const wechatPayData = await wechatPay.createOrder(orderWithOpenid, paymentNo);
        
        paymentData = {
          paymentId,
          paymentNo,
          paymentMethod: 'wechat',
          prepayId: wechatPayData.prepay_id,
          nonceStr: wechatPayData.nonceStr,
          timeStamp: wechatPayData.timeStamp,
          package: wechatPayData.package,
          signType: wechatPayData.signType,
          paySign: wechatPayData.paySign
        };
        
      } catch (err) {
        console.error('微信支付创建失败:', err);
        throw err;
      }
    } else if (paymentMethod === 'wxpay') {
      // 6jqb 聚合支付（微信小程序）
      const clientIp =
        (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].toString().split(',')[0].trim()) ||
        req.ip ||
        req.connection?.remoteAddress ||
        '';

      const users = await query('SELECT openid FROM users WHERE id = ?', [userId]);
      const userOpenid = users.length > 0 ? users[0].openid : null;

      if (!userOpenid && process.env.NODE_ENV === 'production') {
        return error(res, '用户openid不存在', 400);
      }

      const orderItems = await query(
        'SELECT product_name FROM order_items WHERE order_id = ? LIMIT 1',
        [orderId]
      );
      const productName = orderItems.length > 0 ? orderItems[0].product_name : '商城订单';
      const gatewayResp = await createGatewayOrder({
        paymentNo,
        amount: order.total_amount,
        clientIp,
        subject: productName,
        body: productName,
        openid: userOpenid || 'mock_openid',
        extParam: orderId.toString()
      });

      paymentData = {
        paymentId,
        paymentNo,
        paymentMethod: 'wxpay',
        payOrderId: gatewayResp.payOrderId,
        payDataType: gatewayResp.payDataType,
        payData: gatewayResp.payData
      };

      console.log('💳 /payments/pay 6jqb response:', {
        paymentNo,
        payOrderId: gatewayResp.payOrderId,
        payDataType: gatewayResp.payDataType
      });
    } else {
      return error(res, '不支持的支付方式', 400);
    }
    
    success(res, paymentData, '支付发起成功');
    
  } catch (err) {
    console.error('发起支付失败:', err);
    error(res, '发起支付失败', 500, err.message);
  }
}));

/**
 * 支付回调处理 (微信)
 * POST /api/payments/callback/wechat
 */
router.post('/callback/wechat', asyncHandler(async (req, res) => {
  const callbackStartTime = Date.now();
  let callbackData = null;
  let paymentRecord = null;

  try {
    console.log('=== 微信支付回调开始 ===', {
      timestamp: new Date().toISOString(),
      requestId: `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    });

    console.log('微信支付回调请求信息:', {
      headers: {
        'wechatpay-timestamp': req.headers['wechatpay-timestamp'],
        'wechatpay-nonce': req.headers['wechatpay-nonce'],
        'wechatpay-serial': req.headers['wechatpay-serial'],
        'wechatpay-signature': req.headers['wechatpay-signature'] ? '[已隐藏]' : 'missing',
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      },
      bodyKeys: Object.keys(req.body),
      bodySize: JSON.stringify(req.body).length
    });

    const wechatPay = new WeChatPay();

    // 步骤1: 验证回调签名
    console.log('步骤1: 开始验证回调签名...');
    const signatureVerifyStart = Date.now();

    const signatureValid = await wechatPay.verifyCallbackSignature(req.headers, req.body);

    if (!signatureValid) {
      console.error('❌ 微信支付回调签名验证失败', {
        duration: `${Date.now() - signatureVerifyStart}ms`,
        headers: {
          'wechatpay-timestamp': req.headers['wechatpay-timestamp'],
          'wechatpay-serial': req.headers['wechatpay-serial']
        }
      });

      // 开发环境下，如果签名验证失败，记录警告但继续处理
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ 开发环境：签名验证失败，但继续处理回调');
        console.warn('💡 生产环境必须修复签名验证问题');
        console.warn('📝 问题：证书过期或APIv3密钥不匹配，需要重新下载证书');
      } else {
        return res.status(400).json({
          code: 'FAIL',
          message: '签名验证失败'
        });
      }
    }

    console.log('✅ 微信支付回调签名验证成功', {
      duration: `${Date.now() - signatureVerifyStart}ms`
    });

    // 步骤2: 解密回调数据
    console.log('步骤2: 开始解密回调数据...');
    const decryptStart = Date.now();

    const { resource } = req.body;

    if (resource && resource.ciphertext) {
      // 正式环境：解密数据
      try {
        callbackData = wechatPay.decryptCallbackData(resource);
        console.log('✅ 微信支付回调数据解密成功', {
          duration: `${Date.now() - decryptStart}ms`,
          out_trade_no: callbackData.out_trade_no,
          transaction_id: callbackData.transaction_id,
          trade_state: callbackData.trade_state,
          amount: callbackData.amount,
          success_time: callbackData.success_time
        });
      } catch (decryptError) {
        console.error('❌ 微信支付回调数据解密失败:', {
          error: decryptError.message,
          duration: `${Date.now() - decryptStart}ms`,
          resourceInfo: {
            algorithm: resource.algorithm,
            ciphertext_length: resource.ciphertext?.length || 0,
            associated_data: resource.associated_data,
            nonce_length: resource.nonce?.length || 0
          }
        });

        // 开发环境下的兜底机制：如果解密失败，尝试从回调请求头和body中提取关键信息
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️ 开发环境：解密失败，启用兜底机制');

          // 尝试从请求体中直接获取信息（某些情况下微信可能未加密）
          if (req.body.out_trade_no) {
            callbackData = req.body;
            console.log('ℹ️ 使用未加密的回调数据作为兜底:', {
              out_trade_no: callbackData.out_trade_no,
              trade_state: callbackData.trade_state || 'UNKNOWN',
              transaction_id: callbackData.transaction_id || 'UNKNOWN'
            });
          } else {
            // 如果无法获取有效数据，返回错误但记录足够信息用于调试
            console.error('❌ 无法从回调中获取有效支付信息');
            return res.status(400).json({
              code: 'FAIL',
              message: '回调数据解密失败且无法获取支付信息'
            });
          }
        } else {
          // 生产环境：解密失败则返回错误
          console.error('❌ 生产环境：回调数据解密失败，无法继续处理');
          return res.status(400).json({
            code: 'FAIL',
            message: '回调数据解密失败'
          });
        }
      }
    } else {
      // 开发环境或测试环境：直接使用请求体数据
      callbackData = req.body;
      console.log('ℹ️ 使用开发环境回调数据', {
        duration: `${Date.now() - decryptStart}ms`,
        data: callbackData
      });
    }

    const { out_trade_no, transaction_id, trade_state, amount } = callbackData;

    if (!out_trade_no) {
      console.error('❌ 微信支付回调缺少订单号');

      // 开发环境兜底：尝试从其他可能的位置获取订单号
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ 开发环境：尝试从回调数据中寻找订单号');

        // 尝试从不同的可能字段中获取订单号
        const possibleFields = ['out_trade_no', 'payment_no', 'order_no', 'paymentNo'];
        let foundOrderNo = null;

        for (const field of possibleFields) {
          if (req.body[field]) {
            foundOrderNo = req.body[field];
            console.log(`✅ 从字段 ${field} 找到订单号: ${foundOrderNo}`);
            break;
          }
        }

        if (!foundOrderNo) {
          console.error('❌ 开发环境兜底失败：无法找到订单号');
          return res.status(400).json({
            code: 'FAIL',
            message: '缺少订单号'
          });
        }

        // 使用找到的订单号和默认的成功状态
        callbackData = {
          out_trade_no: foundOrderNo,
          transaction_id: req.body.transaction_id || 'DEV_FALLBACK_' + Date.now(),
          trade_state: req.body.trade_state || 'SUCCESS', // 默认认为成功
          amount: req.body.amount || { total: 0 } // 默认金额
        };

        console.log('ℹ️ 开发环境兜底：构造回调数据:', {
          out_trade_no: callbackData.out_trade_no,
          transaction_id: callbackData.transaction_id,
          trade_state: callbackData.trade_state
        });
      } else {
        return res.status(400).json({
          code: 'FAIL',
          message: '缺少订单号'
        });
      }
    }

    // 步骤3: 查询支付记录
    console.log('步骤3: 查询支付记录...', { paymentNo: out_trade_no });
    const queryStart = Date.now();

    const paymentRecords = await query(
      'SELECT * FROM payments WHERE payment_no = ?',
      [out_trade_no]
    );

    console.log('支付记录查询完成', {
      duration: `${Date.now() - queryStart}ms`,
      recordCount: paymentRecords.length,
      paymentNo: out_trade_no
    });

    if (paymentRecords.length === 0) {
      console.error('❌ 支付记录不存在:', { paymentNo: out_trade_no });
      return res.status(400).json({
        code: 'FAIL',
        message: '支付记录不存在'
      });
    }

    paymentRecord = paymentRecords[0];
    console.log('找到支付记录:', {
      paymentId: paymentRecord.id,
      orderId: paymentRecord.order_id,
      amount: paymentRecord.amount,
      status: paymentRecord.status,
      createdAt: paymentRecord.created_at
    });

    // 步骤4: 处理支付状态
    if (trade_state === 'SUCCESS') {
      console.log('步骤4: 处理支付成功状态...');

      // 验证金额是否匹配
      const expectedAmount = Math.floor(parseFloat(paymentRecord.amount) * 100); // 转换为分

      if (amount && amount.total !== expectedAmount) {
        console.error('❌ 支付金额不匹配:', {
          expected: expectedAmount,
          actual: amount.total,
          paymentNo: out_trade_no,
          orderId: paymentRecord.order_id
        });
        return res.status(400).json({
          code: 'FAIL',
          message: '支付金额不匹配'
        });
      }

      console.log('✅ 支付金额验证通过', {
        expected: expectedAmount,
        actual: amount.total,
        paymentNo: out_trade_no
      });

      // 检查是否已经处理过
      if (paymentRecord.status === 'success') {
        console.log('ℹ️ 支付记录已经是成功状态，跳过处理', {
          paymentNo: out_trade_no,
          transactionId: paymentRecord.transaction_id,
          paidAt: paymentRecord.paid_at
        });
      } else {
        // 调用支付成功处理
        console.log('开始处理支付成功逻辑...');
        const processStart = Date.now();

        await handlePaymentSuccess(out_trade_no, transaction_id, 'wechat');

        console.log('✅ 微信支付成功处理完成', {
          paymentNo: out_trade_no,
          transactionId: transaction_id,
          duration: `${Date.now() - processStart}ms`,
          totalDuration: `${Date.now() - callbackStartTime}ms`
        });
      }
    } else {
      console.log(`ℹ️ 微信支付状态不是成功状态: ${trade_state}`, {
        paymentNo: out_trade_no,
        tradeState: trade_state,
        transactionId: transaction_id
      });
    }

    // 步骤5: 返回成功响应
    console.log('步骤5: 返回微信支付成功响应');
    res.status(200).json({
      code: 'SUCCESS',
      message: '成功'
    });

    console.log('=== 微信支付回调处理完成 ===', {
      totalDuration: `${Date.now() - callbackStartTime}ms`,
      paymentNo: out_trade_no,
      tradeState: trade_state
    });

  } catch (err) {
    const errorDuration = Date.now() - callbackStartTime;

    console.error('❌ 微信支付回调处理失败:', {
      error: err.message,
      stack: err.stack,
      duration: `${errorDuration}ms`,
      paymentNo: callbackData?.out_trade_no || 'unknown',
      paymentId: paymentRecord?.id || 'unknown',
      orderId: paymentRecord?.order_id || 'unknown',
      callbackData: callbackData ? {
        out_trade_no: callbackData.out_trade_no,
        transaction_id: callbackData.transaction_id,
        trade_state: callbackData.trade_state
      } : null
    });

    // 记录详细错误信息到文件
    try {
      const fs = require('fs');
      const errorLog = {
        timestamp: new Date().toISOString(),
        error: {
          message: err.message,
          stack: err.stack
        },
        request: {
          headers: req.headers,
          body: req.body
        },
        payment: paymentRecord,
        callbackData: callbackData,
        duration: errorDuration
      };

      fs.appendFileSync(
        './logs/wechat-pay-callback-errors.log',
        JSON.stringify(errorLog, null, 2) + '\n---\n'
      );
    } catch (logErr) {
      console.error('写入错误日志失败:', logErr.message);
    }

    res.status(500).json({
      code: 'FAIL',
      message: '处理失败'
    });
  }
}));

/**
 * 支付回调处理 (6jqb 支付网关)
 * GET/POST /api/payments/callback/gateway
 * GET/POST /api/payments/notify
 * 文档要求：收到异步通知后返回 success（纯文本）
 */
async function handleGatewayCallback(req, res) {
  try {
    console.log('6jqb raw callback:', {
      method: req.method,
      contentType: req.headers['content-type'] || '',
      headers: req.headers,
      query: req.query,
      body: req.body
    });

    const sourceParams = (req.body && Object.keys(req.body).length > 0) ? req.body : req.query;
    const params = unwrapRequestParams(sourceParams || {});

    console.log('📥 收到 6jqb 支付回调:', {
      method: req.method,
      mchOrderNo: params.mchOrderNo,
      payOrderId: params.payOrderId,
      state: params.state,
      amount: params.amount
    });

    const key = process.env.JQB_PAY_KEY;
    if (!key) {
      console.error('6jqb 回调验签失败：缺少 JQB_PAY_KEY 配置');
      return res.status(500).send('fail');
    }

    if (!verifyMd5(params, key)) {
      console.warn('6jqb 回调验签失败', {
        mchOrderNo: params.mchOrderNo,
        payOrderId: params.payOrderId
      });
      return res.status(400).send('fail');
    }

    const paymentNo = params.mchOrderNo;
    const payOrderId = params.payOrderId || '';
    const state = Number.parseInt(params.state || '-1', 10);
    const amount = Number.parseInt(params.amount || '-1', 10);

    if (!paymentNo) {
      console.error('回调缺少 mchOrderNo');
      return res.status(400).send('fail');
    }

    const paymentRecords = await query(
      `SELECT p.*, o.status AS order_status
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.payment_no = ?
       LIMIT 1`,
      [paymentNo]
    );

    if (paymentRecords.length === 0) {
      console.error('支付记录不存在:', paymentNo);
      return res.status(400).send('fail');
    }

    const paymentRecord = paymentRecords[0];
    const expectedAmount = Math.round(parseFloat(paymentRecord.amount) * 100);

    if (Number.isFinite(amount) && amount >= 0 && expectedAmount !== amount) {
      console.error('回调金额不匹配', {
        paymentNo,
        expectedAmount,
        actualAmount: amount
      });
      return res.status(400).send('fail');
    }

    if (payOrderId && paymentRecord.transaction_id !== payOrderId) {
      await query(
        'UPDATE payments SET transaction_id = ?, updated_at = NOW() WHERE id = ?',
        [payOrderId, paymentRecord.id]
      );
    }

    if (state === 2) {
      if (paymentRecord.status !== 'success' && paymentRecord.order_status !== 'completed') {
        console.log('处理 6jqb 支付成功:', { paymentNo, payOrderId });
        await handlePaymentSuccess(
          paymentRecord.payment_no,
          params.outTransId || params.channelOrderNo || payOrderId || 'JQB_PAY_ORDER',
          'wxpay'
        );
      } else {
        console.log('订单已处理，跳过:', { paymentNo, status: paymentRecord.order_status });
      }
      return res.send('success');
    }

    if ([3, 4, 6].includes(state) && paymentRecord.status === 'pending') {
      await query(
        'UPDATE payments SET status = ?, updated_at = NOW() WHERE id = ?',
        ['failed', paymentRecord.id]
      );
    }

    return res.send('success');
  } catch (err) {
    console.error('6jqb 回调处理失败:', err.message, err.stack);
    return res.status(500).send('fail');
  }
}

router.get('/callback/gateway', asyncHandler(handleGatewayCallback));
router.post('/callback/gateway', asyncHandler(handleGatewayCallback));

// 别名路由：兼容前端使用的 /api/payments/notify 地址
router.get('/notify', asyncHandler(handleGatewayCallback));
router.post('/notify', asyncHandler(handleGatewayCallback));


/**
 * 查询支付状态
 * GET /api/payments/status/:paymentNo
 *
 * paymentNo 可以是：
 * 1. 后端生成的 payment_no
 * 2. 第三方返回的 payOrderId / channelOrderNo (transaction_id)
 */
router.get('/status/:paymentNo', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentNo = req.params.paymentNo;

    // 尝试多种方式查询支付记录
    let payments = await query(
      `SELECT p.*
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE (p.payment_no = ? OR p.transaction_id = ?) AND o.user_id = ?`,
      [paymentNo, paymentNo, userId]
    );

    if (payments.length === 0) {
      return error(res, '支付记录不存在', 404);
    }

    const payment = payments[0];

    success(res, {
      paymentNo: payment.payment_no,
      status: payment.status,
      amount: parseFloat(payment.amount),
      paymentMethod: payment.payment_method,
      thirdPartyNo: payment.transaction_id,
      paidAt: payment.paid_at,
      createdAt: payment.created_at,
      orderId: payment.order_id
    }, '获取支付状态成功');

  } catch (err) {
    console.error('查询支付状态失败:', err);
    error(res, '查询支付状态失败', 500, err.message);
  }
}));

/**
 * 同步支付状态（主动查询第三方支付状态）
 * POST /api/payments/sync/:paymentNo
 */
router.post('/sync/:paymentNo', asyncHandler(async (req, res) => {
  const syncStart = Date.now();

  try {
    const userId = req.user.id;
    const paymentNo = req.params.paymentNo;

    console.log('🔄 开始同步支付状态:', {
      paymentNo,
      userId,
      timestamp: new Date().toISOString()
    });

    // 查询支付记录
    const payments = await query(
      `SELECT p.*, o.user_id, o.status AS order_status
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.payment_no = ? AND o.user_id = ?`,
      [paymentNo, userId]
    );

    if (payments.length === 0) {
      console.error('❌ 支付记录不存在:', { paymentNo, userId });
      return error(res, '支付记录不存在', 404);
    }

    const payment = payments[0];
    console.log('✅ 找到支付记录:', {
      paymentId: payment.id,
      orderId: payment.order_id,
      currentStatus: payment.status,
      paymentMethod: payment.payment_method
    });

    // 如果已经是成功状态，直接返回
    if (payment.status === 'success') {
      console.log('ℹ️ 支付已经是成功状态，无需同步');
      return success(res, {
        paymentNo: payment.payment_no,
        status: payment.status,
        message: '支付已经是成功状态',
        synced: false,
        alreadyCompleted: true
      }, '支付状态同步完成');
    }

    if (payment.payment_method === 'wxpay') {
      console.log('🔍 查询 6jqb 支付状态...');

      try {
        const gatewayOrderStatus = await queryGatewayOrder({
          paymentNo: payment.payment_no,
          payOrderId: payment.transaction_id || ''
        });

        console.log('✅ 6jqb 支付状态查询成功:', {
          state: gatewayOrderStatus.state,
          payOrderId: gatewayOrderStatus.payOrderId,
          outTransId: gatewayOrderStatus.outTransId
        });

        if (gatewayOrderStatus.state === 2) {
          if (payment.status !== 'success' && payment.order_status !== 'completed') {
            await handlePaymentSuccess(
              payment.payment_no,
              gatewayOrderStatus.outTransId || gatewayOrderStatus.channelOrderNo || gatewayOrderStatus.payOrderId,
              'wxpay'
            );
          }

          return success(res, {
            paymentNo: payment.payment_no,
            status: 'success',
            message: '支付状态同步成功',
            synced: true,
            transactionId: gatewayOrderStatus.outTransId || gatewayOrderStatus.payOrderId,
            duration: Date.now() - syncStart + 'ms'
          }, '支付状态同步成功');
        }

        if ([3, 4, 6].includes(gatewayOrderStatus.state)) {
          await query(
            'UPDATE payments SET status = ?, updated_at = NOW() WHERE payment_no = ?',
            ['failed', paymentNo]
          );

          return success(res, {
            paymentNo: payment.payment_no,
            status: 'failed',
            message: '支付已关闭或失败',
            synced: true,
            state: gatewayOrderStatus.state
          }, '支付状态同步完成');
        }

        return success(res, {
          paymentNo: payment.payment_no,
          status: payment.status,
          message: '支付仍在处理中',
          synced: false,
          state: gatewayOrderStatus.state
        }, '支付状态同步完成');

      } catch (gatewayError) {
        console.error('❌ 6jqb 支付状态查询失败:', {
          error: gatewayError.message,
          paymentNo
        });

        return error(res, '支付状态查询失败: ' + gatewayError.message, 500);
      }
    }

    if (payment.payment_method !== 'wechat') {
      console.log('ℹ️ 该支付通道不支持主动同步:', { paymentMethod: payment.payment_method });
      return error(res, '该支付通道不支持主动同步，请稍后查询支付状态', 400);
    }

    // 查询微信支付状态
    console.log('🔍 查询微信支付状态...');
    const wechatPay = new WeChatPay();

    try {
      const wechatOrderStatus = await wechatPay.queryOrder(paymentNo);

      console.log('✅ 微信支付状态查询成功:', {
        tradeState: wechatOrderStatus.trade_state,
        transactionId: wechatOrderStatus.transaction_id,
        successTime: wechatOrderStatus.success_time
      });

      // 如果微信显示支付成功，但本地状态不是成功，则处理
      if (wechatOrderStatus.trade_state === 'SUCCESS') {
        console.log('💰 检测到支付成功，开始处理...');

        try {
          await handlePaymentSuccess(paymentNo, wechatOrderStatus.transaction_id, 'wechat');

          console.log('✅ 支付状态同步成功:', {
            paymentNo,
            oldStatus: payment.status,
            newStatus: 'success',
            transactionId: wechatOrderStatus.transaction_id,
            duration: Date.now() - syncStart + 'ms'
          });

          return success(res, {
            paymentNo: payment.payment_no,
            status: 'success',
            message: '支付状态同步成功',
            synced: true,
            oldStatus: payment.status,
            newStatus: 'success',
            transactionId: wechatOrderStatus.transaction_id,
            duration: Date.now() - syncStart + 'ms'
          }, '支付状态同步成功');

        } catch (processError) {
          console.error('❌ 处理支付成功失败:', {
            error: processError.message,
            paymentNo,
            transactionId: wechatOrderStatus.transaction_id
          });

          return error(res, '支付状态处理失败: ' + processError.message, 500);
        }

      } else if (wechatOrderStatus.trade_state === 'CLOSED' || wechatOrderStatus.trade_state === 'PAYERROR') {
        console.log('❌ 支付已关闭或失败:', { tradeState: wechatOrderStatus.trade_state });

        // 更新本地状态为失败
        await query(
          'UPDATE payments SET status = ?, updated_at = NOW() WHERE payment_no = ?',
          ['failed', paymentNo]
        );

        return success(res, {
          paymentNo: payment.payment_no,
          status: 'failed',
          message: '支付已关闭或失败',
          synced: true,
          tradeState: wechatOrderStatus.trade_state
        }, '支付状态同步完成');

      } else {
        console.log('ℹ️ 支付仍在处理中:', { tradeState: wechatOrderStatus.trade_state });

        return success(res, {
          paymentNo: payment.payment_no,
          status: payment.status,
          message: '支付仍在处理中',
          synced: false,
          tradeState: wechatOrderStatus.trade_state
        }, '支付状态同步完成');
      }

    } catch (wechatError) {
      console.error('❌ 微信支付状态查询失败:', {
        error: wechatError.message,
        paymentNo
      });

      return error(res, '微信支付状态查询失败: ' + wechatError.message, 500);
    }

  } catch (err) {
    console.error('❌ 支付状态同步失败:', {
      error: err.message,
      stack: err.stack.split('\n')[0],
      duration: Date.now() - syncStart + 'ms'
    });

    error(res, '支付状态同步失败', 500, err.message);
  }
}));


// 辅助函数：处理支付成功
async function handlePaymentSuccess(paymentNo, thirdPartyNo, paymentMethod) {
  const processStart = Date.now();
  let connection = null;

  try {
    console.log('💰 开始处理支付成功流程:', {
      paymentNo,
      thirdPartyNo,
      paymentMethod,
      timestamp: new Date().toISOString()
    });

    // 开始事务
    connection = await beginTransaction();
    console.log('✅ 数据库事务已开启');

    // 步骤1: 更新支付记录（使用事务）
    console.log('步骤1: 更新支付记录...');
    const updatePaymentStart = Date.now();

    await connection.execute(
      'UPDATE payments SET status = ?, transaction_id = ?, paid_at = NOW(), updated_at = NOW() WHERE payment_no = ?',
      ['success', thirdPartyNo, paymentNo]
    );

    console.log('✅ 支付记录更新完成:', {
      duration: Date.now() - updatePaymentStart + 'ms'
    });

    // 步骤2: 获取支付记录（使用事务）
    console.log('步骤2: 获取支付记录...');
    const [payments] = await connection.execute(
      'SELECT * FROM payments WHERE payment_no = ?',
      [paymentNo]
    );

    if (payments.length === 0) {
      throw new Error('支付记录不存在: ' + paymentNo);
    }

    const payment = payments[0];
    console.log('✅ 支付记录获取成功:', {
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      currentStatus: payment.status
    });

    // 步骤3: 更新订单状态（使用事务）
    console.log('步骤3: 更新订单状态...');
    const updateOrderStart = Date.now();

    await connection.execute(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      ['completed', payment.order_id]  // 直接设为已完成（自动发货）
    );

    console.log('✅ 订单状态更新完成:', {
      orderId: payment.order_id,
      newStatus: 'completed',
      duration: Date.now() - updateOrderStart + 'ms'
    });

    // 步骤4: 获取订单信息（使用事务）
    console.log('步骤4: 获取订单详细信息...');
    const [orders] = await connection.execute(
      'SELECT * FROM orders WHERE id = ?',
      [payment.order_id]
    );

    if (orders.length === 0) {
      throw new Error('订单信息不存在: ' + payment.order_id);
    }

    const order = orders[0];
    console.log('✅ 订单信息获取成功:', {
      orderNo: order.order_no,
      totalAmount: order.total_amount,
      reservationId: order.reservation_id
    });

    // 步骤5: 获取订单项（使用事务）
    console.log('步骤5: 获取订单商品信息...');
    const [items] = await connection.execute(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
      [order.id]
    );

    console.log('✅ 订单商品信息获取成功:', {
      itemCount: items.length,
      items: items.map(item => ({
        productId: item.product_id,
        quantity: item.quantity
      }))
    });

    // 步骤6: 更新商品销量（使用事务）
    console.log('步骤6: 更新商品销量...');
    const updateSalesStart = Date.now();

    for (const item of items) {
      await connection.execute(
        'UPDATE products SET sales = sales + ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
      console.log(`商品${item.product_id}销量增加: +${item.quantity}`);
    }

    console.log('✅ 商品销量更新完成:', {
      duration: Date.now() - updateSalesStart + 'ms'
    });

    // 提交事务 - 确保核心数据更新完成
    await commit(connection);
    connection = null;
    console.log('✅ 核心数据库事务已提交');

    // 步骤7: 后续处理（不在事务中，避免阻塞）
    console.log('步骤7: 执行后续业务逻辑...');
    try {
      // 确认预分配
      if (order.reservation_id) {
        console.log('确认预分配库存...');
        const confirmResult = await confirmReservation(order.reservation_id);
        if (confirmResult.success) {
          console.log('✅ 预分配确认成功');
        } else {
          console.warn('⚠️ 预分配确认失败:', confirmResult.message);
        }
      }

      // 分配具体卡密
      console.log('分配卡密...');
      for (const item of items) {
        const assignResult = await assignCardCodes(item.product_id, item.quantity, order.id);
        if (assignResult.success) {
          console.log(`✅ 商品${item.product_id}分配卡密成功:`, {
            cardCount: assignResult.cardCodes?.length || 0
          });
        } else {
          console.warn(`⚠️ 商品${item.product_id}分配卡密失败:`, assignResult.message);
        }
      }

      // 调用第三方接口通知支付成功
      const thirdPartyNotifyResult = await notifyThirdParty(order, payment);
      if (thirdPartyNotifyResult.status === 'success') {
        console.log('✅ 第三方通知发送成功');
      } else if (thirdPartyNotifyResult.status === 'skipped') {
        console.log(`ℹ️ 第三方通知已跳过: ${thirdPartyNotifyResult.reason}`);
      } else {
        console.warn(`⚠️ 第三方通知失败: ${thirdPartyNotifyResult.reason}`);
      }

      // 通知引流方
      const referralNotifyResult = await notifyReferralPartner(order, payment);
      if (referralNotifyResult.status === 'success') {
        console.log('✅ 引流方通知发送成功');
      } else if (referralNotifyResult.status === 'skipped') {
        console.log(`ℹ️ 引流方通知已跳过: ${referralNotifyResult.reason}`);
      } else {
        console.warn(`⚠️ 引流方通知失败: ${referralNotifyResult.reason}`);
      }

    } catch (postProcessError) {
      console.warn('⚠️ 后续处理出现问题:', postProcessError.message);
      // 后续处理失败不影响核心支付流程
    }

    console.log('💰 支付成功处理完成:', {
      paymentNo,
      thirdPartyNo,
      orderId: order.id,
      orderNo: order.order_no,
      totalDuration: Date.now() - processStart + 'ms'
    });

    return {
      success: true,
      paymentNo,
      orderId: order.id,
      orderNo: order.order_no
    };

  } catch (err) {
    // 回滚事务
    if (connection) {
      try {
        await rollback(connection);
        console.log('❌ 数据库事务已回滚');
      } catch (rollbackError) {
        console.error('❌ 事务回滚失败:', rollbackError.message);
      }
    }

    console.error('❌ 处理支付成功失败:', {
      error: err.message,
      stack: err.stack.split('\n')[0], // 只显示第一行堆栈
      paymentNo,
      thirdPartyNo,
      duration: Date.now() - processStart + 'ms'
    });

    // 记录详细错误信息
    try {
      const fs = require('fs');
      const errorLog = {
        timestamp: new Date().toISOString(),
        type: 'PAYMENT_SUCCESS_ERROR',
        paymentNo,
        thirdPartyNo,
        paymentMethod,
        error: {
          message: err.message,
          stack: err.stack
        },
        duration: Date.now() - processStart
      };

      fs.appendFileSync(
        './logs/payment-success-errors.log',
        JSON.stringify(errorLog, null, 2) + '\n---\n'
      );
    } catch (logError) {
      console.error('写入错误日志失败:', logError.message);
    }

    throw err;
  }
}


// 辅助函数：通知第三方接口
async function notifyThirdParty(order, payment) {
  try {
    const notifyUrl = process.env.THIRD_PARTY_NOTIFY_URL;
    
    if (!notifyUrl) {
      console.log('未配置第三方通知URL，跳过通知');
      return { status: 'skipped', reason: '未配置第三方通知URL' };
    }
    
    const notifyData = {
      orderNo: order.order_no,
      status: 'paid',
      amount: parseFloat(order.total_amount),
      paymentMethod: payment.payment_method,
      paidAt: payment.paid_at,
      source: order.source
    };
    
    console.log('通知第三方:', notifyData);
    
    const response = await axios.post(notifyUrl, notifyData, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('第三方通知成功:', response.data);
    return { status: 'success', data: response.data };
    
  } catch (err) {
    console.error('通知第三方失败:', err.message);
    // 通知失败不影响主流程，只记录日志
    return { status: 'failed', reason: err.message };
  }
}

// 辅助函数：通知引流方（带重试机制）
async function notifyReferralPartner(order, payment) {
  try {
    // 检查是否是引流订单
    const referralOrders = await query(
      `SELECT ro.*, rl.link_code
       FROM referral_orders ro
       JOIN referral_links rl ON ro.referral_link_id = rl.id
       WHERE ro.our_order_id = ?`,
      [order.id]
    );

    if (referralOrders.length === 0) {
      console.log('非引流订单，跳过引流方通知');
      return { status: 'skipped', reason: '非引流订单' };
    }

    const referralOrder = referralOrders[0];

    // 重新查询订单的最新卡密信息（因为传入的order对象可能是分配卡密之前的）
    let cardCode = null;
    const latestOrder = await query(
      'SELECT card_code_id FROM orders WHERE id = ?',
      [order.id]
    );
    if (latestOrder.length > 0 && latestOrder[0].card_code_id) {
      const cardCodes = await query(
        'SELECT code FROM card_codes WHERE id = ?',
        [latestOrder[0].card_code_id]
      );
      if (cardCodes.length > 0) {
        cardCode = cardCodes[0].code;
      }
    }

    const notifyData = {
      orderNo: referralOrder.partner_order_no,
      amount: parseFloat(order.total_amount),
      status: 'paid',
      cardCode: cardCode  // 新增卡密字段
    };

    console.log('通知引流方数据:', notifyData);

    // 调用带重试机制的通知函数
    const retryResult = await notifyWithRetry(referralOrder, notifyData);
    return { status: 'success', data: retryResult };

  } catch (error) {
    console.error('引流方通知流程失败:', error.message);
    return { status: 'failed', reason: error.message };
  }
}

// 重试机制实现
async function notifyWithRetry(referralOrder, notifyData) {
  const maxRetries = 5;
  const retryIntervals = [30, 60, 300, 900, 1800]; // 30秒, 1分钟, 5分钟, 15分钟, 30分钟
  const timeout = 10000; // 10秒超时

  let lastError = null;
  let retryCount = 0;

  console.log(`开始通知引流方: ${referralOrder.notify_url}`);

  for (retryCount = 0; retryCount <= maxRetries; retryCount++) {
    try {
      // 如果不是第一次重试，等待指定间隔
      if (retryCount > 0) {
        const waitTime = retryIntervals[Math.min(retryCount - 1, retryIntervals.length - 1)];
        console.log(`第${retryCount}次重试，等待${waitTime}秒...`);
        await sleep(waitTime * 1000);
      }

      console.log(`第${retryCount + 1}次尝试通知引流方...`);

      // 发送HTTP请求
      const response = await axios.post(referralOrder.notify_url, notifyData, {
        timeout: timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mall-Referral-System/1.0'
        }
      });

      // 请求成功
      console.log('✅ 引流方通知成功:', response.data);

      // 更新引流订单状态为成功
      await query(
        'UPDATE referral_orders SET status = ?, updated_at = NOW() WHERE id = ?',
        ['paid', referralOrder.id]
      );

      return response.data;

    } catch (error) {
      lastError = error;

      console.error(`❌ 第${retryCount + 1}次通知失败:`, error.message);

      // 记录详细的错误信息
      if (error.code === 'ECONNABORTED') {
        console.error('超时错误，请求超过10秒未响应');
      } else if (error.code === 'ENOTFOUND') {
        console.error('域名解析失败，请检查notifyUrl是否正确');
      } else if (error.response) {
        console.error('HTTP错误:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      } else {
        console.error('网络错误:', error.code);
      }

      // 如果这是最后一次尝试，不再重试
      if (retryCount === maxRetries) {
        console.error(`❌ 重试${maxRetries}次后仍然失败，放弃通知`);
        break;
      }

      // 继续下一次重试
    }
  }

  // 所有重试都失败了，更新为失败状态
  console.error(`❌ 引流方通知最终失败: ${lastError?.message}`);

  try {
    await query(
      'UPDATE referral_orders SET status = ?, updated_at = NOW() WHERE id = ?',
      ['failed', referralOrder.id]
    );
  } catch (updateError) {
    console.error('更新引流订单状态失败:', updateError.message);
  }

  throw lastError || new Error('引流方通知失败');
}

// 睡眠函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = router;
 
// 分配卡密到订单（按价格精确匹配）
async function assignCardCodeToOrder(orderId, orderAmount) {
  // 使用事务与行锁，避免并发重复分配
  const conn = await beginTransaction();
  try {
    const [cards] = await conn.execute(
      'SELECT id, code FROM card_codes WHERE price = ? AND status = "unused" ORDER BY id ASC LIMIT 1 FOR UPDATE',
      [orderAmount]
    );
    if (!cards || cards.length === 0) {
      await rollback(conn);
      console.warn(`[card] 未找到可用卡密: price=${orderAmount}`);
      return { success: false };
    }
    const card = cards[0];
    await conn.execute('UPDATE card_codes SET status = "shipped", updated_at = NOW() WHERE id = ?', [card.id]);
    await conn.execute('UPDATE orders SET card_code_id = ?, updated_at = NOW() WHERE id = ?', [card.id, orderId]);
    await commit(conn);
    console.log(`[card] 订单 ${orderId} 分配卡密 ${card.code}`);
    return { success: true, cardId: card.id };
  } catch (e) {
    await rollback(conn).catch(()=>{});
    console.error('分配卡密失败:', e.message || e);
    return { success: false };
  }
}
