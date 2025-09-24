const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { adminAuth } = require('../../middleware/auth');
const { success, error } = require('../../utils/response');
const { asyncHandler } = require('../../middleware/errorHandler');

// 获取卡密列表
router.get('/', adminAuth, asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 10, price, status, search } = req.query;
  const offset = (page - 1) * pageSize;

  // 构建查询条件
  let whereConditions = [];
  let queryParams = [];

  if (price) {
    whereConditions.push('price = ?');
    queryParams.push(price);
  }

  if (status) {
    whereConditions.push('status = ?');
    queryParams.push(status);
  }

  if (search) {
    whereConditions.push('code LIKE ?');
    queryParams.push(`%${search}%`);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 查询总数
  const countResult = await query(
    `SELECT COUNT(*) as total FROM card_codes ${whereClause}`,
    queryParams
  );
  const total = countResult[0].total;

  // 查询列表数据
  const rows = await query(
    `SELECT * FROM card_codes ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...queryParams, parseInt(pageSize), offset]
  );

  // 统计各价格卡密数量
  const statsResult = await query(`
    SELECT 
      price,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) as unused,
      SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped
    FROM card_codes 
    GROUP BY price 
    ORDER BY price
  `);

  return success(res, {
    list: rows,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total,
      totalPages: Math.ceil(total / pageSize)
    },
    stats: statsResult
  }, '获取卡密列表成功');
}));

// 添加卡密
router.post('/', adminAuth, asyncHandler(async (req, res) => {
  const { code, price } = req.body;

  if (!code || !price) {
    return error(res, '卡密和价格不能为空', 400);
  }

  // 检查卡密是否已存在
  const existing = await query('SELECT id FROM card_codes WHERE code = ?', [code]);
  if (existing.length > 0) {
    return error(res, '卡密已存在', 400);
  }

  const result = await query(
    'INSERT INTO card_codes (code, price) VALUES (?, ?)',
    [code, parseFloat(price)]
  );

  return success(res, { id: result.insertId }, '卡密添加成功');
}));

// 批量添加卡密
router.post('/batch', adminAuth, asyncHandler(async (req, res) => {
  const { codes, price } = req.body;

  if (!codes || !Array.isArray(codes) || codes.length === 0 || !price) {
    return error(res, '卡密列表和价格不能为空', 400);
  }

  // 检查是否有重复的卡密
  const existing = await query(
    'SELECT code FROM card_codes WHERE code IN (?)',
    [codes]
  );

  if (existing.length > 0) {
    const existingCodes = existing.map(row => row.code);
    return error(res, `以下卡密已存在: ${existingCodes.join(', ')}`, 400);
  }

  // 批量插入
  const values = codes.map(code => [code, parseFloat(price)]);
  const result = await query(
    'INSERT INTO card_codes (code, price) VALUES ?',
    [values]
  );

  return success(res, { 
    inserted: result.affectedRows,
    total: codes.length 
  }, `成功添加 ${result.affectedRows} 个卡密`);
}));

// 更新卡密
router.put('/:id', adminAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { code, price, status } = req.body;

  if (!code || !price) {
    return error(res, '卡密和价格不能为空', 400);
  }

  // 检查卡密是否已存在（排除自己）
  const existing = await query(
    'SELECT id FROM card_codes WHERE code = ? AND id != ?',
    [code, id]
  );
  if (existing.length > 0) {
    return error(res, '卡密已存在', 400);
  }

  await query(
    'UPDATE card_codes SET code = ?, price = ?, status = ? WHERE id = ?',
    [code, parseFloat(price), status || 'unused', id]
  );

  return success(res, null, '卡密更新成功');
}));

// 批量删除卡密（必须在单个删除之前定义）
router.delete('/batch', adminAuth, asyncHandler(async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return error(res, '请选择要删除的卡密', 400);
  }

  // 检查是否有卡密已被使用
  const placeholders = ids.map(() => '?').join(',');
  const used = await query(
    `SELECT card_code_id FROM orders WHERE card_code_id IN (${placeholders})`,
    ids
  );

  if (used.length > 0) {
    return error(res, '部分卡密已被使用，无法删除', 400);
  }

  const result = await query(
    `DELETE FROM card_codes WHERE id IN (${placeholders})`,
    ids
  );

  return success(res, { 
    deleted: result.affectedRows,
    total: ids.length 
  }, `成功删除 ${result.affectedRows} 个卡密`);
}));

// 删除单个卡密
router.delete('/:id', adminAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 检查卡密是否已被使用
  const used = await query(
    'SELECT id FROM orders WHERE card_code_id = ?',
    [id]
  );

  if (used.length > 0) {
    return error(res, '该卡密已被使用，无法删除', 400);
  }

  await query('DELETE FROM card_codes WHERE id = ?', [id]);

  return success(res, null, '卡密删除成功');
}));

// 获取卡密统计
router.get('/stats', adminAuth, asyncHandler(async (req, res) => {
  const stats = await query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) as unused,
      SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped,
      COUNT(DISTINCT price) as price_types
    FROM card_codes
  `);

  const priceStats = await query(`
    SELECT 
      price,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) as unused,
      SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped
    FROM card_codes 
    GROUP BY price 
    ORDER BY price
  `);

  return success(res, {
    overview: stats[0],
    priceStats
  }, '获取卡密统计成功');
}));

module.exports = router;