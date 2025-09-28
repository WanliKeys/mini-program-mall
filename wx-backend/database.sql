-- 小程序商城数据库初始化脚本
-- 创建数据库
CREATE DATABASE IF NOT EXISTS mall_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mall_db;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  openid VARCHAR(50) UNIQUE NOT NULL COMMENT '微信openid',
  nickname VARCHAR(100) DEFAULT NULL COMMENT '昵称',
  avatar VARCHAR(500) DEFAULT NULL COMMENT '头像',
  phone VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  gender TINYINT DEFAULT 0 COMMENT '性别 0-未知 1-男 2-女',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 商品分类表
CREATE TABLE IF NOT EXISTS categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '分类名称',
  icon VARCHAR(500) DEFAULT NULL COMMENT '分类图标',
  sort_order INT DEFAULT 0 COMMENT '排序',
  status TINYINT DEFAULT 1 COMMENT '状态 0-禁用 1-启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品分类表';

-- 商品表
CREATE TABLE IF NOT EXISTS products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category_id INT NOT NULL COMMENT '分类ID',
  name VARCHAR(200) NOT NULL COMMENT '商品名称',
  description TEXT COMMENT '商品描述',
  image VARCHAR(500) NOT NULL COMMENT '商品主图',
  images JSON COMMENT '商品图片集',
  price DECIMAL(10,2) NOT NULL COMMENT '价格',
  original_price DECIMAL(10,2) DEFAULT NULL COMMENT '原价',
  stock INT DEFAULT 0 COMMENT '库存',
  sales INT DEFAULT 0 COMMENT '销量',
  card_price DECIMAL(10,2) DEFAULT NULL COMMENT '卡密价格',
  card_stock INT DEFAULT 0 COMMENT '卡密库存',
  status TINYINT DEFAULT 1 COMMENT '状态 0-下架 1-上架',
  tags JSON COMMENT '标签',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX idx_category (category_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表';

-- 购物车表
CREATE TABLE IF NOT EXISTS cart (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  product_id INT NOT NULL COMMENT '商品ID',
  quantity INT NOT NULL DEFAULT 1 COMMENT '数量',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_product (user_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='购物车表';

-- 收货地址表
CREATE TABLE IF NOT EXISTS addresses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  name VARCHAR(50) NOT NULL COMMENT '收货人姓名',
  phone VARCHAR(20) NOT NULL COMMENT '联系电话',
  province VARCHAR(20) NOT NULL COMMENT '省份',
  city VARCHAR(20) NOT NULL COMMENT '城市',
  district VARCHAR(20) NOT NULL COMMENT '区县',
  detail VARCHAR(200) NOT NULL COMMENT '详细地址',
  tag VARCHAR(20) DEFAULT '家' COMMENT '地址标签：家、公司、学校',
  is_default TINYINT DEFAULT 0 COMMENT '是否默认地址',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='收货地址表';

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(50) UNIQUE NOT NULL COMMENT '订单号',
  user_id INT NOT NULL COMMENT '用户ID',
  address_id INT NOT NULL COMMENT '收货地址ID',
  total_amount DECIMAL(10,2) NOT NULL COMMENT '订单总金额',
  payment_method VARCHAR(20) DEFAULT 'wechat' COMMENT '支付方式',
  status ENUM('pending', 'paid', 'shipped', 'completed', 'cancelled') DEFAULT 'pending' COMMENT '订单状态',
  remark TEXT COMMENT '备注',
  external_order_no VARCHAR(100) DEFAULT NULL COMMENT '外部订单号',
  source ENUM('direct', 'external') DEFAULT 'direct' COMMENT '订单来源',
  external_source VARCHAR(50) DEFAULT NULL COMMENT '外部来源平台',
  card_code_id INT DEFAULT NULL COMMENT '分配的卡密ID',
  reservation_id INT DEFAULT NULL COMMENT '预分配ID',
  paid_at TIMESTAMP NULL COMMENT '支付时间',
  shipped_at TIMESTAMP NULL COMMENT '发货时间',
  completed_at TIMESTAMP NULL COMMENT '完成时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (address_id) REFERENCES addresses(id),
  FOREIGN KEY (card_code_id) REFERENCES card_codes(id),
  FOREIGN KEY (reservation_id) REFERENCES product_reservations(id),
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_source (source),
  INDEX idx_external_order (external_order_no),
  INDEX idx_card_code (card_code_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

-- 订单商品表
CREATE TABLE IF NOT EXISTS order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL COMMENT '订单ID',
  product_id INT NOT NULL COMMENT '商品ID',
  product_name VARCHAR(200) NOT NULL COMMENT '商品名称',
  product_image VARCHAR(500) NOT NULL COMMENT '商品图片',
  product_price DECIMAL(10,2) NOT NULL COMMENT '商品价格',
  quantity INT NOT NULL COMMENT '购买数量',
  subtotal DECIMAL(10,2) NOT NULL COMMENT '小计',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单商品表';

-- 支付记录表
CREATE TABLE IF NOT EXISTS payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL COMMENT '订单ID',
  payment_no VARCHAR(50) UNIQUE NOT NULL COMMENT '支付流水号',
  amount DECIMAL(10,2) NOT NULL COMMENT '支付金额',
  payment_method VARCHAR(20) NOT NULL COMMENT '支付方式',
  transaction_id VARCHAR(100) DEFAULT NULL COMMENT '第三方交易号',
  status ENUM('pending', 'success', 'failed', 'refunded') DEFAULT 'pending' COMMENT '支付状态',
  paid_at TIMESTAMP NULL COMMENT '支付时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  INDEX idx_order (order_id),
  INDEX idx_payment_no (payment_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付记录表';

-- 引流跟踪表
CREATE TABLE IF NOT EXISTS referral_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT DEFAULT NULL COMMENT '用户ID',
  external_order_no VARCHAR(100) NOT NULL COMMENT '外部订单号',
  source_platform VARCHAR(50) NOT NULL COMMENT '来源平台',
  product_id INT DEFAULT NULL COMMENT '商品ID',
  action_type ENUM('visit', 'add_cart', 'order', 'payment') NOT NULL COMMENT '行为类型',
  ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP地址',
  user_agent TEXT DEFAULT NULL COMMENT '用户代理',
  extra_data JSON DEFAULT NULL COMMENT '额外数据',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_external_order (external_order_no),
  INDEX idx_source (source_platform),
  INDEX idx_action (action_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='引流跟踪表';

-- 卡密表
CREATE TABLE IF NOT EXISTS card_codes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(100) NOT NULL UNIQUE COMMENT '卡密内容',
  price DECIMAL(10,2) NOT NULL COMMENT '对应价格',
  status ENUM('unused', 'shipped') DEFAULT 'unused' COMMENT '状态：未使用、已发货',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_price (price),
  INDEX idx_status (status),
  INDEX idx_price_status (price, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='卡密表';

-- 商品预分配表
CREATE TABLE IF NOT EXISTS product_reservations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL COMMENT '商品ID',
  user_id INT DEFAULT NULL COMMENT '用户ID',
  quantity INT NOT NULL COMMENT '预分配数量',
  expires_at TIMESTAMP NOT NULL COMMENT '过期时间',
  status ENUM('reserved', 'confirmed', 'expired') DEFAULT 'reserved' COMMENT '状态：预分配、已确认、已过期',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_expires (expires_at),
  INDEX idx_product (product_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品预分配表';

-- 引流链接表
CREATE TABLE IF NOT EXISTS referral_links (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL COMMENT '商品ID',
  link_code VARCHAR(50) UNIQUE NOT NULL COMMENT '链接码',
  status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_product (product_id),
  INDEX idx_link_code (link_code),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='引流链接表';

-- 引流订单表
CREATE TABLE IF NOT EXISTS referral_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  referral_link_id INT NOT NULL COMMENT '引流链接ID',
  partner_order_no VARCHAR(100) NOT NULL COMMENT '引流方订单号',
  notify_url VARCHAR(500) NOT NULL COMMENT '通知地址',
  our_order_id INT DEFAULT NULL COMMENT '我们的订单ID',
  status ENUM('pending', 'paid', 'failed') DEFAULT 'pending' COMMENT '状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (referral_link_id) REFERENCES referral_links(id) ON DELETE CASCADE,
  FOREIGN KEY (our_order_id) REFERENCES orders(id) ON DELETE SET NULL,
  INDEX idx_referral_link (referral_link_id),
  INDEX idx_partner_order (partner_order_no),
  INDEX idx_our_order (our_order_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='引流订单表';

-- 插入初始数据
-- 商品分类
INSERT INTO categories (name, icon, sort_order) VALUES
('数码产品', '/images/icons/digital.png', 1),
('服装鞋帽', '/images/icons/clothing.png', 2),
('家居用品', '/images/icons/home.png', 3),
('美食零食', '/images/icons/food.png', 4),
('运动户外', '/images/icons/sports.png', 5),
('美妆护肤', '/images/icons/beauty.png', 6),
('母婴用品', '/images/icons/baby.png', 7),
('图书文具', '/images/icons/books.png', 8);

-- 示例商品
INSERT INTO products (category_id, name, description, image, images, price, original_price, stock, tags) VALUES
(1, 'iPhone 15 Pro Max 512GB', '最新iPhone，搭载A17 Pro芯片，钛金属边框', '/images/products/iphone.jpg', '[]', 9999.00, 10999.00, 50, '["热销", "新品"]'),
(1, 'MacBook Pro 16英寸', '专业级笔记本电脑，M3 Max芯片，36GB内存', '/images/products/macbook.jpg', '[]', 16999.00, 18999.00, 30, '["专业"]'),
(1, 'AirPods Pro 第三代', '主动降噪无线耳机，空间音频', '/images/products/airpods.jpg', '[]', 1999.00, NULL, 100, '["降噪"]'),
(1, 'iPad Air 第五代', '轻薄便携平板电脑，M1芯片', '/images/products/ipad.jpg', '[]', 4599.00, NULL, 80, '["轻薄"]'),
(2, '纯棉休闲T恤', '100%纯棉材质，舒适透气', '/images/products/tshirt.jpg', '[]', 199.00, 299.00, 200, '["舒适", "透气"]'),
(2, '运动休闲鞋', '轻便舒适运动鞋，适合日常穿着', '/images/products/shoes.jpg', '[]', 899.00, NULL, 150, '["舒适"]'),
(2, '经典牛仔裤', '经典款牛仔裤，百搭时尚', '/images/products/jeans.jpg', '[]', 459.00, NULL, 120, '["经典"]'),
(3, '真空保温杯', '24小时保温，食品级304不锈钢', '/images/products/cup.jpg', '[]', 129.00, NULL, 300, '["保温"]'),
(3, '蓝牙音箱', '高品质音效，防水设计', '/images/products/speaker.jpg', '[]', 299.00, NULL, 100, '["音质"]'),
(4, '进口巧克力礼盒', '比利时进口巧克力，多种口味', '/images/products/chocolate.jpg', '[]', 89.00, NULL, 80, '["进口", "甜品"]'),
(4, '混合坚果礼盒', '健康零食，多种坚果组合', '/images/products/nuts.jpg', '[]', 199.00, NULL, 150, '["健康"]');
