/**
 * 统一响应格式
 */

/**
 * 成功响应
 * @param {Object} res Express响应对象
 * @param {*} data 响应数据
 * @param {String} message 响应消息
 * @param {Number} code 状态码
 */
const success = (res, data = null, message = 'success', code = 200) => {
  res.status(code).json({
    success: true,
    code,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * 错误响应
 * @param {Object} res Express响应对象
 * @param {String} message 错误消息
 * @param {Number} code 状态码
 * @param {*} error 错误详情
 */
const error = (res, message = 'error', code = 500, error = null) => {
  res.status(code).json({
    success: false,
    code,
    message,
    error: process.env.NODE_ENV === 'development' ? error : null,
    timestamp: new Date().toISOString()
  });
};

/**
 * 验证失败响应
 * @param {Object} res Express响应对象
 * @param {String} message 错误消息
 * @param {*} errors 验证错误详情
 */
const validation = (res, message = 'Validation failed', errors = null) => {
  res.status(400).json({
    success: false,
    code: 400,
    message,
    errors,
    timestamp: new Date().toISOString()
  });
};

/**
 * 未授权响应
 * @param {Object} res Express响应对象
 * @param {String} message 错误消息
 */
const unauthorized = (res, message = 'Unauthorized') => {
  res.status(401).json({
    success: false,
    code: 401,
    message,
    timestamp: new Date().toISOString()
  });
};

/**
 * 禁止访问响应
 * @param {Object} res Express响应对象
 * @param {String} message 错误消息
 */
const forbidden = (res, message = 'Forbidden') => {
  res.status(403).json({
    success: false,
    code: 403,
    message,
    timestamp: new Date().toISOString()
  });
};

/**
 * 资源不存在响应
 * @param {Object} res Express响应对象
 * @param {String} message 错误消息
 */
const notFound = (res, message = 'Resource not found') => {
  res.status(404).json({
    success: false,
    code: 404,
    message,
    timestamp: new Date().toISOString()
  });
};

/**
 * 分页响应
 * @param {Object} res Express响应对象
 * @param {Array} data 数据列表
 * @param {Number} total 总数量
 * @param {Number} page 当前页
 * @param {Number} pageSize 页大小
 * @param {String} message 响应消息
 */
const paginate = (res, data, total, page, pageSize, message = 'success') => {
  const totalPages = Math.ceil(total / pageSize);
  
  res.status(200).json({
    success: true,
    code: 200,
    message,
    data,
    pagination: {
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  success,
  error,
  validation,
  unauthorized,
  forbidden,
  notFound,
  paginate
};
