const express = require('express');
const { query } = require('../config/database');
const { success, error } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * 获取分类列表
 * GET /api/categories
 */
router.get('/', asyncHandler(async (req, res) => {
  const categories = await query(`
    SELECT 
      c.id, c.name, c.icon, c.sort_order,
      COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.status = 1
    WHERE c.status = 1
    GROUP BY c.id, c.name, c.icon, c.sort_order
    ORDER BY c.sort_order ASC, c.created_at DESC
  `);

  success(res, categories, '获取分类列表成功');
}));

/**
 * 获取分类详情
 * GET /api/categories/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const categories = await query(`
    SELECT 
      c.*,
      COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.status = 1
    WHERE c.id = ? AND c.status = 1
    GROUP BY c.id
  `, [id]);

  if (categories.length === 0) {
    return error(res, '分类不存在', 404);
  }

  success(res, categories[0], '获取分类详情成功');
}));

module.exports = router;
