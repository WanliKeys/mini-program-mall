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
    cb(null, path.join(__dirname, '../../uploads/images/banners'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
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
 * 获取轮播图列表（管理员）
 * GET /api/admin/banners
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
    
    const banners = await query(`
      SELECT * FROM banners 
      ${whereClause}
      ORDER BY sort_order ASC, created_at DESC
    `, params);
    
    success(res, banners, '获取轮播图列表成功');
    
  } catch (err) {
    console.error('获取轮播图列表失败:', err);
    error(res, '获取轮播图列表失败', 500, err.message);
  }
}));

/**
 * 获取轮播图详情（管理员）
 * GET /api/admin/banners/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const banners = await query(
      'SELECT * FROM banners WHERE id = ?',
      [id]
    );
    
    if (banners.length === 0) {
      return error(res, '轮播图不存在', 404);
    }
    
    success(res, banners[0], '获取轮播图详情成功');
    
  } catch (err) {
    console.error('获取轮播图详情失败:', err);
    error(res, '获取轮播图详情失败', 500, err.message);
  }
}));

/**
 * 创建轮播图
 * POST /api/admin/banners
 */
router.post('/', upload.single('image'), asyncHandler(async (req, res) => {
  try {
    const {
      title,
      link,
      sortOrder = 0,
      status = 1
    } = req.body;
    
    if (!title) {
      return error(res, '轮播图标题不能为空', 400);
    }
    
    if (!req.file) {
      return error(res, '请上传轮播图图片', 400);
    }
    
    const image = `/uploads/images/banners/${req.file.filename}`;
    
    const result = await query(`
      INSERT INTO banners (title, image, link, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    `, [title, image, link, sortOrder, status]);
    
    const bannerId = result.insertId;
    
    success(res, { id: bannerId }, '创建轮播图成功');
    
  } catch (err) {
    console.error('创建轮播图失败:', err);
    error(res, '创建轮播图失败', 500, err.message);
  }
}));

/**
 * 更新轮播图
 * PUT /api/admin/banners/:id
 */
router.put('/:id', upload.single('image'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { title, link, sortOrder, status } = req.body;
    
    // 检查轮播图是否存在
    const existingBanners = await query(
      'SELECT * FROM banners WHERE id = ?',
      [id]
    );
    
    if (existingBanners.length === 0) {
      return error(res, '轮播图不存在', 404);
    }
    
    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    
    if (link !== undefined) {
      updateFields.push('link = ?');
      updateValues.push(link);
    }
    
    if (sortOrder !== undefined) {
      updateFields.push('sort_order = ?');
      updateValues.push(sortOrder);
    }
    
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    
    // 处理图片更新
    if (req.file) {
      updateFields.push('image = ?');
      updateValues.push(`/uploads/images/banners/${req.file.filename}`);
    }
    
    if (updateFields.length === 0) {
      return error(res, '没有需要更新的字段', 400);
    }
    
    updateFields.push('updated_at = NOW()');
    updateValues.push(id);
    
    await query(`
      UPDATE banners 
      SET ${updateFields.join(', ')} 
      WHERE id = ?
    `, updateValues);
    
    success(res, null, '更新轮播图成功');
    
  } catch (err) {
    console.error('更新轮播图失败:', err);
    error(res, '更新轮播图失败', 500, err.message);
  }
}));

/**
 * 删除轮播图
 * DELETE /api/admin/banners/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查轮播图是否存在
    const existingBanners = await query(
      'SELECT * FROM banners WHERE id = ?',
      [id]
    );
    
    if (existingBanners.length === 0) {
      return error(res, '轮播图不存在', 404);
    }
    
    // 删除轮播图
    await query('DELETE FROM banners WHERE id = ?', [id]);
    
    success(res, null, '删除轮播图成功');
    
  } catch (err) {
    console.error('删除轮播图失败:', err);
    error(res, '删除轮播图失败', 500, err.message);
  }
}));

/**
 * 批量更新轮播图状态
 * PUT /api/admin/banners/batch/status
 */
router.put('/batch/status', asyncHandler(async (req, res) => {
  try {
    const { ids, status } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return error(res, '轮播图ID列表不能为空', 400);
    }
    
    if (status === undefined) {
      return error(res, '状态不能为空', 400);
    }
    
    const placeholders = ids.map(() => '?').join(',');
    
    await query(`
      UPDATE banners 
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
 * 更新轮播图排序
 * PUT /api/admin/banners/sort
 */
router.put('/sort', asyncHandler(async (req, res) => {
  try {
    const { banners } = req.body;
    
    if (!banners || !Array.isArray(banners)) {
      return error(res, '轮播图排序数据格式错误', 400);
    }
    
    // 批量更新排序
    for (const banner of banners) {
      await query(
        'UPDATE banners SET sort_order = ?, updated_at = NOW() WHERE id = ?',
        [banner.sortOrder, banner.id]
      );
    }
    
    success(res, null, '更新排序成功');
    
  } catch (err) {
    console.error('更新排序失败:', err);
    error(res, '更新排序失败', 500, err.message);
  }
}));

module.exports = router;
