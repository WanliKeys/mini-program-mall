const express = require('express');
const multer = require('multer');
const path = require('path');
const { query } = require('../../config/database');
const { success, error } = require('../../utils/response');
const { asyncHandler } = require('../../middleware/errorHandler');
const { adminAuth } = require('../../middleware/auth');
const { getCardAvailableStock } = require('../../utils/inventory');

const router = express.Router();

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../../uploads/images/products'));
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

// 所有接口都需要管理员权限（支持开发环境跳过）
router.use((req, res, next) => {
  if (process.env.SKIP_ADMIN_AUTH === '1' || process.env.SKIP_ADMIN_AUTH === 'true') {
    return next();
  }
  return adminAuth(req, res, next);
});

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

    const pageNum = Number.parseInt(page, 10) || 1;
    const pageSizeNum = Number.parseInt(pageSize, 10) || 10;
    const offset = (pageNum - 1) * pageSizeNum;

    const whereConditions = ['1=1'];
    const mysql2 = require('mysql2');

    if (categoryId !== undefined && String(categoryId).trim() !== '') {
      whereConditions.push(`p.category_id = ${mysql2.escape(Number.parseInt(categoryId, 10))}`);
    }

    if (status !== undefined && String(status).trim() !== '') {
      whereConditions.push(`p.status = ${mysql2.escape(Number.parseInt(status, 10))}`);
    }

    if (keyword !== undefined && String(keyword).trim() !== '') {
      const kw = `%${String(keyword).trim()}%`;
      const esc = mysql2.escape(kw);
      whereConditions.push(`(p.name LIKE ${esc} OR p.description LIKE ${esc})`);
    }

    const whereClause = whereConditions.join(' AND ');

    const listSql = `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ${offset}, ${pageSizeNum}
    `;
    console.log('[AdminProducts] where ->', whereClause);
    const products = await query(listSql);
    
    // 批量计算卡密可售库存
    const productIds = products.map(p => p.id);
    const cardAvailableStockMap = await getCardAvailableStock(productIds);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM products p
      WHERE ${whereClause}
    `;
    const countResult = await query(countSql);
    const total = countResult[0]?.total || 0;

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
        tags,
        card_available_stock: cardAvailableStockMap[product.id] || 0
      };
    });

    success(res, {
      products: processedProducts,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum)
      }
    }, '获取商品列表成功');

  } catch (err) {
    console.error('获取商品列表失败:', err && err.stack ? err.stack : err);
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
router.post('/', asyncHandler(async (req, res) => {
  try {
    const {
      categoryId,
      name,
      description,
      price,
      originalPrice,
      stock,
      status = 1,
      tags,
      image: imageFromBody
    } = req.body;
    console.log('[admin.products.create] received body:', {
      categoryId,
      name,
      description,
      price,
      originalPrice,
      stock,
      status,
      tags,
      imageFromBody
    });
    
    // 验证必填字段
    if (!categoryId || !name || !price) {
      return error(res, '分类ID、商品名称和价格不能为空', 400);
    }
    
    // 处理图片路径：优先使用上传文件，其次使用请求体中的 image 字段
    const image = req.file
      ? `/uploads/images/products/${req.file.filename}`
      : (imageFromBody || null);
    
    // 处理标签
    let tagsArray = [];
    if (tags) {
      try {
        tagsArray = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        tagsArray = [];
      }
    }
    
    const insertSql = `
      INSERT INTO products (
        category_id, name, description, image, images, price, original_price,
        stock, status, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const insertValues = [
      categoryId,
      name,
      description,
      image,
      image ? JSON.stringify([image]) : JSON.stringify([]),
      price,
      originalPrice,
      stock || 0,
      status,
      JSON.stringify(tagsArray)
    ];
    console.log('[admin.products.create] insert image:', image);
    const result = await query(insertSql, insertValues);
    
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
router.put('/:id', asyncHandler(async (req, res) => {
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
      tags,
      image
    } = req.body;
    console.log('[admin.products.update] id:', id, 'body.image:', image);
    
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
    
    // 处理图片更新（仅接收JSON中的image，由独立上传接口负责存储文件）
    if (image) {
      // 通过JSON请求体更新图片
      updateFields.push('image = ?');
      updateValues.push(image);
      
      // 同时更新images字段
      updateFields.push('images = ?');
      updateValues.push(JSON.stringify([image]));
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
