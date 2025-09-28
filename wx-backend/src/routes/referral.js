const express = require('express');
const router = express.Router();
const { success, error } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');
const { query } = require('../config/database');

/**
 * 测试API
 * GET /api/referral/test
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '测试API正常',
    data: {
      test: 'hello world'
    }
  });
});

/**
 * 获取引流商品信息
 * GET /api/referral/product
 */
router.get('/product', asyncHandler(async (req, res) => {
  try {
    const { linkCode } = req.query;
    
    if (!linkCode) {
      return error(res, '链接码不能为空', 400);
    }
    
    // 获取引流链接信息
    const links = await query(
      `SELECT rl.*, p.*, c.name as category_name
       FROM referral_links rl
       JOIN products p ON rl.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       WHERE rl.link_code = ? AND rl.status = 'active'`,
      [linkCode]
    );
    
    if (links.length === 0) {
      return error(res, '引流链接不存在或已失效', 404);
    }
    
    const link = links[0];
    
    // 检查商品状态
    if (link.status !== 1) {
      return error(res, '商品已下架', 400);
    }
    
    // 安全处理JSON字段
    let images = [];
    let tags = [];
    
    if (link.images) {
      try {
        if (typeof link.images === 'string') {
          images = JSON.parse(link.images);
        } else if (Array.isArray(link.images)) {
          images = link.images;
        }
      } catch (e) {
        console.warn('解析images失败，使用默认值:', e.message);
        images = [];
      }
    }
    
    if (link.tags) {
      try {
        if (typeof link.tags === 'string') {
          tags = JSON.parse(link.tags);
        } else if (Array.isArray(link.tags)) {
          tags = link.tags;
        }
      } catch (e) {
        console.warn('解析tags失败，使用默认值:', e.message);
        tags = [];
      }
    }
    
    const product = {
      id: link.product_id,
      name: link.name || '商品',
      description: link.description || '',
      image: link.image || '',
      images: images,
      price: parseFloat(link.price) || 0,
      originalPrice: link.original_price ? parseFloat(link.original_price) : null,
      stock: parseInt(link.stock) || 0,
      sales: parseInt(link.sales) || 0,
      cardPrice: link.card_price ? parseFloat(link.card_price) : null,
      cardStock: parseInt(link.card_stock) || 0,
      tags: tags,
      category: {
        id: link.category_id,
        name: link.category_name || '默认分类'
      }
    };
    
    success(res, {
      product,
      linkCode
    }, '获取引流商品信息成功');
    
  } catch (err) {
    console.error('获取引流商品信息失败:', err);
    error(res, '获取引流商品信息失败', 500, err.message);
  }
}));

/**
 * 创建引流订单
 * POST /api/referral/order
 */
router.post('/order', asyncHandler(async (req, res) => {
  try {
    const { linkCode, partnerOrderNo, notifyUrl } = req.body;
    
    if (!linkCode || !partnerOrderNo || !notifyUrl) {
      return error(res, '参数不完整', 400);
    }
    
    // 验证引流链接
    const links = await query(
      'SELECT * FROM referral_links WHERE link_code = ? AND status = "active"',
      [linkCode]
    );
    
    if (links.length === 0) {
      return error(res, '引流链接不存在或已失效', 404);
    }
    
    const link = links[0];
    
    // 检查是否已存在相同的引流方订单号
    const existingOrders = await query(
      'SELECT * FROM referral_orders WHERE partner_order_no = ?',
      [partnerOrderNo]
    );
    
    if (existingOrders.length > 0) {
      return error(res, '引流方订单号已存在', 400);
    }
    
    // 创建引流订单记录
    await query(
      'INSERT INTO referral_orders (referral_link_id, partner_order_no, notify_url) VALUES (?, ?, ?)',
      [link.id, partnerOrderNo, notifyUrl]
    );
    
    success(res, {
      linkCode,
      partnerOrderNo,
      notifyUrl
    }, '引流订单创建成功');
    
  } catch (err) {
    console.error('创建引流订单失败:', err);
    error(res, '创建引流订单失败', 500, err.message);
  }
}));

module.exports = router;