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
    cb(null, path.join(__dirname, '../../uploads/images/products'));
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
 * 获取商品列表（管理员）
 * GET /api/admin/products
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize = 10, 
      categoryId, 
      status, 
      keyword 
    } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (categoryId) {
      whereClause += ' AND p.category_id = ?';
      params.push(categoryId);
    }
    
    if (status !== undefined) {
      whereClause += ' AND p.status = ?';
      params.push(status);
    }
    
    if (keyword) {
      whereClause += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    
    const offset = (page - 1) * pageSize;
    
    const products = await query(`
      SELECT 
        p.*,
        c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);
    
    const countResult = await query(`
      SELECT COUNT(*) as total 
      FROM products p 
      ${whereClause}
    `, params);
    
    const total = countResult[0].total;
    
    // 处理JSON字段
    const processedProducts = products.map(product => {
      let images = [];
      let tags = [];
      
      if (product.images) {
        try {
          images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
        } catch (e) {
          images = [];
        }
      }
      
      if (product.tags) {
        try {
          tags = typeof product.tags === 'string' ? JSON.parse(product.tags) : product.tags;
        } catch (e) {
          tags = [];
        }
      }
      
      return {
        ...product,
        images,
        tags
      };
    });
    
    success(res, {
      products: processedProducts,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    }, '获取商品列表成功');
    
  } catch (err) {
    console.error('获取商品列表失败:', err);
    error(res, '获取商品列表失败', 500, err.message);
  }
}));

/**
 * 获取商品详情（管理员）
 * GET /api/admin/products/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const products = await query(`
      SELECT 
        p.*,
        c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `, [id]);
    
    if (products.length === 0) {
      return error(res, '商品不存在', 404);
    }
    
    const product = products[0];
    
    // 处理JSON字段
    let images = [];
    let tags = [];
    
    if (product.images) {
      try {
        images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
      } catch (e) {
        images = [];
      }
    }
    
    if (product.tags) {
      try {
        tags = typeof product.tags === 'string' ? JSON.parse(product.tags) : product.tags;
      } catch (e) {
        tags = [];
      }
    }
    
    const processedProduct = {
      ...product,
      images,
      tags
    };
    
    success(res, processedProduct, '获取商品详情成功');
    
  } catch (err) {
    console.error('获取商品详情失败:', err);
    error(res, '获取商品详情失败', 500, err.message);
  }
}));

/**
 * 创建商品
 * POST /api/admin/products
 */
router.post('/', upload.single('image'), asyncHandler(async (req, res) => {
  try {
    const {
      categoryId,
      name,
      description,
      price,
      originalPrice,
      stock,
      status = 1,
      tags
    } = req.body;
    
    // 验证必填字段
    if (!categoryId || !name || !price) {
      return error(res, '分类ID、商品名称和价格不能为空', 400);
    }
    
    // 处理图片路径
    const image = req.file ? `/uploads/images/products/${req.file.filename}` : null;
    
    // 处理标签
    let tagsArray = [];
    if (tags) {
      try {
        tagsArray = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        tagsArray = [];
      }
    }
    
    const result = await query(`
      INSERT INTO products (
        category_id, name, description, image, price, original_price, 
        stock, status, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      categoryId, name, description, image, price, originalPrice,
      stock || 0, status, JSON.stringify(tagsArray)
    ]);
    
    const productId = result.insertId;
    
    success(res, { id: productId }, '创建商品成功');
    
  } catch (err) {
    console.error('创建商品失败:', err);
    error(res, '创建商品失败', 500, err.message);
  }
}));

/**
 * 更新商品
 * PUT /api/admin/products/:id
 */
router.put('/:id', upload.single('image'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      categoryId,
      name,
      description,
      price,
      originalPrice,
      stock,
      status,
      tags
    } = req.body;
    
    // 检查商品是否存在
    const existingProducts = await query(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );
    
    if (existingProducts.length === 0) {
      return error(res, '商品不存在', 404);
    }
    
    const existingProduct = existingProducts[0];
    
    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    if (categoryId !== undefined) {
      updateFields.push('category_id = ?');
      updateValues.push(categoryId);
    }
    
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    
    if (price !== undefined) {
      updateFields.push('price = ?');
      updateValues.push(price);
    }
    
    if (originalPrice !== undefined) {
      updateFields.push('original_price = ?');
      updateValues.push(originalPrice);
    }
    
    if (stock !== undefined) {
      updateFields.push('stock = ?');
      updateValues.push(stock);
    }
    
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    
    if (tags !== undefined) {
      let tagsArray = [];
      try {
        tagsArray = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        tagsArray = [];
      }
      updateFields.push('tags = ?');
      updateValues.push(JSON.stringify(tagsArray));
    }
    
    // 处理图片更新
    if (req.file) {
      updateFields.push('image = ?');
      updateValues.push(`/uploads/images/products/${req.file.filename}`);
    }
    
    if (updateFields.length === 0) {
      return error(res, '没有需要更新的字段', 400);
    }
    
    updateFields.push('updated_at = NOW()');
    updateValues.push(id);
    
    await query(`
      UPDATE products 
      SET ${updateFields.join(', ')} 
      WHERE id = ?
    `, updateValues);
    
    success(res, null, '更新商品成功');
    
  } catch (err) {
    console.error('更新商品失败:', err);
    error(res, '更新商品失败', 500, err.message);
  }
}));

/**
 * 删除商品
 * DELETE /api/admin/products/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查商品是否存在
    const existingProducts = await query(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );
    
    if (existingProducts.length === 0) {
      return error(res, '商品不存在', 404);
    }
    
    // 检查是否有订单关联
    const orderItems = await query(
      'SELECT COUNT(*) as count FROM order_items WHERE product_id = ?',
      [id]
    );
    
    if (orderItems[0].count > 0) {
      return error(res, '该商品已有订单记录，无法删除', 400);
    }
    
    // 删除商品
    await query('DELETE FROM products WHERE id = ?', [id]);
    
    success(res, null, '删除商品成功');
    
  } catch (err) {
    console.error('删除商品失败:', err);
    error(res, '删除商品失败', 500, err.message);
  }
}));

/**
 * 批量更新商品状态
 * PUT /api/admin/products/batch/status
 */
router.put('/batch/status', asyncHandler(async (req, res) => {
  try {
    const { ids, status } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return error(res, '商品ID列表不能为空', 400);
    }
    
    if (status === undefined) {
      return error(res, '状态不能为空', 400);
    }
    
    const placeholders = ids.map(() => '?').join(',');
    
    await query(`
      UPDATE products 
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
 * 上传商品图片
 * POST /api/admin/products/upload-image
 */
router.post('/upload-image', upload.single('image'), asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return error(res, '请选择要上传的图片', 400);
    }
    
    const imageUrl = `/uploads/images/products/${req.file.filename}`;
    
    success(res, { imageUrl }, '图片上传成功');
    
  } catch (err) {
    console.error('图片上传失败:', err);
    error(res, '图片上传失败', 500, err.message);
  }
}));

module.exports = router;
