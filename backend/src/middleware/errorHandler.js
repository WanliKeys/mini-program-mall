const { error } = require('../utils/response');

/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // 数据库错误
  if (err.code === 'ER_DUP_ENTRY') {
    return error(res, '数据已存在', 409);
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return error(res, '关联数据不存在', 400);
  }

  // JWT错误
  if (err.name === 'JsonWebTokenError') {
    return error(res, '无效的认证令牌', 401);
  }

  if (err.name === 'TokenExpiredError') {
    return error(res, '认证令牌已过期', 401);
  }

  // 验证错误
  if (err.name === 'ValidationError') {
    return error(res, err.message, 400);
  }

  // 文件上传错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    return error(res, '文件大小超出限制', 400);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return error(res, '不支持的文件类型', 400);
  }

  // 支付相关错误
  if (err.code === 'PAYMENT_ERROR') {
    return error(res, err.message || '支付处理失败', 400);
  }

  // 业务逻辑错误
  if (err.status && err.status < 500) {
    return error(res, err.message, err.status);
  }

  // 默认服务器错误
  return error(res, '服务器内部错误', 500, err.message);
};

/**
 * 404错误处理
 */
const notFoundHandler = (req, res) => {
  return error(res, `路由 ${req.method} ${req.url} 不存在`, 404);
};

/**
 * 异步错误捕获装饰器
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
