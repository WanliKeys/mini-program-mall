const express = require('express');
const router = express.Router();

// 文件上传API将在这里实现
router.get('/', (req, res) => {
  res.json({ message: '文件上传API开发中...' });
});

module.exports = router;
