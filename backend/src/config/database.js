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

// 执行SQL查询
const query = async (sql, params = []) => {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error('SQL执行错误:', error);
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
  beginTransaction,
  commit,
  rollback
};
