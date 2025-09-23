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

// 订单列表（支持筛选/统计/分页）
router.get('/orders', adminAuth, asyncHandler(async (req, res) => {
  const {
    status = '',
    search = '',
    from = '',
    to = '',
    page = 1,
    pageSize = 10
  } = req.query || {};

  const where = [];
  const params = [];
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(o.order_no LIKE ? OR u.username LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (from) {
    where.push('o.created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('o.created_at <= ?');
    params.push(to + ' 23:59:59');
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const limit = parseInt(pageSize, 10) || 10;
  const offset = (parseInt(page, 10) - 1) * limit;

  // 列表，联表 users 获取用户名
  const orders = await query(
    `SELECT o.id,
            o.order_no AS orderNo,
            o.total_amount AS amount,
            o.status,
            o.created_at AS createdAt,
            u.username AS userName
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // 统计
  const [[totalOrders]] = [await query(`SELECT COUNT(*) AS c FROM orders o ${whereSql}`, params)];
  const [[pending]] = [await query(`SELECT COUNT(*) AS c FROM orders o ${whereSql} ${whereSql? 'AND' : 'WHERE'} o.status = 'pending'`, params)];
  const [[completed]] = [await query(`SELECT COUNT(*) AS c FROM orders o ${whereSql} ${whereSql? 'AND' : 'WHERE'} o.status = 'completed'`, params)];
  const [[totalAmount]] = [await query(`SELECT IFNULL(SUM(o.total_amount),0) AS s FROM orders o ${whereSql}`, params)];

  return success(res, {
    orders,
    pagination: {
      page: parseInt(page, 10) || 1,
      pageSize: limit,
      total: totalOrders.c,
      totalPages: Math.ceil(totalOrders.c / limit)
    },
    stats: {
      totalOrders: totalOrders.c,
      pending: pending.c,
      completed: completed.c,
      totalAmount: Number(totalAmount.s)
    }
  }, '获取订单列表成功');
}));

// 订单详情（管理员）
router.get('/orders/:id', adminAuth, asyncHandler(async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      return error(res, '订单ID不合法', 400);
    }

    // 查询订单基本信息
    const orders = await query(
      'SELECT * FROM orders WHERE id = ? LIMIT 1',
      [orderId]
    );
    if (orders.length === 0) {
      return error(res, '订单不存在', 404);
    }
    const order = orders[0];

    // 查询订单商品项
    const items = await query(
      `SELECT oi.id, oi.product_id, oi.product_name, oi.product_image, oi.product_price, oi.quantity, oi.subtotal
       FROM order_items oi
       WHERE oi.order_id = ?`,
      [orderId]
    );

    // 查询收货地址
    let address = null;
    if (order.address_id) {
      const addresses = await query(
        'SELECT * FROM addresses WHERE id = ? LIMIT 1',
        [order.address_id]
      );
      if (addresses.length > 0) {
        address = addresses[0];
      }
    }

    // 组装返回数据
    const orderDetail = {
      id: order.id,
      orderNo: order.order_no,
      userId: order.user_id,
      addressId: order.address_id,
      totalAmount: order.total_amount,
      paymentMethod: order.payment_method,
      status: order.status,
      remark: order.remark,
      externalOrderNo: order.external_order_no,
      source: order.source,
      externalSource: order.external_source,
      paidAt: order.paid_at,
      shippedAt: order.shipped_at,
      completedAt: order.completed_at,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      items: items,
      address: address
    };

    return success(res, orderDetail, '获取订单详情成功');
  } catch (err) {
    console.error('获取订单详情失败:', err);
    return error(res, '获取订单详情失败', 500, err.message);
  }
}));

// 更新订单状态（管理员）
router.put('/orders/:id/status', adminAuth, asyncHandler(async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { status } = req.body;
    
    if (Number.isNaN(orderId)) {
      return error(res, '订单ID不合法', 400);
    }
    
    if (!status) {
      return error(res, '状态不能为空', 400);
    }
    
    const validStatuses = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return error(res, '无效的订单状态', 400);
    }
    
    // 检查订单是否存在
    const orders = await query('SELECT * FROM orders WHERE id = ? LIMIT 1', [orderId]);
    if (orders.length === 0) {
      return error(res, '订单不存在', 404);
    }
    
    // 更新订单状态
    const updateFields = ['status = ?', 'updated_at = NOW()'];
    const updateValues = [status];
    
    // 根据状态设置相应的时间字段
    if (status === 'paid' && !orders[0].paid_at) {
      updateFields.push('paid_at = NOW()');
    } else if (status === 'shipped' && !orders[0].shipped_at) {
      updateFields.push('shipped_at = NOW()');
    } else if (status === 'completed' && !orders[0].completed_at) {
      updateFields.push('completed_at = NOW()');
    }
    
    updateValues.push(orderId);
    
    await query(
      `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    return success(res, null, '订单状态更新成功');
  } catch (err) {
    console.error('更新订单状态失败:', err);
    return error(res, '更新订单状态失败', 500, err.message);
  }
}));

module.exports = router;


