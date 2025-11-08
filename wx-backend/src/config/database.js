const mysql = require('mysql2/promise');
require('dotenv').config();

// 数据库连接配置
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mall_db',
  charset: 'utf8mb4',
  timezone: '+08:00',
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建连接池
const pool = mysql.createPool(config);

// 测试数据库连接
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ 数据库连接成功');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    return false;
  }
};

// 初始化管理员相关表结构与默认账号
const ensureAdminSetup = async () => {
  const dbName = process.env.DB_NAME || 'mall_db';
  try {
    // 检查并添加 username 字段
    const usernameCol = await query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'`,
      [dbName]
    );
    if ((usernameCol[0]?.c || 0) === 0) {
      console.log('🛠️ 正在为 users 表添加 username 字段...');
      await query(`ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL UNIQUE COMMENT '用户名'`);
    }

    // 检查并添加 password 字段
    const passwordCol = await query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password'`,
      [dbName]
    );
    if ((passwordCol[0]?.c || 0) === 0) {
      console.log('🛠️ 正在为 users 表添加 password 字段...');
      await query(`ALTER TABLE users ADD COLUMN password VARCHAR(100) NULL COMMENT '密码(开发环境明文)'`);
    }

    // 检查并添加 role 字段
    const roleCol = await query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
      [dbName]
    );
    if ((roleCol[0]?.c || 0) === 0) {
      console.log('🛠️ 正在为 users 表添加 role 字段...');
      await query(`ALTER TABLE users ADD COLUMN role ENUM('user','admin') DEFAULT 'user' COMMENT '用户角色'`);
    }

    // 确保默认管理员账号存在
    console.log('🔐 检查/创建默认管理员账号 admin ...');
    // users.openid 为 NOT NULL，因此插入时提供一个固定的 mock openid
    await query(
      `INSERT INTO users (openid, username, password, role, nickname)
       VALUES ('admin_mock_openid_001', 'admin', 'admin123', 'admin', '系统管理员')
       ON DUPLICATE KEY UPDATE role = 'admin'`
    );

    console.log('✅ 管理员初始化完成');

    // 检查并更新 orders 表的 address_id 字段允许为空（支持虚拟商品）
    try {
      const addressCol = await query(
        `SELECT IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'orders'
         AND COLUMN_NAME = 'address_id'`
      );

      if (addressCol.length > 0 && addressCol[0].IS_NULLABLE === 'NO') {
        console.log('🔧 正在更新 orders 表，允许 address_id 字段为空（支持虚拟商品）...');
        await query('ALTER TABLE orders MODIFY COLUMN address_id INT NULL COMMENT "收货地址ID（虚拟商品可为空）"');
        console.log('✅ orders 表 address_id 字段已更新为可空');
      }
    } catch (e) {
      console.warn('更新 orders 表 address_id 字段失败（可能已更新）:', e.message || e);
    }
  } catch (e) {
    console.error('管理员初始化失败:', e.message || e);
  }
};

// 执行SQL查询（统一使用 query，避免部分驱动在 execute 下的限制）
const query = async (sql, params = []) => {
  const shouldDebug = process.env.DEBUG_SQL === '1' || process.env.DEBUG_SQL === 'true';
  if (shouldDebug) {
    console.log('[SQL] ->', sql.trim().replace(/\s+/g, ' '));
    if (params && params.length > 0) console.log('[SQL params] ->', JSON.stringify(params));
  }
  try {
    const [rows] = await pool.query(sql, params);
    if (shouldDebug) {
      console.log('[SQL rows] ->', Array.isArray(rows) ? rows.length : typeof rows);
    }
    return rows;
  } catch (error) {
    console.error('SQL执行错误:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    console.error('[Failed SQL] ->', sql);
    if (params && params.length > 0) console.error('[Failed SQL params] ->', JSON.stringify(params));
    throw error;
  }
};

// 开始事务
const beginTransaction = async () => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
};

// 提交事务
const commit = async (connection) => {
  await connection.commit();
  connection.release();
};

// 回滚事务
const rollback = async (connection) => {
  await connection.rollback();
  connection.release();
};

module.exports = {
  pool,
  query,
  testConnection,
  ensureAdminSetup,
  beginTransaction,
  commit,
  rollback
};
