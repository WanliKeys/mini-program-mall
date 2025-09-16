const express = require('express');
const router = express.Router();

// 订单相关API将在这里实现
router.get('/', (req, res) => {
  res.json({ message: '订单API开发中...' });
});

module.exports = router;
