const express = require('express');
const { query } = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * 获取商品列表
 * GET /api/products
 */
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    pageSize = 10, 
    categoryId, 
    keyword, 
    minPrice, 
    maxPrice,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = req.query;

  let whereConditions = ['p.status = 1'];
  let queryParams = [];

  // 分类筛选
  if (categoryId) {
    whereConditions.push('p.category_id = ?');
    queryParams.push(categoryId);
  }

  // 关键词搜索
  if (keyword) {
    whereConditions.push('(p.name LIKE ? OR p.description LIKE ?)');
    const keywordPattern = `%${keyword}%`;
    queryParams.push(keywordPattern, keywordPattern);
  }

  // 价格范围
  if (minPrice) {
    whereConditions.push('p.price >= ?');
    queryParams.push(parseFloat(minPrice));
  }
  if (maxPrice) {
    whereConditions.push('p.price <= ?');
    queryParams.push(parseFloat(maxPrice));
  }

  const whereClause = whereConditions.join(' AND ');
  
  // 验证排序字段
  const allowedSortFields = ['created_at', 'price', 'sales', 'name'];
  const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // 查询总数
  const totalResult = await query(
    `SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`,
    queryParams
  );
  const total = totalResult[0].total;

  // 查询分页数据
  const offset = (page - 1) * pageSize;
  const products = await query(`
    SELECT 
      p.id, p.name, p.description, p.image, p.images, 
      p.price, p.original_price, p.stock, p.sales, p.tags,
      c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE ${whereClause}
    ORDER BY p.${sortField} ${order}
    LIMIT ${parseInt(pageSize)} OFFSET ${offset}
  `, queryParams);

  // 处理JSON字段
  const processedProducts = products.map(product => {
    let images = [];
    let tags = [];
    
    // 处理images字段
    if (product.images) {
      if (typeof product.images === 'string') {
        try {
          images = JSON.parse(product.images);
        } catch (e) {
          console.warn('Failed to parse images JSON:', product.images);
          images = [];
        }
      } else if (Array.isArray(product.images)) {
        images = product.images;
      }
    }
    
    // 处理tags字段
    if (product.tags) {
      if (typeof product.tags === 'string') {
        try {
          tags = JSON.parse(product.tags);
        } catch (e) {
          console.warn('Failed to parse tags JSON:', product.tags);
          tags = [];
        }
      } else if (Array.isArray(product.tags)) {
        tags = product.tags;
      }
    }
    
    return {
      ...product,
      images,
      tags,
      price: parseFloat(product.price),
      original_price: product.original_price ? parseFloat(product.original_price) : null
    };
  });

  paginate(res, processedProducts, total, page, pageSize, '获取商品列表成功');
}));

/**
 * 获取商品详情
 * GET /api/products/:id
 */
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const products = await query(`
    SELECT 
      p.*, 
      c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ? AND p.status = 1
  `, [id]);

  if (products.length === 0) {
    return error(res, '商品不存在或已下架', 404);
  }

  const product = products[0];
  
  // 安全处理JSON字段
  let images = [];
  let tags = [];
  
  // 处理images字段
  if (product.images) {
    if (typeof product.images === 'string') {
      try {
        images = JSON.parse(product.images);
      } catch (e) {
        console.warn('Failed to parse images JSON for product', product.id, ':', product.images);
        images = [];
      }
    } else if (Array.isArray(product.images)) {
      images = product.images;
    }
  }
  
  // 处理tags字段
  if (product.tags) {
    if (typeof product.tags === 'string') {
      try {
        tags = JSON.parse(product.tags);
      } catch (e) {
        console.warn('Failed to parse tags JSON for product', product.id, ':', product.tags);
        tags = [];
      }
    } else if (Array.isArray(product.tags)) {
      tags = product.tags;
    }
  }
  
  const processedProduct = {
    ...product,
    images,
    tags
  };

  success(res, processedProduct, '获取商品详情成功');
}));

/**
 * 获取推荐商品
 * GET /api/products/recommend
 */
router.get('/recommend', optionalAuth, asyncHandler(async (req, res) => {
  const { limit = 6 } = req.query;

  const products = await query(`
    SELECT 
      p.id, p.name, p.image, p.price, p.original_price, p.sales
    FROM products p
    WHERE p.status = 1
    ORDER BY p.sales DESC, p.created_at DESC
    LIMIT ?
  `, [parseInt(limit)]);

  success(res, products, '获取推荐商品成功');
}));

/**
 * 搜索商品
 * GET /api/products/search
 */
router.get('/search', optionalAuth, asyncHandler(async (req, res) => {
  const { keyword, limit = 20 } = req.query;

  if (!keyword || keyword.trim() === '') {
    return success(res, [], '搜索结果为空');
  }

  const keywordPattern = `%${keyword.trim()}%`;
  
  const products = await query(`
    SELECT 
      p.id, p.name, p.description, p.image, p.price, p.sales,
      c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.status = 1 
      AND (p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)
    ORDER BY p.sales DESC, p.created_at DESC
    LIMIT ?
  `, [keywordPattern, keywordPattern, keywordPattern, parseInt(limit)]);

  success(res, products, '搜索商品成功');
}));

module.exports = router;
