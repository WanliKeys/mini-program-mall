-- 管理员系统数据库表结构
-- 在现有数据库基础上添加管理员相关字段和表

-- 1. 为用户表添加角色字段
ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') DEFAULT 'user' COMMENT '用户角色';

-- 2. 创建轮播图表
CREATE TABLE IF NOT EXISTS banners (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL COMMENT '轮播图标题',
  image VARCHAR(500) NOT NULL COMMENT '轮播图图片',
  link VARCHAR(500) DEFAULT NULL COMMENT '跳转链接',
  sort_order INT DEFAULT 0 COMMENT '排序',
  status TINYINT DEFAULT 1 COMMENT '状态 0-禁用 1-启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='轮播图表';

-- 3. 创建管理员操作日志表
CREATE TABLE IF NOT EXISTS admin_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admin_id INT NOT NULL COMMENT '管理员ID',
  action VARCHAR(100) NOT NULL COMMENT '操作类型',
  target_type VARCHAR(50) NOT NULL COMMENT '目标类型',
  target_id INT DEFAULT NULL COMMENT '目标ID',
  description TEXT COMMENT '操作描述',
  ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP地址',
  user_agent TEXT DEFAULT NULL COMMENT '用户代理',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_admin (admin_id),
  INDEX idx_action (action),
  INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员操作日志表';

-- 4. 插入默认管理员用户（密码为 admin123）
-- 注意：这里使用模拟的openid，实际使用时需要替换为真实的管理员openid
INSERT INTO users (openid, nickname, role) VALUES 
('admin_mock_openid_001', '系统管理员', 'admin')
ON DUPLICATE KEY UPDATE role = 'admin';

-- 5. 插入示例轮播图数据
INSERT INTO banners (title, image, link, sort_order, status) VALUES
('iPhone 15 Pro Max 新品上市', '/uploads/images/banners/iphone-banner.jpg', '/pages/product/detail/detail?id=1', 1, 1),
('MacBook Pro 限时优惠', '/uploads/images/banners/macbook-banner.jpg', '/pages/product/detail/detail?id=2', 2, 1),
('秋季新品大促销', '/uploads/images/banners/sale-banner.jpg', '/pages/category/category?categoryId=2', 3, 1);

-- 6. 为商品表添加更多字段（如果需要）
-- ALTER TABLE products ADD COLUMN seo_title VARCHAR(200) DEFAULT NULL COMMENT 'SEO标题';
-- ALTER TABLE products ADD COLUMN seo_description TEXT DEFAULT NULL COMMENT 'SEO描述';
-- ALTER TABLE products ADD COLUMN weight DECIMAL(8,2) DEFAULT NULL COMMENT '重量(kg)';
-- ALTER TABLE products ADD COLUMN dimensions VARCHAR(100) DEFAULT NULL COMMENT '尺寸';

-- 7. 为分类表添加更多字段（如果需要）
-- ALTER TABLE categories ADD COLUMN description TEXT DEFAULT NULL COMMENT '分类描述';
-- ALTER TABLE categories ADD COLUMN seo_title VARCHAR(200) DEFAULT NULL COMMENT 'SEO标题';
-- ALTER TABLE categories ADD COLUMN seo_description TEXT DEFAULT NULL COMMENT 'SEO描述';
