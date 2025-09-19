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
    maxAge: '1d', // 缓存1天
    etag: true,
    lastModified: true
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

// 代理API请求到后端服务
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

    if (data) {
      config.data = data;
    }

    // 添加查询参数
    if (req.query && Object.keys(req.query).length > 0) {
      config.params = req.query;
    }

    const response = await axios(config);
    res.json(response.data);
  } catch (error) {
    console.error('API代理错误:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || '服务器错误',
      error: error.message
    });
  }
};

// 管理员登录
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 这里应该调用后端API进行真实登录
    // 为了演示，我们使用模拟登录
    if (username === 'admin' && password === 'admin123') {
      // 生成模拟token
      const token = 'admin_token_' + Date.now();
      
      res.json({
        success: true,
        message: '登录成功',
        data: {
          token,
          user: {
            id: 1,
            username: 'admin',
            role: 'admin'
          }
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      message: '登录失败'
    });
  }
});

// 获取仪表盘数据
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    // 模拟仪表盘数据
    const dashboardData = {
      totalProducts: 156,
      totalOrders: 1234,
      totalCategories: 12,
      totalBanners: 5,
      recentOrders: [
        { id: 1, orderNo: 'ML202501190001', amount: 999.00, status: 'pending', createdAt: '2025-01-19 10:30:00' },
        { id: 2, orderNo: 'ML202501190002', amount: 1299.00, status: 'completed', createdAt: '2025-01-19 09:15:00' }
      ]
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('获取仪表盘数据错误:', error);
    res.status(500).json({
      success: false,
      message: '获取仪表盘数据失败'
    });
  }
});

// 商品管理API代理
app.get('/api/admin/products', (req, res) => {
  proxyRequest(req, res, '/admin/products');
});

app.get('/api/admin/products/:id', (req, res) => {
  proxyRequest(req, res, `/admin/products/${req.params.id}`);
});

app.post('/api/admin/products', upload.single('image'), async (req, res) => {
  try {
    // 处理文件上传
    const formData = { ...req.body };
    if (req.file) {
      formData.image = `/uploads/${req.file.filename}`;
    }
    
    // 转发到后端API
    const response = await axios.post(`${API_BASE_URL}/admin/products`, formData, {
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('创建商品错误:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || '创建商品失败',
      error: error.message
    });
  }
});

app.put('/api/admin/products/:id', upload.single('image'), async (req, res) => {
  try {
    const formData = { ...req.body };
    if (req.file) {
      formData.image = `/uploads/${req.file.filename}`;
    }
    
    const response = await axios.put(`${API_BASE_URL}/admin/products/${req.params.id}`, formData, {
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('更新商品错误:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || '更新商品失败',
      error: error.message
    });
  }
});

app.delete('/api/admin/products/:id', (req, res) => {
  proxyRequest(req, res, `/admin/products/${req.params.id}`, 'DELETE');
});

// 分类管理API代理
app.get('/api/admin/categories', (req, res) => {
  proxyRequest(req, res, '/admin/categories');
});

app.get('/api/admin/categories/:id', (req, res) => {
  proxyRequest(req, res, `/admin/categories/${req.params.id}`);
});

app.post('/api/admin/categories', upload.single('icon'), async (req, res) => {
  try {
    const formData = { ...req.body };
    if (req.file) {
      formData.icon = `/uploads/${req.file.filename}`;
    }
    
    const response = await axios.post(`${API_BASE_URL}/admin/categories`, formData, {
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('创建分类错误:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || '创建分类失败',
      error: error.message
    });
  }
});

app.put('/api/admin/categories/:id', upload.single('icon'), async (req, res) => {
  try {
    const formData = { ...req.body };
    if (req.file) {
      formData.icon = `/uploads/${req.file.filename}`;
    }
    
    const response = await axios.put(`${API_BASE_URL}/admin/categories/${req.params.id}`, formData, {
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('更新分类错误:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || '更新分类失败',
      error: error.message
    });
  }
});

app.delete('/api/admin/categories/:id', (req, res) => {
  proxyRequest(req, res, `/admin/categories/${req.params.id}`, 'DELETE');
});

// 轮播图管理API代理
app.get('/api/admin/banners', (req, res) => {
  proxyRequest(req, res, '/admin/banners');
});

app.get('/api/admin/banners/:id', (req, res) => {
  proxyRequest(req, res, `/admin/banners/${req.params.id}`);
});

app.post('/api/admin/banners', upload.single('image'), async (req, res) => {
  try {
    const formData = { ...req.body };
    if (req.file) {
      formData.image = `/uploads/${req.file.filename}`;
    }
    
    const response = await axios.post(`${API_BASE_URL}/admin/banners`, formData, {
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('创建轮播图错误:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || '创建轮播图失败',
      error: error.message
    });
  }
});

app.put('/api/admin/banners/:id', upload.single('image'), async (req, res) => {
  try {
    const formData = { ...req.body };
    if (req.file) {
      formData.image = `/uploads/${req.file.filename}`;
    }
    
    const response = await axios.put(`${API_BASE_URL}/admin/banners/${req.params.id}`, formData, {
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('更新轮播图错误:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || '更新轮播图失败',
      error: error.message
    });
  }
});

app.delete('/api/admin/banners/:id', (req, res) => {
  proxyRequest(req, res, `/admin/banners/${req.params.id}`, 'DELETE');
});

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
