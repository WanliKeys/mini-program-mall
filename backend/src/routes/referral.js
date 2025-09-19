const express = require('express');
const router = express.Router();
const { success, error } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { query } = require('../config/database');
const moment = require('moment');

/**
 * 记录引流访问
 * POST /api/referral/track
 */
router.post('/track', authenticate, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { externalOrderNo, productId, action = 'visit', extra = {} } = req.body;
    
    if (!externalOrderNo || !productId) {
      return error(res, '外部订单号和商品ID不能为空', 400);
    }
    
    // 验证商品是否存在
    const products = await query(
      'SELECT id, name FROM products WHERE id = ? AND status = 1',
      [productId]
    );
    
    if (products.length === 0) {
      return error(res, '商品不存在或已下架', 404);
    }
    
    // 记录引流日志
    await query(
      `INSERT INTO referral_logs (
        external_order_no, user_id, product_id, action, extra_data, created_at
      ) VALUES (?, ?, ?, ?, ?, NOW())`,
      [externalOrderNo, userId, productId, action, JSON.stringify(extra)]
    );
    
    success(res, null, '引流记录成功');
    
  } catch (err) {
    console.error('记录引流失败:', err);
    error(res, '记录引流失败', 500, err.message);
  }
}));

/**
 * 获取引流统计
 * GET /api/referral/stats
 */
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate, externalOrderNo } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (startDate) {
      whereClause += ' AND DATE(created_at) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      whereClause += ' AND DATE(created_at) <= ?';
      params.push(endDate);
    }
    
    if (externalOrderNo) {
      whereClause += ' AND external_order_no = ?';
      params.push(externalOrderNo);
    }
    
    // 总访问量
    const visitStats = await query(
      `SELECT COUNT(*) as total_visits FROM referral_logs ${whereClause} AND action = 'visit'`,
      params
    );
    
    // 购买转化
    const purchaseStats = await query(
      `SELECT COUNT(*) as total_purchases FROM referral_logs ${whereClause} AND action = 'purchase'`,
      params
    );
    
    // 按产品统计
    const productStats = await query(
      `SELECT 
        product_id,
        COUNT(CASE WHEN action = 'visit' THEN 1 END) as visits,
        COUNT(CASE WHEN action = 'purchase' THEN 1 END) as purchases,
        COUNT(CASE WHEN action = 'purchase' THEN 1 END) * 100.0 / 
        NULLIF(COUNT(CASE WHEN action = 'visit' THEN 1 END), 0) as conversion_rate
       FROM referral_logs ${whereClause}
       GROUP BY product_id
       ORDER BY visits DESC`,
      params
    );
    
    // 按日期统计
    const dailyStats = await query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(CASE WHEN action = 'visit' THEN 1 END) as visits,
        COUNT(CASE WHEN action = 'purchase' THEN 1 END) as purchases
       FROM referral_logs ${whereClause}
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 30`,
      params
    );
    
    const stats = {
      summary: {
        totalVisits: visitStats[0].total_visits,
        totalPurchases: purchaseStats[0].total_purchases,
        conversionRate: visitStats[0].total_visits > 0 
          ? (purchaseStats[0].total_purchases * 100 / visitStats[0].total_visits).toFixed(2)
          : '0.00'
      },
      productStats,
      dailyStats
    };
    
    success(res, stats, '获取引流统计成功');
    
  } catch (err) {
    console.error('获取引流统计失败:', err);
    error(res, '获取引流统计失败', 500, err.message);
  }
}));

/**
 * 获取引流日志
 * GET /api/referral/logs
 */
router.get('/logs', asyncHandler(async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize = 20,
      externalOrderNo,
      productId,
      action,
      startDate,
      endDate
    } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (externalOrderNo) {
      whereClause += ' AND rl.external_order_no = ?';
      params.push(externalOrderNo);
    }
    
    if (productId) {
      whereClause += ' AND rl.product_id = ?';
      params.push(productId);
    }
    
    if (action) {
      whereClause += ' AND rl.action = ?';
      params.push(action);
    }
    
    if (startDate) {
      whereClause += ' AND DATE(rl.created_at) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      whereClause += ' AND DATE(rl.created_at) <= ?';
      params.push(endDate);
    }
    
    const offset = (page - 1) * pageSize;
    
    // 获取日志列表
    const logs = await query(
      `SELECT 
        rl.*,
        p.name as product_name,
        p.image as product_image,
        u.nickname as user_nickname
       FROM referral_logs rl
       LEFT JOIN products p ON rl.product_id = p.id
       LEFT JOIN users u ON rl.user_id = u.id
       ${whereClause}
       ORDER BY rl.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    
    // 获取总数
    const countResult = await query(
      `SELECT COUNT(*) as total FROM referral_logs rl ${whereClause}`,
      params
    );
    
    // 处理数据
    const processedLogs = logs.map(log => ({
      ...log,
      extra_data: log.extra_data ? JSON.parse(log.extra_data) : null
    }));
    
    success(res, {
      logs: processedLogs,
      total: countResult[0].total,
      hasMore: offset + logs.length < countResult[0].total,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / pageSize)
      }
    }, '获取引流日志成功');
    
  } catch (err) {
    console.error('获取引流日志失败:', err);
    error(res, '获取引流日志失败', 500, err.message);
  }
}));

/**
 * 获取订单引流信息
 * GET /api/referral/order/:orderNo
 */
router.get('/order/:orderNo', asyncHandler(async (req, res) => {
  try {
    const orderNo = req.params.orderNo;
    
    // 获取订单信息
    const orders = await query(
      'SELECT * FROM orders WHERE order_no = ?',
      [orderNo]
    );
    
    if (orders.length === 0) {
      return error(res, '订单不存在', 404);
    }
    
    const order = orders[0];
    
    if (order.source !== 'referral') {
      return error(res, '该订单不是引流订单', 400);
    }
    
    // 获取引流日志
    const logs = await query(
      `SELECT 
        rl.*,
        p.name as product_name,
        p.image as product_image
       FROM referral_logs rl
       LEFT JOIN products p ON rl.product_id = p.id
       WHERE rl.external_order_no = ?
       ORDER BY rl.created_at ASC`,
      [orderNo]
    );
    
    // 处理数据
    const processedLogs = logs.map(log => ({
      ...log,
      extra_data: log.extra_data ? JSON.parse(log.extra_data) : null
    }));
    
    success(res, {
      order: {
        orderNo: order.order_no,
        totalAmount: parseFloat(order.total_amount),
        status: order.status,
        source: order.source,
        createdAt: order.created_at
      },
      referralLogs: processedLogs
    }, '获取订单引流信息成功');
    
  } catch (err) {
    console.error('获取订单引流信息失败:', err);
    error(res, '获取订单引流信息失败', 500, err.message);
  }
}));

module.exports = router;