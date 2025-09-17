const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// 基础中间件
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 日志中间件
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// 静态文件服务
const uploadsPath = path.join(__dirname, '../uploads');
console.log('静态文件路径:', uploadsPath);
app.use('/uploads', express.static(uploadsPath));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '小程序商城API服务运行正常',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/banners', require('./routes/banners'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/addresses', require('./routes/addresses'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/referral', require('./routes/referral'));

// 404处理
app.use(notFoundHandler);

// 错误处理
app.use(errorHandler);

// 启动服务器
const startServer = async () => {
  try {
    // 测试数据库连接（开发环境下不强制要求）
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.warn('⚠️  数据库连接失败，但服务器将继续启动（开发模式）');
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ 生产环境下数据库连接是必需的');
        process.exit(1);
      }
    }

    app.listen(PORT, () => {
      console.log(`
🚀 小程序商城API服务启动成功！
📍 服务地址: http://localhost:${PORT}
🔍 健康检查: http://localhost:${PORT}/health
📖 API文档: http://localhost:${PORT}/api-docs (待开发)
🌍 环境: ${process.env.NODE_ENV || 'development'}
⏰ 启动时间: ${new Date().toLocaleString('zh-CN')}
      `);
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
};

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('📴 收到SIGTERM信号，正在优雅关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 收到SIGINT信号，正在优雅关闭服务器...');
  process.exit(0);
});

// 启动服务器
startServer();

module.exports = app;
