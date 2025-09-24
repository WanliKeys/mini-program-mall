const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { success, error } = require('../utils/response');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// 确保目录存在
function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 存储到 uploads/images/avatars 目录（注意：此处 __dirname 在 src/routes，下探两级到项目 uploads）
const uploadsRoot = path.join(__dirname, '../../uploads');
const avatarDir = path.join(uploadsRoot, 'images/avatars');
ensureDirSync(avatarDir);

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, avatarDir);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `avatar-${Date.now()}-${Math.floor(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(jpeg|png|jpg|webp)/.test(file.mimetype);
    cb(ok ? null : new Error('仅支持图片上传'), ok);
  }
});

// POST /api/upload/avatar
router.post('/avatar', authenticate, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return error(res, '未接收到文件', 400);
    }
    const relativePath = `/uploads/images/avatars/${req.file.filename}`;
    const base = `${req.protocol}://${req.get('host')}`;
    const url = `${base}${relativePath}`;
    return success(res, { url, path: relativePath, filename: req.file.filename }, '上传成功');
  } catch (e) {
    return error(res, '上传失败', 500, e.message);
  }
});

module.exports = router;
