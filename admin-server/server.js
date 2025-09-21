const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.ADMIN_PORT || 3001;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// 中间件
app.use(compression()); // 启用gzip压缩
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 - 添加缓存和压缩
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // 缓存1天（HTML等）
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      // 对静态资源开启长期缓存并标记 immutable
      if (['.js', '.mjs', '.css', '.woff2', '.woff'].includes(ext)) {
        if ((process.env.NODE_ENV || 'development') === 'production') {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          // 开发环境避免缓存导致前端脚本不更新
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }
}));

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
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

// 创建上传目录
const fs = require('fs');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 通用代理方法（转发到 wx-backend）
const proxyRequest = async (req, res, endpoint, method = 'GET', data = null) => {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      method,
      url,
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': 'application/json'
      }
    };
    if (data) config.data = data;
    if (req.query && Object.keys(req.query).length > 0) config.params = req.query;
    const response = await axios(config);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('API代理错误:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || '服务器错误',
      error: error.message
    });
  }
};

// 管理员登录（若 wx-backend 尚未实现，可临时保留本地校验；默认转发到后端）
app.post('/api/admin/login', async (req, res) => {
  return proxyRequest(req, res, '/admin/login', 'POST', req.body);
});

// 仪表盘数据（尝试从后端聚合；若后端无该接口，可在后端实现或前端降级）
app.get('/api/admin/dashboard', async (req, res) => {
  return proxyRequest(req, res, '/admin/dashboard', 'GET');
});

// 商品管理（代理到 wx-backend）
app.get('/api/admin/products', (req, res) => proxyRequest(req, res, '/admin/products'));
app.get('/api/admin/products/:id', (req, res) => proxyRequest(req, res, `/admin/products/${req.params.id}`));
app.post('/api/admin/products', upload.single('image'), async (req, res) => {
  const formData = { ...req.body };
  if (req.file) formData.image = `/uploads/${req.file.filename}`;
  return proxyRequest(req, res, '/admin/products', 'POST', formData);
});
app.put('/api/admin/products/:id', upload.single('image'), async (req, res) => {
  const formData = { ...req.body };
  if (req.file) formData.image = `/uploads/${req.file.filename}`;
  return proxyRequest(req, res, `/admin/products/${req.params.id}`, 'PUT', formData);
});
app.delete('/api/admin/products/:id', (req, res) => proxyRequest(req, res, `/admin/products/${req.params.id}`, 'DELETE'));

// 分类管理（代理）
app.get('/api/admin/categories', (req, res) => proxyRequest(req, res, '/admin/categories'));
app.get('/api/admin/categories/:id', (req, res) => proxyRequest(req, res, `/admin/categories/${req.params.id}`));
app.post('/api/admin/categories', upload.single('icon'), async (req, res) => {
  const formData = { ...req.body };
  if (req.file) formData.icon = `/uploads/${req.file.filename}`;
  return proxyRequest(req, res, '/admin/categories', 'POST', formData);
});
app.put('/api/admin/categories/:id', upload.single('icon'), async (req, res) => {
  const formData = { ...req.body };
  if (req.file) formData.icon = `/uploads/${req.file.filename}`;
  return proxyRequest(req, res, `/admin/categories/${req.params.id}`, 'PUT', formData);
});
app.delete('/api/admin/categories/:id', (req, res) => proxyRequest(req, res, `/admin/categories/${req.params.id}`, 'DELETE'));

// 轮播图管理（代理）
app.get('/api/admin/banners', (req, res) => proxyRequest(req, res, '/admin/banners'));
app.get('/api/admin/banners/:id', (req, res) => proxyRequest(req, res, `/admin/banners/${req.params.id}`));
app.post('/api/admin/banners', upload.single('image'), async (req, res) => {
  const formData = { ...req.body };
  if (req.file) formData.image = `/uploads/${req.file.filename}`;
  return proxyRequest(req, res, '/admin/banners', 'POST', formData);
});
app.put('/api/admin/banners/:id', upload.single('image'), async (req, res) => {
  const formData = { ...req.body };
  if (req.file) formData.image = `/uploads/${req.file.filename}`;
  return proxyRequest(req, res, `/admin/banners/${req.params.id}`, 'PUT', formData);
});
app.delete('/api/admin/banners/:id', (req, res) => proxyRequest(req, res, `/admin/banners/${req.params.id}`, 'DELETE'));

// 订单（代理，如无则后端补齐）
app.get('/api/admin/orders', (req, res) => proxyRequest(req, res, '/admin/orders'));
app.get('/api/admin/orders/:id', (req, res) => proxyRequest(req, res, `/admin/orders/${req.params.id}`));
app.put('/api/admin/orders/:id/status', (req, res) => proxyRequest(req, res, `/admin/orders/${req.params.id}/status`, 'PUT', req.body));

// 用户资料与密码（代理，如无则后端补齐）
app.get('/api/admin/profile', (req, res) => proxyRequest(req, res, '/admin/profile'));
app.put('/api/admin/profile', (req, res) => proxyRequest(req, res, '/admin/profile', 'PUT', req.body));
app.post('/api/admin/change-password', (req, res) => proxyRequest(req, res, '/admin/change-password', 'POST', req.body));

// 文件上传服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '管理后台服务运行正常',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

// 错误处理
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: error.message
  });
});

// 启动服务
app.listen(PORT, () => {
  console.log('🚀 管理后台服务启动成功！');
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`🔍 健康检查: http://localhost:${PORT}/health`);
  console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ 启动时间: ${new Date().toLocaleString()}`);
});
