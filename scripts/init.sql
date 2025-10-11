-- 商城数据库初始化脚本
-- 此脚本会在MySQL容器首次启动时自动执行

-- 设置字符集
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 创建数据库 (如果不存在)
CREATE DATABASE IF NOT EXISTS mall_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE mall_db;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    openid VARCHAR(100) UNIQUE NOT NULL COMMENT '微信openid',
    nickname VARCHAR(100) DEFAULT '' COMMENT '昵称',
    avatar_url VARCHAR(500) DEFAULT '' COMMENT '头像URL',
    phone VARCHAR(20) DEFAULT '' COMMENT '手机号',
    gender TINYINT DEFAULT 0 COMMENT '性别 0未知 1男 2女',
    city VARCHAR(50) DEFAULT '' COMMENT '城市',
    province VARCHAR(50) DEFAULT '' COMMENT '省份',
    country VARCHAR(50) DEFAULT '' COMMENT '国家',
    status TINYINT DEFAULT 1 COMMENT '状态 0禁用 1正常',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_openid (openid),
    INDEX idx_phone (phone),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 地址表
CREATE TABLE IF NOT EXISTS addresses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '用户ID',
    contact_name VARCHAR(50) NOT NULL COMMENT '联系人姓名',
    contact_phone VARCHAR(20) NOT NULL COMMENT '联系人电话',
    province VARCHAR(50) NOT NULL COMMENT '省份',
    city VARCHAR(50) NOT NULL COMMENT '城市',
    district VARCHAR(50) NOT NULL COMMENT '区县',
    detail_address VARCHAR(200) NOT NULL COMMENT '详细地址',
    postal_code VARCHAR(10) DEFAULT '' COMMENT '邮政编码',
    is_default TINYINT DEFAULT 0 COMMENT '是否默认地址 0否 1是',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_is_default (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地址表';

-- 商品分类表
CREATE TABLE IF NOT EXISTS categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '分类名称',
    icon_url VARCHAR(500) DEFAULT '' COMMENT '分类图标URL',
    sort_order INT DEFAULT 0 COMMENT '排序顺序',
    parent_id INT DEFAULT 0 COMMENT '父分类ID 0为顶级分类',
    status TINYINT DEFAULT 1 COMMENT '状态 0禁用 1启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_parent_id (parent_id),
    INDEX idx_sort_order (sort_order),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品分类表';

-- 商品表
CREATE TABLE IF NOT EXISTS products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL COMMENT '商品名称',
    description TEXT COMMENT '商品描述',
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '商品价格',
    original_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '原价',
    cost_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '成本价',
    stock INT DEFAULT 0 COMMENT '库存数量',
    sales INT DEFAULT 0 COMMENT '销售数量',
    category_id INT NOT NULL COMMENT '分类ID',
    images JSON COMMENT '商品图片列表',
    specs JSON COMMENT '商品规格信息',
    status TINYINT DEFAULT 1 COMMENT '状态 0下架 1上架',
    sort_order INT DEFAULT 0 COMMENT '排序顺序',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    INDEX idx_category_id (category_id),
    INDEX idx_status (status),
    INDEX idx_sort_order (sort_order),
    INDEX idx_price (price),
    INDEX idx_sales (sales),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品表';

-- 购物车表
CREATE TABLE IF NOT EXISTS cart_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '用户ID',
    product_id INT NOT NULL COMMENT '商品ID',
    quantity INT NOT NULL DEFAULT 1 COMMENT '数量',
    specs JSON COMMENT '选择的规格',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_product (user_id, product_id),
    INDEX idx_user_id (user_id),
    INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='购物车表';

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(50) UNIQUE NOT NULL COMMENT '订单号',
    user_id INT NOT NULL COMMENT '用户ID',
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '订单总金额',
    discount_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '优惠金额',
    actual_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '实付金额',
    status TINYINT DEFAULT 0 COMMENT '订单状态 0待付款 1待发货 2待收货 3已完成 4已取消',
    payment_status TINYINT DEFAULT 0 COMMENT '支付状态 0未支付 1已支付 2已退款',
    payment_method VARCHAR(20) DEFAULT '' COMMENT '支付方式',
    payment_time TIMESTAMP NULL COMMENT '支付时间',
    delivery_time TIMESTAMP NULL COMMENT '发货时间',
    receive_time TIMESTAMP NULL COMMENT '收货时间',
    remark VARCHAR(500) DEFAULT '' COMMENT '订单备注',
    address_info JSON COMMENT '收货地址信息',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_order_no (order_no),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_payment_status (payment_status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

-- 订单商品表
CREATE TABLE IF NOT EXISTS order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL COMMENT '订单ID',
    product_id INT NOT NULL COMMENT '商品ID',
    product_name VARCHAR(200) NOT NULL COMMENT '商品名称',
    product_image VARCHAR(500) DEFAULT '' COMMENT '商品图片',
    price DECIMAL(10,2) NOT NULL COMMENT '商品价格',
    quantity INT NOT NULL COMMENT '购买数量',
    total_price DECIMAL(10,2) NOT NULL COMMENT '小计金额',
    specs JSON COMMENT '商品规格',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_order_id (order_id),
    INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单商品表';

-- 支付记录表
CREATE TABLE IF NOT EXISTS payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL COMMENT '订单ID',
    payment_no VARCHAR(50) UNIQUE NOT NULL COMMENT '支付单号',
    amount DECIMAL(10,2) NOT NULL COMMENT '支付金额',
    payment_method VARCHAR(20) NOT NULL COMMENT '支付方式',
    third_party_no VARCHAR(100) DEFAULT '' COMMENT '第三方支付单号',
    status TINYINT DEFAULT 0 COMMENT '支付状态 0待支付 1成功 2失败 3已退款',
    callback_data JSON COMMENT '支付回调数据',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    INDEX idx_order_id (order_id),
    INDEX idx_payment_no (payment_no),
    INDEX idx_third_party_no (third_party_no),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付记录表';

-- 轮播图表
CREATE TABLE IF NOT EXISTS banners (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(100) NOT NULL COMMENT '轮播图标题',
    image_url VARCHAR(500) NOT NULL COMMENT '图片URL',
    link_url VARCHAR(500) DEFAULT '' COMMENT '跳转链接',
    link_type TINYINT DEFAULT 0 COMMENT '链接类型 0无 1商品 2分类 3外部链接',
    link_value VARCHAR(100) DEFAULT '' COMMENT '链接值',
    sort_order INT DEFAULT 0 COMMENT '排序顺序',
    status TINYINT DEFAULT 1 COMMENT '状态 0禁用 1启用',
    start_time TIMESTAMP NULL COMMENT '开始时间',
    end_time TIMESTAMP NULL COMMENT '结束时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sort_order (sort_order),
    INDEX idx_status (status),
    INDEX idx_start_time (start_time),
    INDEX idx_end_time (end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='轮播图表';

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    config_key VARCHAR(100) UNIQUE NOT NULL COMMENT '配置键',
    config_value TEXT COMMENT '配置值',
    config_desc VARCHAR(200) DEFAULT '' COMMENT '配置描述',
    config_type VARCHAR(20) DEFAULT 'string' COMMENT '配置类型',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- 插入默认数据

-- 默认商品分类
INSERT INTO categories (name, icon_url, sort_order, parent_id, status) VALUES
('数码电器', '', 1, 0, 1),
('服装鞋包', '', 2, 0, 1),
('家居生活', '', 3, 0, 1),
('美食生鲜', '', 4, 0, 1),
('个护美妆', '', 5, 0, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 默认轮播图
INSERT INTO banners (title, image_url, link_url, link_type, link_value, sort_order, status) VALUES
('商城首页', 'https://via.placeholder.com/750x300/ff6b35/ffffff?text=商城首页', '', 0, '', 1, 1),
('新品上市', 'https://via.placeholder.com/750x300/4CAF50/ffffff?text=新品上市', '', 0, '', 2, 1),
('限时优惠', 'https://via.placeholder.com/750x300/2196F3/ffffff?text=限时优惠', '', 0, '', 3, 1)
ON DUPLICATE KEY UPDATE title=VALUES(title);

-- 默认系统配置
INSERT INTO system_config (config_key, config_value, config_desc, config_type) VALUES
('site_name', '商城小程序', '网站名称', 'string'),
('site_logo', '', '网站Logo', 'string'),
('contact_phone', '400-000-0000', '客服电话', 'string'),
('contact_email', 'service@example.com', '客服邮箱', 'string'),
('company_address', '北京市朝阳区xxx街道xxx号', '公司地址', 'string'),
('shipping_fee', '10.00', '运费', 'decimal'),
('free_shipping_amount', '99.00', '免运费金额', 'decimal'),
('order_cancel_time', '30', '订单自动取消时间(分钟)', 'integer')
ON DUPLICATE KEY UPDATE config_value=VALUES(config_value);

-- 创建管理员账户 (如果需要管理员功能)
CREATE TABLE IF NOT EXISTS admins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL COMMENT '管理员用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码(加密)',
    real_name VARCHAR(50) DEFAULT '' COMMENT '真实姓名',
    email VARCHAR(100) DEFAULT '' COMMENT '邮箱',
    phone VARCHAR(20) DEFAULT '' COMMENT '手机号',
    role VARCHAR(20) DEFAULT 'admin' COMMENT '角色',
    status TINYINT DEFAULT 1 COMMENT '状态 0禁用 1启用',
    last_login_time TIMESTAMP NULL COMMENT '最后登录时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员表';

-- 插入默认管理员账户 (用户名: admin, 密码: admin123)
INSERT INTO admins (username, password, real_name, role, status) VALUES
('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '系统管理员', 'super_admin', 1)
ON DUPLICATE KEY UPDATE username=VALUES(username);

SET FOREIGN_KEY_CHECKS = 1;

-- 输出初始化完成信息
SELECT 'Database initialization completed successfully!' AS message;