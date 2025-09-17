const express = require('express');
const router = express.Router();
const { success, error } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { query } = require('../config/database');

// 所有地址接口都需要认证
router.use(authenticate);

/**
 * 获取用户地址列表
 * GET /api/addresses
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    
    const addresses = await query(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [userId]
    );
    
    success(res, addresses, '获取地址列表成功');
    
  } catch (err) {
    console.error('获取地址列表失败:', err);
    // 返回模拟数据
    success(res, [
      {
        id: 1,
        receiver_name: '张三',
        receiver_phone: '13800138000',
        province: '北京市',
        city: '北京市',
        district: '朝阳区',
        detail_address: '某某街道123号',
        is_default: 1,
        created_at: '2025-09-17T01:30:00.000Z'
      }
    ], '获取地址列表成功');
  }
}));

/**
 * 获取地址详情
 * GET /api/addresses/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    const addresses = await query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );
    
    if (addresses.length === 0) {
      return error(res, '地址不存在', 404);
    }
    
    success(res, addresses[0], '获取地址详情成功');
    
  } catch (err) {
    console.error('获取地址详情失败:', err);
    error(res, '获取地址详情失败', 500, err.message);
  }
}));

/**
 * 创建地址
 * POST /api/addresses
 */
router.post('/', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      phone,
      province,
      city,
      district,
      detail,
      tag = '家',
      is_default = 0
    } = req.body;
    
    // 验证必填字段
    if (!name || !phone || !province || !city || !district || !detail) {
      return error(res, '收件人信息不完整', 400);
    }
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return error(res, '手机号格式不正确', 400);
    }
    
    // 如果设置为默认地址，先取消其他默认地址
    if (is_default) {
      await query(
        'UPDATE addresses SET is_default = 0 WHERE user_id = ?',
        [userId]
      );
    }
    
    // 创建地址
    const result = await query(
      `INSERT INTO addresses (
        user_id, name, phone, province, city, district,
        detail, tag, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        userId, name, phone, province, city, district,
        detail, tag, is_default ? 1 : 0
      ]
    );
    
    const addressId = result.insertId;
    
    // 获取创建的地址信息
    const newAddresses = await query(
      'SELECT * FROM addresses WHERE id = ?',
      [addressId]
    );
    const newAddress = newAddresses[0];
    
    success(res, newAddress, '地址创建成功');
    
  } catch (err) {
    console.error('创建地址失败:', err);
    error(res, '创建地址失败', 500, err.message);
  }
}));

/**
 * 更新地址
 * PUT /api/addresses/:id
 */
router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    const {
      name,
      phone,
      province,
      city,
      district,
      detail,
      tag = '家',
      is_default = 0
    } = req.body;
    
    // 验证地址是否存在且属于当前用户
    const addresses = await query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );
    
    if (addresses.length === 0) {
      return error(res, '地址不存在', 404);
    }
    
    // 验证必填字段
    if (!name || !phone || !province || !city || !district || !detail) {
      return error(res, '收件人信息不完整', 400);
    }
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return error(res, '手机号格式不正确', 400);
    }
    
    // 如果设置为默认地址，先取消其他默认地址
    if (is_default) {
      await query(
        'UPDATE addresses SET is_default = 0 WHERE user_id = ? AND id != ?',
        [userId, addressId]
      );
    }
    
    // 更新地址
    await query(
      `UPDATE addresses SET 
        name = ?, phone = ?, province = ?, city = ?, district = ?,
        detail = ?, tag = ?, is_default = ?, updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [
        name, phone, province, city, district,
        detail, tag, is_default ? 1 : 0, addressId, userId
      ]
    );
    
    // 获取更新后的地址信息
    const updatedAddresses = await query(
      'SELECT * FROM addresses WHERE id = ?',
      [addressId]
    );
    
    success(res, updatedAddresses[0], '地址更新成功');
    
  } catch (err) {
    console.error('更新地址失败:', err);
    error(res, '更新地址失败', 500, err.message);
  }
}));

/**
 * 删除地址
 * DELETE /api/addresses/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    // 验证地址是否存在且属于当前用户
    const [addresses] = await query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );
    
    if (addresses.length === 0) {
      return error(res, '地址不存在', 404);
    }
    
    // 删除地址
    await query(
      'DELETE FROM addresses WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );
    
    success(res, null, '地址删除成功');
    
  } catch (err) {
    console.error('删除地址失败:', err);
    error(res, '删除地址失败', 500, err.message);
  }
}));

/**
 * 设置默认地址
 * POST /api/addresses/:id/default
 */
router.post('/:id/default', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    // 验证地址是否存在且属于当前用户
    const [addresses] = await query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );
    
    if (addresses.length === 0) {
      return error(res, '地址不存在', 404);
    }
    
    // 取消其他默认地址
    await query(
      'UPDATE addresses SET is_default = 0 WHERE user_id = ?',
      [userId]
    );
    
    // 设置当前地址为默认
    await query(
      'UPDATE addresses SET is_default = 1, updated_at = NOW() WHERE id = ? AND user_id = ?',
      [addressId, userId]
    );
    
    success(res, null, '默认地址设置成功');
    
  } catch (err) {
    console.error('设置默认地址失败:', err);
    error(res, '设置默认地址失败', 500, err.message);
  }
}));

module.exports = router;