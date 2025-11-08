-- 允许 orders 表的 address_id 字段为空
-- 适用于移除地址功能后的虚拟商品订单

ALTER TABLE orders MODIFY COLUMN address_id INT NULL;

-- 添加注释说明
ALTER TABLE orders MODIFY COLUMN address_id INT NULL COMMENT '收货地址ID（虚拟商品可为空）';