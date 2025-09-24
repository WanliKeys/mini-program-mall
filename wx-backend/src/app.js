const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { testConnection, ensureAdminSetup } = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const ORDER_UNPAID_TIMEOUT_MIN = parseInt(process.env.ORDER_UNPAID_TIMEOUT_MIN || '30', 10);

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

// 管理员API路由
app.use('/api/admin/products', require('./routes/admin/products'));
app.use('/api/admin/categories', require('./routes/admin/categories'));
app.use('/api/admin/banners', require('./routes/admin/banners'));
app.use('/api/admin', require('./routes/admin'));

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
    // 启动后初始化管理员设置（开发/本地场景）
    await ensureAdminSetup();

    // 启动未支付订单超时取消任务
    startUnpaidOrderScheduler(app);
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

// 定时任务：取消超时未支付订单
function startUnpaidOrderScheduler(appInstance) {
  const { query } = require('./config/database');
  const intervalMs = 60 * 1000; // 每分钟
  console.log(`⏰ 未支付订单超时任务已启动，每${intervalMs / 1000}s检查一次，超时时间 ${ORDER_UNPAID_TIMEOUT_MIN} 分钟`);

  setInterval(async () => {
    try {
      // 找出超时未支付订单
      const overdue = await query(
        `SELECT id FROM orders 
         WHERE status = 'pending' 
           AND TIMESTAMPDIFF(MINUTE, created_at, NOW()) >= ?`,
        [ORDER_UNPAID_TIMEOUT_MIN]
      );

      for (const row of overdue) {
        const orderId = row.id;
        // 恢复库存
        const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
        for (const it of items) {
          await query('UPDATE products SET stock = stock + ? WHERE id = ?', [it.quantity, it.product_id]);
        }
        // 仅将状态改为取消（销量未在下单时增加，这里不回退）
        await query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ? AND status = ?', ['cancelled', orderId, 'pending']);
        console.log(`⏰ 订单 ${orderId} 超时未支付，已自动取消并释放库存`);
      }
    } catch (err) {
      console.error('未支付订单超时任务失败:', err.message || err);
    }
  }, intervalMs);
}
