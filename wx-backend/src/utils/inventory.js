const { query } = require('../config/database');

/**
 * 计算商品实时可售库存
 * @param {number} productId 商品ID
 * @returns {Promise<number>} 可售库存数量
 */
async function getAvailableStock(productId) {
  try {
    // 获取商品基础信息
    const product = await query(
      'SELECT stock, card_price, card_stock FROM products WHERE id = ?',
      [productId]
    );
    
    if (!product || product.length === 0) {
      return 0;
    }
    
    const { stock, card_price, card_stock } = product[0];
    
    // 如果商品不需要卡密，直接返回商品库存
    if (!card_price || card_stock === null) {
      return stock;
    }
    
    // 计算已预分配数量（未过期且未确认的）
    const reservedResult = await query(`
      SELECT COALESCE(SUM(quantity), 0) as total 
      FROM product_reservations 
      WHERE product_id = ? 
        AND status = 'reserved' 
        AND expires_at > NOW()
    `, [productId]);
    
    const reservedQty = parseInt(reservedResult[0]?.total || 0, 10);
    
    // 计算卡密可用数量
    const cardAvailable = Math.max(0, card_stock - reservedQty);
    
    // 可售数量 = min(商品库存, 卡密可用数量)
    return Math.min(stock, cardAvailable);
    
  } catch (error) {
    console.error('计算可售库存失败:', error);
    return 0;
  }
}

/**
 * 批量计算多个商品的可售库存
 * @param {Array<number>} productIds 商品ID数组
 * @returns {Promise<Object>} {productId: availableStock} 的映射对象
 */
async function getBatchAvailableStock(productIds) {
  if (!productIds || productIds.length === 0) {
    return {};
  }
  
  try {
    const placeholders = productIds.map(() => '?').join(',');
    
    // 获取商品基础信息
    const products = await query(`
      SELECT id, stock, card_price, card_stock 
      FROM products 
      WHERE id IN (${placeholders})
    `, productIds);
    
    const result = {};
    
    for (const product of products) {
      const { id, stock, card_price, card_stock } = product;
      
      // 如果商品不需要卡密，直接使用商品库存
      if (!card_price || card_stock === null) {
        result[id] = stock;
        continue;
      }
      
      // 计算已预分配数量
      const reservedResult = await query(`
        SELECT COALESCE(SUM(quantity), 0) as total 
        FROM product_reservations 
        WHERE product_id = ? 
          AND status = 'reserved' 
          AND expires_at > NOW()
      `, [id]);
      
      const reservedQty = parseInt(reservedResult[0]?.total || 0, 10);
      const cardAvailable = Math.max(0, card_stock - reservedQty);
      
      result[id] = Math.min(stock, cardAvailable);
    }
    
    return result;
    
  } catch (error) {
    console.error('批量计算可售库存失败:', error);
    return {};
  }
}

/**
 * 创建商品预分配
 * @param {number} productId 商品ID
 * @param {number} quantity 预分配数量
 * @param {number} userId 用户ID（可选）
 * @param {number} expireMinutes 过期时间（分钟，默认15分钟）
 * @returns {Promise<Object>} 预分配结果
 */
async function createReservation(productId, quantity, userId = null, expireMinutes = 15) {
  try {
    // 检查可售库存
    const availableStock = await getAvailableStock(productId);
    if (availableStock < quantity) {
      return {
        success: false,
        message: `库存不足，当前可售${availableStock}件，需要${quantity}件`
      };
    }
    
    // 创建预分配记录
    const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000);
    
    const result = await query(`
      INSERT INTO product_reservations (product_id, user_id, quantity, expires_at)
      VALUES (?, ?, ?, ?)
    `, [productId, userId, quantity, expiresAt]);
    
    return {
      success: true,
      reservationId: result.insertId,
      expiresAt: expiresAt,
      message: '预分配成功'
    };
    
  } catch (error) {
    console.error('创建预分配失败:', error);
    return {
      success: false,
      message: '预分配失败，请重试'
    };
  }
}

/**
 * 确认预分配（支付成功时调用）
 * @param {number} reservationId 预分配ID
 * @returns {Promise<Object>} 确认结果
 */
async function confirmReservation(reservationId) {
  try {
    const result = await query(`
      UPDATE product_reservations 
      SET status = 'confirmed' 
      WHERE id = ? AND status = 'reserved'
    `, [reservationId]);
    
    if (result.affectedRows === 0) {
      return {
        success: false,
        message: '预分配不存在或已过期'
      };
    }
    
    return {
      success: true,
      message: '预分配确认成功'
    };
    
  } catch (error) {
    console.error('确认预分配失败:', error);
    return {
      success: false,
      message: '确认预分配失败'
    };
  }
}

/**
 * 清理过期预分配
 * @returns {Promise<Object>} 清理结果
 */
async function cleanupExpiredReservations() {
  try {
    const result = await query(`
      UPDATE product_reservations 
      SET status = 'expired' 
      WHERE status = 'reserved' AND expires_at <= NOW()
    `);
    
    return {
      success: true,
      expiredCount: result.affectedRows,
      message: `清理了${result.affectedRows}个过期预分配`
    };
    
  } catch (error) {
    console.error('清理过期预分配失败:', error);
    return {
      success: false,
      message: '清理过期预分配失败'
    };
  }
}

/**
 * 分配具体卡密（支付成功时调用）
 * @param {number} productId 商品ID
 * @param {number} quantity 数量
 * @returns {Promise<Object>} 分配结果
 */
async function assignCardCodes(productId, quantity) {
  try {
    // 获取商品卡密价格
    const product = await query(
      'SELECT card_price FROM products WHERE id = ?',
      [productId]
    );
    
    if (!product || product.length === 0 || !product[0].card_price) {
      return {
        success: false,
        message: '商品不需要卡密'
      };
    }
    
    const cardPrice = product[0].card_price;
    
    // 随机分配卡密
    const cards = await query(`
      SELECT id, code 
      FROM card_codes 
      WHERE price = ? AND status = 'unused' 
      ORDER BY RAND() 
      LIMIT ?
    `, [cardPrice, quantity]);
    
    if (cards.length < quantity) {
      return {
        success: false,
        message: `卡密不足，需要${quantity}个，可用${cards.length}个`
      };
    }
    
    // 更新卡密状态
    const cardIds = cards.map(card => card.id);
    await query(`
      UPDATE card_codes 
      SET status = 'shipped' 
      WHERE id IN (${cardIds.map(() => '?').join(',')})
    `, cardIds);
    
    return {
      success: true,
      cardCodes: cards.map(card => card.code),
      message: '卡密分配成功'
    };
    
  } catch (error) {
    console.error('分配卡密失败:', error);
    return {
      success: false,
      message: '分配卡密失败'
    };
  }
}

/**
 * 获取卡密可售库存（直接从卡密表统计）
 * @param {Array<number>} productIds 商品ID数组
 * @returns {Promise<Object>} {productId: cardAvailableStock} 的映射对象
 */
async function getCardAvailableStock(productIds) {
  if (!productIds || productIds.length === 0) {
    return {};
  }
  
  try {
    const result = {};
    
    for (const productId of productIds) {
      // 获取商品价格
      const product = await query(
        'SELECT price FROM products WHERE id = ?',
        [productId]
      );
      
      if (!product || product.length === 0) {
        result[productId] = 0;
        continue;
      }
      
      const productPrice = product[0].price;
      
      // 统计该价格档位的未使用卡密数量
      const cardCount = await query(`
        SELECT COUNT(*) as count 
        FROM card_codes 
        WHERE price = ? AND status = 'unused'
      `, [productPrice]);
      
      result[productId] = parseInt(cardCount[0]?.count || 0, 10);
    }
    
    return result;
    
  } catch (error) {
    console.error('获取卡密可售库存失败:', error);
    return {};
  }
}

module.exports = {
  getAvailableStock,
  getBatchAvailableStock,
  getCardAvailableStock,
  createReservation,
  confirmReservation,
  cleanupExpiredReservations,
  assignCardCodes
};
