const express = require('express');
const router = express.Router();

// 支付相关API将在这里实现
router.get('/', (req, res) => {
  res.json({ message: '支付API开发中...' });
});

module.exports = router;
