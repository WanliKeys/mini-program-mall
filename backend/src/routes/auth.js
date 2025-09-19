const express = require('express');
const axios = require('axios');
const { query } = require('../config/database');
const { generateToken } = require('../utils/jwt');
const { success, error } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * 微信小程序静默登录
 * POST /api/auth/login
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return error(res, '缺少微信授权码', 400);
  }

  try {
    // 调用微信API获取openid
    const wxResponse = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: process.env.WECHAT_APPID,
        secret: process.env.WECHAT_SECRET,
        js_code: code,
        grant_type: 'authorization_code'
      }
    });

    if (wxResponse.data.errcode) {
      console.error('微信登录失败:', wxResponse.data);
      throw new Error('微信API调用失败');
    }

    const { openid, session_key } = wxResponse.data;

    // 查询或创建用户
    let users = await query(
      'SELECT * FROM users WHERE openid = ?',
      [openid]
    );

    let user;
    if (users.length === 0) {
      // 创建新用户
      const result = await query(
        'INSERT INTO users (openid) VALUES (?)',
        [openid]
      );
      
      user = {
        id: result.insertId,
        openid,
        nickname: null,
        avatar: null,
        phone: null
      };
    } else {
      user = users[0];
    }

    // 生成JWT token
    const token = generateToken({
      userId: user.id,
      openid: user.openid
    });

    success(res, {
      token,
      user: {
        id: user.id,
        openid: user.openid,
        nickname: user.nickname,
        avatar: user.avatar,
        phone: user.phone
      }
    }, '登录成功');

  } catch (err) {
    console.error('登录错误:', err);
    return error(res, '登录服务暂时不可用', 500);
  }
}));

/**
 * 获取用户信息
 * GET /api/auth/profile
 */
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const users = await query(
    'SELECT id, openid, nickname, avatar, phone, created_at FROM users WHERE id = ?',
    [req.user.id]
  );

  if (users.length === 0) {
    return error(res, '用户不存在', 404);
  }

  success(res, users[0], '获取用户信息成功');
}));

/**
 * 更新用户信息
 * PUT /api/auth/profile
 */
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const { nickname, avatar, phone } = req.body;
  
  const updateFields = [];
  const updateValues = [];
  
  if (nickname !== undefined) {
    updateFields.push('nickname = ?');
    updateValues.push(nickname);
  }
  
  if (avatar !== undefined) {
    updateFields.push('avatar = ?');
    updateValues.push(avatar);
  }
  
  if (phone !== undefined) {
    updateFields.push('phone = ?');
    updateValues.push(phone);
  }
  
  if (updateFields.length === 0) {
    return error(res, '没有需要更新的字段', 400);
  }
  
  updateValues.push(req.user.id);
  
  await query(
    `UPDATE users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    updateValues
  );

  // 返回更新后的用户信息
  const users = await query(
    'SELECT id, openid, nickname, avatar, phone FROM users WHERE id = ?',
    [req.user.id]
  );

  success(res, users[0], '用户信息更新成功');
}));

/**
 * 刷新token
 * POST /api/auth/refresh
 */
router.post('/refresh', authenticate, asyncHandler(async (req, res) => {
  // 生成新的token
  const token = generateToken({
    userId: req.user.id,
    openid: req.user.openid
  });

  success(res, { token }, 'Token刷新成功');
}));

module.exports = router;
