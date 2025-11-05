# 密码安全升级指南

## 📋 概述

本项目的密码系统已升级为使用 bcrypt 哈希加密，提供了更高的安全性。以下是升级说明和使用方法。

## 🔒 安全改进

### 之前的安全问题
- 密码以明文形式存储在数据库中
- 数据库泄露将导致所有密码直接暴露
- 没有密码强度验证

### 现在的安全特性
- 使用 bcrypt 进行密码哈希（salt rounds = 12）
- 支持平滑迁移：自动兼容现有明文密码
- 首次登录时自动升级明文密码为哈希密码
- 密码长度要求至少6位
- 前后端双重验证

## 🚀 快速开始

### 选项 1：自动迁移（推荐）
系统会在用户首次登录时自动升级密码为哈希格式，无需手动操作。

### 选项 2：批量迁移
如需立即升级所有密码，可运行迁移脚本：

```bash
# 进入项目目录
cd wx-backend

# 运行迁移脚本
node scripts/migrate-passwords.js
```

**⚠️ 重要提醒：**
- 运行前请先备份数据库
- 此操作不可逆
- 建议在维护时间执行

## 🔧 技术实现

### 登录逻辑
```javascript
// 支持兼容明文和哈希密码验证
if (user.password.startsWith('$2a$')) {
  // 使用 bcrypt 验证哈希密码
  isValidPassword = await bcrypt.compare(password, user.password);
} else {
  // 兼容旧的明文密码
  isValidPassword = user.password === password;
  // 自动升级为哈希密码
  if (isValidPassword) {
    const hashedPassword = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
  }
}
```

### 密码修改逻辑
- 验证当前密码（支持明文和哈希）
- 新密码必须至少6位
- 自动使用 bcrypt 哈希存储新密码

## 📊 状态检查

### 检查密码状态
```sql
-- 查看哪些账户仍使用明文密码
SELECT id, username,
       CASE
         WHEN password LIKE '$2a$%' THEN 'Hashed'
         ELSE 'Plain Text'
       END as password_type
FROM users
WHERE role = 'admin';
```

## 🛡️ 安全建议

1. **立即执行迁移**：建议尽快运行迁移脚本升级所有密码
2. **密码策略**：鼓励用户使用强密码（包含大小写字母、数字、特殊字符）
3. **定期审计**：定期检查密码安全状态
4. **备份数据**：保持定期数据库备份习惯

## 🔄 版本兼容性

- **向后兼容**：现有用户的明文密码仍可正常登录
- **自动升级**：首次登录后自动升级为安全密码
- **新用户**：新注册用户直接使用哈希密码

## 📞 支持

如果在迁移过程中遇到问题，请：

1. 检查数据库连接是否正常
2. 确认 bcryptjs 包已正确安装
3. 查看控制台错误信息
4. 如有必要，可从数据库备份恢复

---

**最后更新：** 2025-01-05
**版本：** 1.0.0