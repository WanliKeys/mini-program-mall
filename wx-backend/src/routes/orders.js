const express = require('express');
const router = express.Router();
const { success, error } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { query } = require('../config/database');
const moment = require('moment');
const { createReservation, getAvailableStock } = require('../utils/inventory');

// 所有订单接口都需要认证
router.use(authenticate);

/**
 * 获取订单统计
 * GET /api/orders/stats
 */
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    
    const pending = await query(
      'SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status = ?',
      [userId, 'pending']
    );
    
    const completed = await query(
      'SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status = ?',
      [userId, 'completed']
    );
    
    success(res, {
      pending: pending[0].count,
      completed: completed[0].count
    }, '获取订单统计成功');
    
  } catch (err) {
    console.error('获取订单统计失败:', err);
    error(res, '获取订单统计失败', 500, err.message);
  }
}));

/**
 * 获取订单列表
 * GET /api/orders
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, pageSize = 10 } = req.query;
    
    let whereClause = 'WHERE o.user_id = ?';
    const params = [userId];
    
    if (status && status !== 'all') {
      whereClause += ' AND o.status = ?';
      params.push(status);
    }
    
    const offset = (page - 1) * pageSize;
    
    // 使用子查询聚合订单项，避免 ONLY_FULL_GROUP_BY 问题
    const orders = await query(
      `SELECT o.*, items.items_json AS items, 
              cc.id as card_code_id, cc.code as card_code, cc.price as card_price, cc.status as card_status
       FROM orders o
       LEFT JOIN (
         SELECT oi.order_id, 
                GROUP_CONCAT(
                  CONCAT('{',
                         '"id":', oi.product_id,
                         ',"name":"', oi.product_name, '"',
                         ',"image":"', oi.product_image, '"',
                         ',"price":', oi.product_price,
                         ',"quantity":', oi.quantity,
                  '}')
                ) AS items_json
         FROM order_items oi
         GROUP BY oi.order_id
       ) items ON items.order_id = o.id
       LEFT JOIN card_codes cc ON cc.id = o.card_code_id
       ${whereClause}
       ORDER BY o.created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    
    const countRows = await query(
      `SELECT COUNT(DISTINCT o.id) as total FROM orders o ${whereClause}`,
      params
    );
    
    const processedOrders = orders.map(order => {
      let parsedItems = [];
      if (order.items && typeof order.items === 'string' && order.items.trim().length > 0) {
        try {
          parsedItems = JSON.parse('[' + order.items + ']');
        } catch (e) {
          parsedItems = [];
        }
      }
      
      // 处理卡密信息
      let cardCodeInfo = null;
      if (order.card_code_id && order.card_code) {
        cardCodeInfo = {
          id: order.card_code_id,
          code: order.card_code,
          price: parseFloat(order.card_price),
          status: order.card_status,
          statusText: order.card_status === 'shipped' ? '已发货' : '未使用'
        };
      }
      
      return {
        ...order,
        items: parsedItems,
        cardCode: cardCodeInfo
      };
    });
    
    success(res, {
      orders: processedOrders,
      total: countRows[0]?.total || 0,
      hasMore: offset + processedOrders.length < (countRows[0]?.total || 0)
    }, '获取订单列表成功');
    
  } catch (err) {
    console.error('获取订单列表失败:', err);
    error(res, '获取订单列表失败', 500, err.message);
  }
}));

/**
 * 创建订单 (单个商品直接购买)
 * POST /api/orders
 */
router.post('/', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, quantity = 1, addressId, externalOrderNo, remark, paymentMethod = 'wechat', isReferral, linkCode, partnerOrderNo, notifyUrl } = req.body;
    
    // 验证参数（移除地址功能后，地址可为空）
    if (!productId) {
      return error(res, '商品ID不能为空', 400);
    }

    // 获取商品信息
    const products = await query(
      'SELECT * FROM products WHERE id = ? AND status = 1',
      [productId]
    );

    if (products.length === 0) {
      return error(res, '商品不存在或已下架', 404);
    }

    const product = products[0];

    // 检查可售库存（考虑卡密库存）
    const availableStock = await getAvailableStock(productId);
    if (availableStock < quantity) {
      return error(res, `库存不足，当前可售${availableStock}件，需要${quantity}件`, 400);
    }
    
    // 创建预分配
    const reservation = await createReservation(productId, quantity, userId);
    if (!reservation.success) {
      return error(res, reservation.message, 400);
    }
    
    // 获取地址信息（仅在有地址时获取）
    let address = null;
    if (addressId) {
      const addresses = await query(
        'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
        [addressId, userId]
      );

      if (addresses.length === 0) {
        return error(res, '收货地址不存在', 404);
      }

      address = addresses[0];
    }
    
    // 生成订单号
    let orderNo;
    let source = 'direct';
    
    if (externalOrderNo) {
      // 来自引流平台，直接使用外部订单号
      orderNo = externalOrderNo;
      source = 'external';
    } else {
      // 内部订单，生成新订单号
      orderNo = 'ML' + moment().format('YYYYMMDDHHmmss') + Math.random().toString(36).substr(2, 4).toUpperCase();
    }
    
    const totalAmount = parseFloat(product.price) * quantity;
    
    // 创建订单（允许地址为空）
    const orderResult = await query(
      `INSERT INTO orders (
        order_no, user_id, address_id, total_amount, payment_method, status, remark, external_order_no, source,
        reservation_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        orderNo, userId, addressId || null, totalAmount, paymentMethod, 'pending', remark || null,
        externalOrderNo || null, source, reservation.reservationId
      ]
    );
    
    // mysql2/promise execute 返回的是 rows; 对 INSERT 返回 OkPacket
    const orderId = orderResult.insertId || (Array.isArray(orderResult) ? orderResult[0]?.insertId : undefined);
    if (!orderId) {
      throw new Error('创建订单失败：未获取到插入ID');
    }
    
    // 创建订单项
    await query(
      `INSERT INTO order_items (
        order_id, product_id, product_name, product_image,
        product_price, quantity, subtotal, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        orderId, product.id, product.name, product.image,
        product.price, quantity, parseFloat(product.price) * quantity
      ]
    );
    
    // 下单仅锁定库存，不增加销量；支付成功再确认销量
    await query(
      'UPDATE products SET stock = stock - ? WHERE id = ?',
      [quantity, productId]
    );
    
    // 记录引流日志（按当前表结构）
    if (externalOrderNo) {
      await query(
        `INSERT INTO referral_logs (
          user_id, external_order_no, source_platform, product_id, action_type, created_at
        ) VALUES (?, ?, 'external', ?, 'order', NOW())`,
        [userId, externalOrderNo, productId]
      );
    }
    
    // 如果是引流订单，关联引流订单记录
    if (isReferral && linkCode && partnerOrderNo && notifyUrl) {
      try {
        // 获取引流链接ID
        const referralLinks = await query(
          'SELECT id FROM referral_links WHERE link_code = ?',
          [linkCode]
        );
        
        if (referralLinks.length > 0) {
          const referralLinkId = referralLinks[0].id;
          
          // 更新引流订单记录，关联我们的订单ID
          const linkUpdateResult = await query(
            'UPDATE referral_orders SET our_order_id = ?, updated_at = NOW() WHERE referral_link_id = ? AND partner_order_no = ?',
            [orderId, referralLinkId, partnerOrderNo]
          );

          const affectedRows = linkUpdateResult?.affectedRows || linkUpdateResult?.[0]?.affectedRows || 0;
          if (affectedRows > 0) {
            console.log(`引流订单关联成功: ${partnerOrderNo} -> ${orderId}`);
          } else {
            console.warn(`引流订单关联失败，未找到记录: ${partnerOrderNo} (referral_link_id=${referralLinkId})`);
          }
        }
      } catch (err) {
        console.error('关联引流订单失败:', err);
        // 不影响主流程，只记录日志
      }
    }
    
    const orderData = {
      id: orderId,
      orderNo,
      userId,
      totalAmount,
      status: 'pending',
      source,
      items: [{
        product: {
          id: product.id,
          name: product.name,
          image: product.image,
          price: parseFloat(product.price)
        },
        quantity
      }],
      createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
    };
    
    success(res, orderData, '订单创建成功');
    
  } catch (err) {
    console.error('创建订单失败:', err);
    error(res, '创建订单失败', 500, err.message);
  }
}));

/**
 * 创建订单 (从购物车)
 * POST /api/orders/batch
 */
router.post('/batch', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { items, addressId } = req.body;

    // 验证参数（移除地址强制要求）
    if (!items || items.length === 0) {
      return error(res, '购物车商品不能为空', 400);
    }

    // 获取地址信息（可选）
    let address = null;
    if (addressId) {
      const addresses = await query(
        'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
        [addressId, userId]
      );

      if (addresses.length === 0) {
        return error(res, '收货地址不存在', 404);
      }

      address = addresses[0];
    }
    
    // 生成订单号
    const orderNo = 'ML' + moment().format('YYYYMMDDHHmmss') + Math.random().toString(36).substr(2, 4).toUpperCase();
    
    // 计算总金额并验证商品
    let totalAmount = 0;
    const validItems = [];
    
    for (const item of items) {
      const products = await query(
        'SELECT * FROM products WHERE id = ? AND status = 1',
        [item.productId]
      );
      
      if (products.length === 0) {
        return error(res, `商品 ${item.productId} 不存在或已下架`, 404);
      }
      
      const product = products[0];
      
      if (product.stock < item.quantity) {
        return error(res, `商品 ${product.name} 库存不足`, 400);
      }
      
      validItems.push({
        ...item,
        product,
        subtotal: parseFloat(product.price) * item.quantity
      });
      
      totalAmount += parseFloat(product.price) * item.quantity;
    }
    
    // 创建订单（允许地址为空）
    const orderResult = await query(
      `INSERT INTO orders (
        order_no, user_id, address_id, total_amount, status, source,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        orderNo, userId, addressId || null, totalAmount, 'pending', 'direct'
      ]
    );
    
    const orderId = orderResult.insertId || (Array.isArray(orderResult) ? orderResult[0]?.insertId : undefined);
    if (!orderId) {
      throw new Error('创建订单失败：未获取到插入ID');
    }
    
    // 创建订单项并更新库存
    for (const item of validItems) {
      // 创建订单项
      await query(
        `INSERT INTO order_items (
          order_id, product_id, product_name, product_image,
          product_price, quantity, subtotal, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          orderId, item.product.id, item.product.name, item.product.image,
          item.product.price, item.quantity, item.subtotal
        ]
      );
      
      // 批量下单：仅扣减库存，不增加销量
      await query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product.id]
      );
      
      // 从购物车中删除商品
      await query(
        'DELETE FROM cart WHERE user_id = ? AND product_id = ?',
        [userId, item.productId]
      );
    }
    
    const orderData = {
      id: orderId,
      orderNo,
      userId,
      totalAmount,
      status: 'pending',
      source: 'direct',
      receiverInfo: address ? {
        name: address.name,
        phone: address.phone,
        address: `${address.province} ${address.city} ${address.district} ${address.detail}`
      } : null,
      items: validItems.map(item => ({
        productId: item.product.id,
        name: item.product.name,
        image: item.product.image,
        price: parseFloat(item.product.price),
        quantity: item.quantity
      })),
      createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
    };
    
    success(res, orderData, '订单创建成功');
    
  } catch (err) {
    console.error('批量创建订单失败:', err);
    error(res, '创建订单失败', 500, err.message);
  }
}));

/**
 * 取消订单
 * PUT /api/orders/:id/cancel
 */
router.put('/:id/cancel', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      return error(res, '订单ID不合法', 400);
    }

    // 仅允许取消待付款订单
    const orders = await query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1',
      [orderId, userId]
    );
    if (orders.length === 0) {
      return error(res, '订单不存在', 404);
    }
    const order = orders[0];
    if (order.status !== 'pending') {
      return error(res, '仅待付款订单可取消', 400);
    }

    // 恢复库存
    const items = await query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
      [orderId]
    );
    for (const it of items) {
      await query(
        'UPDATE products SET stock = stock + ?, sales = GREATEST(sales - ?, 0) WHERE id = ?',
        [it.quantity, it.quantity, it.product_id]
      );
    }

    // 更新订单状态
    await query(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      ['cancelled', orderId]
    );

    success(res, null, '订单取消成功');
  } catch (err) {
    console.error('取消订单失败:', err);
    error(res, '取消订单失败', 500, err.message);
  }
}));

module.exports = router;
/**
 * 获取订单详情
 * GET /api/orders/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId)) {
      return error(res, '订单ID不合法', 400);
    }

    // 查询订单
    const orders = await query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1',
      [orderId, userId]
    );
    if (orders.length === 0) {
      return error(res, '订单不存在', 404);
    }
    const order = orders[0];

    // 查询订单项
    const items = await query(
      `SELECT oi.id, oi.product_id, oi.product_name, oi.product_image, oi.product_price, oi.quantity,
              p.id as p_id, p.name as p_name, p.image as p_image, p.price as p_price
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    const formattedItems = items.map(it => ({
      id: it.id,
      quantity: it.quantity,
      product: {
        id: it.product_id || it.p_id,
        name: it.product_name || it.p_name,
        image: it.product_image || it.p_image,
        price: parseFloat(it.product_price || it.p_price)
      }
    }));

    // 获取收货地址信息
    const addresses = await query(
      'SELECT * FROM addresses WHERE id = ?',
      [order.address_id]
    );
    
    const address = addresses[0] || {};

    // 获取分配的卡密信息
    let cardCodeInfo = null;
    if (order.card_code_id) {
      const cardCodes = await query(
        'SELECT id, code, price, status, created_at FROM card_codes WHERE id = ?',
        [order.card_code_id]
      );
      
      if (cardCodes.length > 0) {
        const card = cardCodes[0];
        cardCodeInfo = {
          id: card.id,
          code: card.code,
          price: parseFloat(card.price),
          status: card.status,
          statusText: card.status === 'shipped' ? '已发货' : '未使用',
          createdAt: card.created_at
        };
      }
    }

    const data = {
      id: order.id,
      orderNo: order.order_no,
      status: order.status,
      totalAmount: parseFloat(order.total_amount),
      receiverInfo: {
        name: address.name || '',
        phone: address.phone || '',
        address: address.detail ? `${address.province} ${address.city} ${address.district} ${address.detail}` : ''
      },
      items: formattedItems,
      cardCode: cardCodeInfo, // 添加卡密信息
      createdAt: order.created_at
    };

    success(res, data, '获取订单详情成功');
  } catch (err) {
    console.error('获取订单详情失败:', err);
    error(res, '获取订单详情失败', 500, err.message);
  }
}));
