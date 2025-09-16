const express = require('express');
const { query, beginTransaction, commit, rollback } = require('../config/database');
const { success, error } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * 获取购物车列表
 * GET /api/cart
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const cartItems = await query(`
    SELECT 
      c.id, c.quantity, c.created_at,
      p.id as product_id, p.name as product_name, p.description as product_description,
      p.image as product_image, p.price as product_price, p.stock as product_stock
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ? AND p.status = 1
    ORDER BY c.created_at DESC
  `, [req.user.id]);

  // 格式化数据结构
  const formattedItems = cartItems.map(item => ({
    id: item.id,
    quantity: item.quantity,
    created_at: item.created_at,
    product: {
      id: item.product_id,
      name: item.product_name,
      description: item.product_description,
      image: item.product_image,
      price: item.product_price,
      stock: item.product_stock
    }
  }));

  success(res, formattedItems, '获取购物车成功');
}));

/**
 * 添加商品到购物车
 * POST /api/cart
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  if (!productId) {
    return error(res, '商品ID不能为空', 400);
  }

  if (quantity <= 0) {
    return error(res, '数量必须大于0', 400);
  }

  // 检查商品是否存在且上架
  const products = await query(
    'SELECT id, name, price, stock FROM products WHERE id = ? AND status = 1',
    [productId]
  );

  if (products.length === 0) {
    return error(res, '商品不存在或已下架', 404);
  }

  const product = products[0];

  if (quantity > product.stock) {
    return error(res, '库存不足', 400);
  }

  const connection = await beginTransaction();

  try {
    // 检查购物车中是否已有该商品
    const existingItems = await connection.execute(
      'SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ?',
      [req.user.id, productId]
    );

    if (existingItems[0].length > 0) {
      // 更新数量
      const newQuantity = existingItems[0][0].quantity + quantity;
      
      if (newQuantity > product.stock) {
        await rollback(connection);
        return error(res, '库存不足', 400);
      }

      await connection.execute(
        'UPDATE cart SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newQuantity, existingItems[0][0].id]
      );
    } else {
      // 添加新商品
      await connection.execute(
        'INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)',
        [req.user.id, productId, quantity]
      );
    }

    await commit(connection);

    success(res, null, '添加到购物车成功');
  } catch (err) {
    await rollback(connection);
    throw err;
  }
}));

/**
 * 更新购物车商品数量
 * PUT /api/cart/:id
 */
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  if (!quantity || quantity <= 0) {
    return error(res, '数量必须大于0', 400);
  }

  // 检查购物车项是否属于当前用户
  const cartItems = await query(`
    SELECT c.id, c.product_id, p.stock
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.id = ? AND c.user_id = ? AND p.status = 1
  `, [id, req.user.id]);

  if (cartItems.length === 0) {
    return error(res, '购物车项不存在', 404);
  }

  const cartItem = cartItems[0];

  if (quantity > cartItem.stock) {
    return error(res, '库存不足', 400);
  }

  await query(
    'UPDATE cart SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [quantity, id]
  );

  success(res, null, '更新购物车成功');
}));

/**
 * 删除购物车商品
 * DELETE /api/cart/:id
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'DELETE FROM cart WHERE id = ? AND user_id = ?',
    [id, req.user.id]
  );

  if (result.affectedRows === 0) {
    return error(res, '购物车项不存在', 404);
  }

  success(res, null, '删除购物车商品成功');
}));

/**
 * 清空购物车
 * DELETE /api/cart
 */
router.delete('/', authenticate, asyncHandler(async (req, res) => {
  await query('DELETE FROM cart WHERE user_id = ?', [req.user.id]);

  success(res, null, '清空购物车成功');
}));

/**
 * 获取购物车商品数量
 * GET /api/cart/count
 */
router.get('/count', authenticate, asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT COALESCE(SUM(c.quantity), 0) as count
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ? AND p.status = 1
  `, [req.user.id]);

  const count = result[0].count;

  success(res, { count }, '获取购物车数量成功');
}));

module.exports = router;
