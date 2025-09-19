const { verifyToken } = require('../utils/jwt');
const { unauthorized } = require('../utils/response');
const { query } = require('../config/database');

/**
 * JWT认证中间件
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, '缺少认证令牌');
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return unauthorized(res, '无效的认证令牌');
    }

    // 验证token
    const decoded = verifyToken(token);
    
    // 查询用户信息
    const users = await query(
      'SELECT id, openid, nickname, avatar, phone FROM users WHERE id = ? AND openid = ?',
      [decoded.userId, decoded.openid]
    );

    if (users.length === 0) {
      return unauthorized(res, '用户不存在或已被禁用');
    }

    // 将用户信息附加到请求对象
    req.user = {
      id: users[0].id,
      openid: users[0].openid,
      nickname: users[0].nickname,
      avatar: users[0].avatar,
      phone: users[0].phone
    };

    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    
    if (error.message === 'Invalid token' || error.name === 'TokenExpiredError') {
      return unauthorized(res, '认证令牌无效或已过期');
    }
    
    return unauthorized(res, '认证失败');
  }
};

/**
 * 可选认证中间件（不强制要求登录）
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      req.user = null;
      return next();
    }

    // 验证token
    const decoded = verifyToken(token);
    
    // 查询用户信息
    const users = await query(
      'SELECT id, openid, nickname, avatar, phone FROM users WHERE id = ? AND openid = ?',
      [decoded.userId, decoded.openid]
    );

    if (users.length > 0) {
      req.user = {
        id: users[0].id,
        openid: users[0].openid,
        nickname: users[0].nickname,
        avatar: users[0].avatar,
        phone: users[0].phone
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('可选认证中间件错误:', error);
    req.user = null;
    next();
  }
};

/**
 * 管理员认证中间件
 */
const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: '缺少认证令牌',
        timestamp: new Date().toISOString()
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 查询用户信息
    const users = await query(
      'SELECT id, openid, nickname, avatar, phone, role FROM users WHERE id = ?',
      [decoded.userId]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: '用户不存在',
        timestamp: new Date().toISOString()
      });
    }
    
    const user = users[0];
    
    // 检查是否为管理员
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        code: 403,
        message: '权限不足，需要管理员权限',
        timestamp: new Date().toISOString()
      });
    }
    
    req.user = user;
    next();
  } catch (err) {
    console.error('管理员认证错误:', err);
    return res.status(401).json({
      success: false,
      code: 401,
      message: '认证令牌无效或已过期',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  adminAuth
};
