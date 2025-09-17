const express = require('express');
const router = express.Router();
const { success, error } = require('../utils/response');

// 获取轮播图列表
router.get('/', async (req, res) => {
  try {
    // 模拟轮播图数据
    const banners = [
      {
        id: 1,
        title: 'iPhone 15 Pro Max 新品上市',
        image: '/uploads/images/banners/iphone-banner.jpg',
        link: '/pages/product/detail/detail?id=1',
        sort: 1,
        isActive: true
      },
      {
        id: 2,
        title: 'MacBook Pro 限时优惠',
        image: '/uploads/images/banners/macbook-banner.jpg',
        link: '/pages/product/detail/detail?id=2',
        sort: 2,
        isActive: true
      },
      {
        id: 3,
        title: '秋季新品大促销',
        image: '/uploads/images/banners/sale-banner.jpg',
        link: '/pages/category/category?categoryId=2',
        sort: 3,
        isActive: true
      }
    ];

    success(res, banners, '获取轮播图成功');
  } catch (err) {
    console.error('获取轮播图失败:', err);
    error(res, '获取轮播图失败', 500, err.message);
  }
});

module.exports = router;
