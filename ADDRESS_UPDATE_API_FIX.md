# 🔧 地址更新API字段名不匹配问题修复

## 🎯 **问题描述**

用户反馈：编辑地址保存时报错"收件人信息不完整"，后端返回400 Bad Request。

**错误日志：**
```
PUT http://localhost:3000/api/addresses/17 400 (Bad Request)
保存地址失败: Error: 收件人信息不完整
```

## 🔍 **问题分析**

### **根本原因：**
后端地址更新API（PUT `/api/addresses/:id`）使用的字段名与前端发送的字段名不匹配。

### **具体问题：**

#### **1. 字段名不匹配**
```javascript
// 前端发送的字段名
{
  "name": "李万里",
  "phone": "18751889124", 
  "province": "北京市",
  "city": "北京市",
  "district": "东城区",
  "detail": "水电费水电费水电费",
  "is_default": 1
}

// 后端期望的字段名（错误）
{
  "receiver_name": "...",
  "receiver_phone": "...",
  "detail_address": "..."
}
```

#### **2. 验证逻辑失效**
```javascript
// 后端验证（错误）
if (!receiver_name || !receiver_phone || !province || !city || !district || !detail_address) {
  return error(res, '收件人信息不完整', 400);
}
```

#### **3. SQL更新语句错误**
```sql
-- 错误的字段名
UPDATE addresses SET 
  receiver_name = ?, receiver_phone = ?, province = ?, city = ?, district = ?,
  detail_address = ?, is_default = ?, updated_at = NOW()
 WHERE id = ? AND user_id = ?
```

## ✅ **修复内容**

### **1. 统一字段名**
```javascript
// backend/src/routes/addresses.js
const {
  name,        // 统一使用 name
  phone,       // 统一使用 phone  
  province,
  city,
  district,
  detail,      // 统一使用 detail
  is_default = 0
} = req.body;
```

### **2. 修复验证逻辑**
```javascript
// 验证必填字段
if (!name || !phone || !province || !city || !district || !detail) {
  return error(res, '收件人信息不完整', 400);
}

// 验证手机号格式
const phoneRegex = /^1[3-9]\d{9}$/;
if (!phoneRegex.test(phone)) {
  return error(res, '手机号格式不正确', 400);
}
```

### **3. 修复SQL更新语句**
```sql
-- 正确的字段名
UPDATE addresses SET 
  name = ?, phone = ?, province = ?, city = ?, district = ?,
  detail = ?, is_default = ?, updated_at = NOW()
 WHERE id = ? AND user_id = ?
```

### **4. 修复数组解构问题**
```javascript
// 修复前（错误）
const [addresses] = await query(...);
const [updatedAddress] = await query(...);

// 修复后（正确）
const addresses = await query(...);
const updatedAddresses = await query(...);
```

## 🧪 **测试验证**

### **API测试结果：**
```bash
curl -X PUT http://localhost:3000/api/addresses/11 \
  -H "Authorization: Bearer ..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "李万里",
    "phone": "18751889124",
    "province": "北京市",
    "city": "北京市", 
    "district": "东城区",
    "detail": "水电费水电费水电费",
    "is_default": 1
  }'
```

**响应：**
```json
{
  "success": true,
  "code": 200,
  "message": "地址更新成功",
  "data": {
    "id": 11,
    "user_id": 32,
    "name": "李万里",
    "phone": "18751889124",
    "province": "北京市",
    "city": "北京市",
    "district": "东城区",
    "detail": "水电费水电费水电费",
    "is_default": 1,
    "created_at": "2025-09-17T02:41:20.000Z",
    "updated_at": "2025-09-17T03:12:00.000Z"
  }
}
```

## 📱 **前端测试步骤**

1. **重新编译小程序**
2. **进入确认订单页面**
3. **点击地址选择弹窗中的编辑按钮**
4. **修改地址信息**
5. **点击"保存修改"按钮**
6. **应该成功保存并返回上一页**

## 🔄 **数据流程**

### **修复前：**
```
前端发送: {name, phone, detail, ...}
        ↓
后端接收: {receiver_name, receiver_phone, detail_address, ...}
        ↓
字段名不匹配 ❌
        ↓
验证失败: "收件人信息不完整"
```

### **修复后：**
```
前端发送: {name, phone, detail, ...}
        ↓
后端接收: {name, phone, detail, ...}
        ↓
字段名匹配 ✅
        ↓
验证通过 ✅
        ↓
更新成功 ✅
```

## 💡 **预防措施**

1. **字段名规范** - 前后端使用统一的字段命名规范
2. **API文档** - 维护清晰的API接口文档
3. **类型检查** - 使用TypeScript或JSDoc进行类型检查
4. **测试覆盖** - 为所有API接口编写测试用例

---

**现在地址编辑保存应该正常工作了！** 🚀
