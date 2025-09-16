const express = require('express');
const router = express.Router();

// 引流追踪API将在这里实现
router.get('/', (req, res) => {
  res.json({ message: '引流追踪API开发中...' });
});

module.exports = router;
