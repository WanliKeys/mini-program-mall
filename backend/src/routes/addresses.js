const express = require('express');
const router = express.Router();

// 地址相关API将在这里实现
router.get('/', (req, res) => {
  res.json({ message: '地址API开发中...' });
});

module.exports = router;
