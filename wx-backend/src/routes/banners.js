const express = require('express');
const router = express.Router();
const { success, error } = require('../utils/response');
const { query } = require('../config/database');

// 获取轮播图列表
router.get('/', async (req, res) => {
  try {
    // 从数据库获取轮播图数据
    const banners = await query(
      'SELECT * FROM banners WHERE status = 1 ORDER BY sort_order ASC, created_at DESC'
    );

    success(res, banners, '获取轮播图成功');
  } catch (err) {
    console.error('获取轮播图失败:', err);
    error(res, '获取轮播图失败', 500, err.message);
  }
});

module.exports = router;
