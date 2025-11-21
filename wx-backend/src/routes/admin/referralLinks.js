const express = require('express');
const router = express.Router();
const { success, error } = require('../../utils/response');
const { asyncHandler } = require('../../middleware/errorHandler');
const { adminAuth } = require('../../middleware/auth');
const { query } = require('../../config/database');

/**
 * 生成引流链接
 * POST /api/admin/referral-links
 */
router.post('/', adminAuth, asyncHandler(async (req, res) => {
  try {
    const { productId } = req.body;
    
    if (!productId) {
      return error(res, '商品ID不能为空', 400);
    }
    
    // 检查商品是否存在
    const products = await query('SELECT * FROM products WHERE id = ?', [productId]);
    if (products.length === 0) {
      return error(res, '商品不存在', 404);
    }
    
    const product = products[0];
    
    // 生成唯一链接码
    const linkCode = 'REF' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
    
    // 保存到数据库
    await query(
      'INSERT INTO referral_links (product_id, link_code) VALUES (?, ?)',
      [productId, linkCode]
    );

    const landingBase = process.env.REFERRAL_LANDING_URL || 'https://jxxcfwlkj.cn/referral-jump.html';
    const publicApiBase = process.env.PUBLIC_API_BASE || process.env.API_BASE_URL || 'https://jxxcfwlkj.cn/api';
    const baseUrl = `${landingBase}?productId=${productId}&linkCode=${linkCode}`;
    const template = `${baseUrl}&partnerOrderNo={引流方订单号}&notifyUrl={通知地址(需URL编码)}&externalOrderNo={可选外部订单号}`;
    
    success(res, {
      linkCode,
      baseUrl,
      template,
      productName: product.name,
      price: product.price,
      landingBase,
      signedLinkApi: `${publicApiBase.replace(/\/$/, '')}/referral/signed-link`
    }, '引流链接生成成功');
    
  } catch (err) {
    console.error('生成引流链接失败:', err);
    error(res, '生成引流链接失败', 500, err.message);
  }
}));

/**
 * 获取商品的引流链接列表
 * GET /api/admin/referral-links/product/:productId
 */
router.get('/product/:productId', adminAuth, asyncHandler(async (req, res) => {
  try {
    const productId = req.params.productId;
    
    const links = await query(
      `SELECT rl.*, p.name as product_name, p.price,
       COUNT(ro.id) as order_count
       FROM referral_links rl
       JOIN products p ON rl.product_id = p.id
       LEFT JOIN referral_orders ro ON rl.id = ro.referral_link_id
       WHERE rl.product_id = ?
       GROUP BY rl.id
       ORDER BY rl.created_at DESC`,
      [productId]
    );
    
    success(res, links, '获取引流链接列表成功');
    
  } catch (err) {
    console.error('获取引流链接列表失败:', err);
    error(res, '获取引流链接列表失败', 500, err.message);
  }
}));

/**
 * 更新引流链接状态
 * PUT /api/admin/referral-links/:id/status
 */
router.put('/:id/status', adminAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'inactive'].includes(status)) {
      return error(res, '状态值无效', 400);
    }
    
    await query(
      'UPDATE referral_links SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
    
    success(res, null, '状态更新成功');
    
  } catch (err) {
    console.error('更新引流链接状态失败:', err);
    error(res, '更新引流链接状态失败', 500, err.message);
  }
}));

/**
 * 删除引流链接
 * DELETE /api/admin/referral-links/:id
 */
router.delete('/:id', adminAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查是否有关联的订单
    const orders = await query(
      'SELECT COUNT(*) as count FROM referral_orders WHERE referral_link_id = ?',
      [id]
    );
    
    if (orders[0].count > 0) {
      return error(res, '该链接已有订单记录，无法删除', 400);
    }
    
    await query('DELETE FROM referral_links WHERE id = ?', [id]);
    
    success(res, null, '引流链接删除成功');
    
  } catch (err) {
    console.error('删除引流链接失败:', err);
    error(res, '删除引流链接失败', 500, err.message);
  }
}));

module.exports = router;
