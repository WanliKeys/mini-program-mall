const express = require('express');
const { query } = require('../../config/database');
const { success, error } = require('../../utils/response');
const { asyncHandler } = require('../../middleware/errorHandler');
const { adminAuth } = require('../../middleware/auth');

const router = express.Router();

// 管理员登录（简单用户名密码，需配合 users 表）
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return error(res, '用户名和密码不能为空', 400);
  const users = await query('SELECT id, username, role FROM users WHERE username = ? AND password = ?', [username, password]);
  if (users.length === 0) return error(res, '用户名或密码错误', 401);
  if (users[0].role !== 'admin') return error(res, '权限不足，需要管理员权限', 403);
  const { generateToken } = require('../../utils/jwt');
  const token = generateToken({ userId: users[0].id });
  return success(res, { token, user: users[0] }, '登录成功');
}));

// 仪表盘统计
router.get('/dashboard', adminAuth, asyncHandler(async (req, res) => {
  const [productCount] = await query('SELECT COUNT(*) as c FROM products');
  const [orderCount] = await query('SELECT COUNT(*) as c FROM orders');
  const [categoryCount] = await query('SELECT COUNT(*) as c FROM categories');
  const [bannerCount] = await query('SELECT COUNT(*) as c FROM banners');
  const recentOrders = await query('SELECT id, order_no as orderNo, total_amount as amount, status, created_at as createdAt FROM orders ORDER BY created_at DESC LIMIT 5');
  return success(res, {
    totalProducts: productCount.c,
    totalOrders: orderCount.c,
    totalCategories: categoryCount.c,
    totalBanners: bannerCount.c,
    recentOrders
  }, '获取仪表盘数据成功');
}));

// 个人信息
router.get('/profile', adminAuth, asyncHandler(async (req, res) => {
  const users = await query('SELECT id, username, role, nickname FROM users WHERE id = ?', [req.user.id]);
  if (users.length === 0) return error(res, '用户不存在', 404);
  return success(res, users[0], '获取个人信息成功');
}));

router.put('/profile', adminAuth, asyncHandler(async (req, res) => {
  const { nickname } = req.body || {};
  await query('UPDATE users SET nickname = ?, updated_at = NOW() WHERE id = ?', [nickname, req.user.id]);
  return success(res, null, '保存成功');
}));

router.post('/change-password', adminAuth, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const users = await query('SELECT password FROM users WHERE id = ?', [req.user.id]);
  if (users.length === 0) return error(res, '用户不存在', 404);
  if (users[0].password !== oldPassword) return error(res, '当前密码不正确', 400);
  await query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [newPassword, req.user.id]);
  return success(res, null, '密码已更新');
}));

// 订单列表（简化）
router.get('/orders', adminAuth, asyncHandler(async (req, res) => {
  const orders = await query('SELECT id, order_no as orderNo, total_amount as amount, status, created_at as createdAt FROM orders ORDER BY created_at DESC LIMIT 50');
  return success(res, orders, '获取订单列表成功');
}));

module.exports = router;


