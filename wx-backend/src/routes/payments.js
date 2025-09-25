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
const AliPay = require('../utils/alipay');
const { beginTransaction, commit, rollback } = require('../config/database');

// 所有支付接口都需要认证
router.use(authenticate);

/**
 * 发起支付
 * POST /api/payments/pay
 */
router.post('/pay', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, paymentMethod = 'wechat' } = req.body;
    
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
      await handlePaymentSuccess(paymentNo, 'MOCK_TRANSACTION', 'wechat');
      paymentData = { paymentId, paymentNo, paymentMethod: 'wechat', mock: true };
    } else if (paymentMethod === 'wechat') {
      // 微信支付
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
      
    } else if (paymentMethod === 'alipay') {
      return error(res, '当前小程序不支持支付宝支付', 400);
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
  try {
    console.log('微信支付回调:', req.headers, req.body);
    
    const wechatPay = new WeChatPay();
    
    // 验证回调签名
    if (process.env.NODE_ENV === 'production' && !wechatPay.verifyCallbackSignature(req.headers, req.body)) {
      console.error('微信支付回调签名验证失败');
      return res.status(400).json({
        code: 'FAIL',
        message: '签名验证失败'
      });
    }
    
    // 解密回调数据
    const { resource } = req.body;
    let callbackData;
    
    if (resource && resource.ciphertext) {
      // 生产环境：解密数据
      callbackData = wechatPay.decryptCallbackData(resource);
    } else {
      // 开发环境：直接使用请求体数据
      callbackData = req.body;
    }
    
    const { out_trade_no, transaction_id, trade_state } = callbackData;
    
    if (trade_state === 'SUCCESS') {
      await handlePaymentSuccess(out_trade_no, transaction_id, 'wechat');
      
      console.log(`微信支付成功: ${out_trade_no} -> ${transaction_id}`);
    } else {
      console.log(`微信支付状态: ${trade_state}, 订单: ${out_trade_no}`);
    }
    
    // 返回微信要求的格式
    res.status(200).json({
      code: 'SUCCESS',
      message: '成功'
    });
    
  } catch (err) {
    console.error('微信支付回调处理失败:', err);
    res.status(500).json({
      code: 'FAIL',
      message: '处理失败'
    });
  }
}));

/**
 * 支付回调处理 (支付宝)
 * POST /api/payments/callback/alipay
 */
router.post('/callback/alipay', asyncHandler(async (req, res) => {
  try {
    console.log('支付宝支付回调:', req.body);
    
    const alipay = new AliPay();
    
    // 验证回调签名
    if (process.env.NODE_ENV === 'production' && !alipay.verifyCallback(req.body)) {
      console.error('支付宝回调签名验证失败');
      return res.send('fail');
    }
    
    const { out_trade_no, trade_no, trade_status } = req.body;
    
    if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
      await handlePaymentSuccess(out_trade_no, trade_no, 'alipay');
      
      console.log(`支付宝支付成功: ${out_trade_no} -> ${trade_no}`);
    } else {
      console.log(`支付宝支付状态: ${trade_status}, 订单: ${out_trade_no}`);
    }
    
    // 返回支付宝要求的格式
    res.send('success');
    
  } catch (err) {
    console.error('支付宝支付回调处理失败:', err);
    res.send('fail');
  }
}));

/**
 * 查询支付状态
 * GET /api/payments/status/:paymentNo
 */
router.get('/status/:paymentNo', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentNo = req.params.paymentNo;
    
    const payments = await query(
      `SELECT p.*
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.payment_no = ? AND o.user_id = ?`,
      [paymentNo, userId]
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
      createdAt: payment.created_at
    }, '获取支付状态成功');
    
  } catch (err) {
    console.error('查询支付状态失败:', err);
    error(res, '查询支付状态失败', 500, err.message);
  }
}));


// 辅助函数：处理支付成功
async function handlePaymentSuccess(paymentNo, thirdPartyNo, paymentMethod) {
  try {
    // 更新支付记录
    await query(
      'UPDATE payments SET status = ?, transaction_id = ?, paid_at = NOW(), updated_at = NOW() WHERE payment_no = ?',
      ['success', thirdPartyNo, paymentNo]
    );
    
    // 获取支付记录
    const payments = await query(
      'SELECT * FROM payments WHERE payment_no = ?',
      [paymentNo]
    );
    
    if (payments.length === 0) {
      throw new Error('支付记录不存在');
    }
    
    const payment = payments[0];
    
    // 更新订单状态
    await query(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      ['completed', payment.order_id]  // 直接设为已完成（自动发货）
    );
    
    // 获取订单信息
    const orders = await query(
      'SELECT * FROM orders WHERE id = ?',
      [payment.order_id]
    );
    
    if (orders.length > 0) {
      const order = orders[0];

      // 支付成功：确认销量（下单未加销量）
      const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [order.id]);
      for (const it of items) {
        await query('UPDATE products SET sales = sales + ? WHERE id = ?', [it.quantity, it.product_id]);
      }
      
      // 确认预分配
      if (order.reservation_id) {
        const confirmResult = await confirmReservation(order.reservation_id);
        if (!confirmResult.success) {
          console.warn('确认预分配失败:', confirmResult.message);
        }
      }
      
      // 分配具体卡密
      for (const item of items) {
        const assignResult = await assignCardCodes(item.product_id, item.quantity);
        if (assignResult.success) {
          console.log(`商品${item.product_id}分配卡密成功:`, assignResult.cardCodes);
        } else {
          console.warn(`商品${item.product_id}分配卡密失败:`, assignResult.message);
        }
      }

      // 调用第三方接口通知支付成功
      await notifyThirdParty(order, payment);
    }
    
    console.log(`支付成功处理完成: ${paymentNo}`);
    
  } catch (err) {
    console.error('处理支付成功失败:', err);
    throw err;
  }
}


// 辅助函数：通知第三方接口
async function notifyThirdParty(order, payment) {
  try {
    const notifyUrl = process.env.THIRD_PARTY_NOTIFY_URL;
    
    if (!notifyUrl) {
      console.log('未配置第三方通知URL，跳过通知');
      return;
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
    
  } catch (err) {
    console.error('通知第三方失败:', err.message);
    // 通知失败不影响主流程，只记录日志
  }
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