const express = require('express');
const multer = require('multer');
const path = require('path');
const { query } = require('../../config/database');
const { success, error } = require('../../utils/response');
const { asyncHandler } = require('../../middleware/errorHandler');
const { adminAuth } = require('../../middleware/auth');

const router = express.Router();

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/images/categories'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

// 所有接口都需要管理员权限
router.use(adminAuth);

/**
 * 获取分类列表（管理员）
 * GET /api/admin/categories
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { status } = req.query;
    
    let whereClause = '';
    const params = [];
    
    if (status !== undefined) {
      whereClause = 'WHERE status = ?';
      params.push(status);
    }
    
    const categories = await query(`
      SELECT 
        c.*,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.created_at DESC
    `, params);
    
    success(res, categories, '获取分类列表成功');
    
  } catch (err) {
    console.error('获取分类列表失败:', err);
    error(res, '获取分类列表失败', 500, err.message);
  }
}));

/**
 * 获取分类详情（管理员）
 * GET /api/admin/categories/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const categories = await query(`
      SELECT 
        c.*,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      WHERE c.id = ?
      GROUP BY c.id
    `, [id]);
    
    if (categories.length === 0) {
      return error(res, '分类不存在', 404);
    }
    
    success(res, categories[0], '获取分类详情成功');
    
  } catch (err) {
    console.error('获取分类详情失败:', err);
    error(res, '获取分类详情失败', 500, err.message);
  }
}));

/**
 * 创建分类
 * POST /api/admin/categories
 */
router.post('/', upload.single('icon'), asyncHandler(async (req, res) => {
  try {
    const { name, sortOrder = 0, status = 1 } = req.body;
    
    if (!name) {
      return error(res, '分类名称不能为空', 400);
    }
    
    // 检查分类名称是否已存在
    const existingCategories = await query(
      'SELECT id FROM categories WHERE name = ?',
      [name]
    );
    
    if (existingCategories.length > 0) {
      return error(res, '分类名称已存在', 400);
    }
    
    // 处理图标路径
    const icon = req.file ? `/uploads/images/categories/${req.file.filename}` : null;
    
    const result = await query(`
      INSERT INTO categories (name, icon, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `, [name, icon, sortOrder, status]);
    
    const categoryId = result.insertId;
    
    success(res, { id: categoryId }, '创建分类成功');
    
  } catch (err) {
    console.error('创建分类失败:', err);
    error(res, '创建分类失败', 500, err.message);
  }
}));

/**
 * 更新分类
 * PUT /api/admin/categories/:id
 */
router.put('/:id', upload.single('icon'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sortOrder, status } = req.body;
    
    // 检查分类是否存在
    const existingCategories = await query(
      'SELECT * FROM categories WHERE id = ?',
      [id]
    );
    
    if (existingCategories.length === 0) {
      return error(res, '分类不存在', 404);
    }
    
    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    if (name !== undefined) {
      // 检查新名称是否与其他分类冲突
      const conflictCategories = await query(
        'SELECT id FROM categories WHERE name = ? AND id != ?',
        [name, id]
      );
      
      if (conflictCategories.length > 0) {
        return error(res, '分类名称已存在', 400);
      }
      
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    
    if (sortOrder !== undefined) {
      updateFields.push('sort_order = ?');
      updateValues.push(sortOrder);
    }
    
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    
    // 处理图标更新
    if (req.file) {
      updateFields.push('icon = ?');
      updateValues.push(`/uploads/images/categories/${req.file.filename}`);
    }
    
    if (updateFields.length === 0) {
      return error(res, '没有需要更新的字段', 400);
    }
    
    updateFields.push('updated_at = NOW()');
    updateValues.push(id);
    
    await query(`
      UPDATE categories 
      SET ${updateFields.join(', ')} 
      WHERE id = ?
    `, updateValues);
    
    success(res, null, '更新分类成功');
    
  } catch (err) {
    console.error('更新分类失败:', err);
    error(res, '更新分类失败', 500, err.message);
  }
}));

/**
 * 删除分类
 * DELETE /api/admin/categories/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查分类是否存在
    const existingCategories = await query(
      'SELECT * FROM categories WHERE id = ?',
      [id]
    );
    
    if (existingCategories.length === 0) {
      return error(res, '分类不存在', 404);
    }
    
    // 检查是否有商品关联
    const products = await query(
      'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
      [id]
    );
    
    if (products[0].count > 0) {
      return error(res, '该分类下还有商品，无法删除', 400);
    }
    
    // 删除分类
    await query('DELETE FROM categories WHERE id = ?', [id]);
    
    success(res, null, '删除分类成功');
    
  } catch (err) {
    console.error('删除分类失败:', err);
    error(res, '删除分类失败', 500, err.message);
  }
}));

/**
 * 批量更新分类状态
 * PUT /api/admin/categories/batch/status
 */
router.put('/batch/status', asyncHandler(async (req, res) => {
  try {
    const { ids, status } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return error(res, '分类ID列表不能为空', 400);
    }
    
    if (status === undefined) {
      return error(res, '状态不能为空', 400);
    }
    
    const placeholders = ids.map(() => '?').join(',');
    
    await query(`
      UPDATE categories 
      SET status = ?, updated_at = NOW() 
      WHERE id IN (${placeholders})
    `, [status, ...ids]);
    
    success(res, null, '批量更新状态成功');
    
  } catch (err) {
    console.error('批量更新状态失败:', err);
    error(res, '批量更新状态失败', 500, err.message);
  }
}));

/**
 * 更新分类排序
 * PUT /api/admin/categories/sort
 */
router.put('/sort', asyncHandler(async (req, res) => {
  try {
    const { categories } = req.body;
    
    if (!categories || !Array.isArray(categories)) {
      return error(res, '分类排序数据格式错误', 400);
    }
    
    // 批量更新排序
    for (const category of categories) {
      await query(
        'UPDATE categories SET sort_order = ?, updated_at = NOW() WHERE id = ?',
        [category.sortOrder, category.id]
      );
    }
    
    success(res, null, '更新排序成功');
    
  } catch (err) {
    console.error('更新排序失败:', err);
    error(res, '更新排序失败', 500, err.message);
  }
}));

module.exports = router;
