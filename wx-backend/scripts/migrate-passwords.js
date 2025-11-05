#!/usr/bin/env node

/**
 * 密码迁移工具
 * 将数据库中的明文密码批量转换为bcrypt哈希密码
 * 此脚本应运行一次，用于升级现有账户的安全性
 */

const bcrypt = require('bcryptjs');
const { query } = require('../src/config/database');

async function migratePasswords() {
  console.log('🔐 开始密码迁移...');

  try {
    // 1. 获取所有用户
    const users = await query('SELECT id, username, password FROM users WHERE role = ?', ['admin']);

    if (users.length === 0) {
      console.log('ℹ️ 没有找到需要迁移的管理员账户');
      return;
    }

    console.log(`📊 找到 ${users.length} 个用户账户`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 2. 逐个处理密码
    for (const user of users) {
      try {
        // 检查是否已经是哈希密码
        if (user.password && user.password.startsWith('$2a$')) {
          console.log(`⏭️ 用户 ${user.username} 已经是哈希密码，跳过`);
          skippedCount++;
          continue;
        }

        // 如果密码为空，跳过
        if (!user.password || user.password.trim() === '') {
          console.log(`⚠️ 用户 ${user.username} 密码为空，跳过`);
          skippedCount++;
          continue;
        }

        // 生成哈希密码
        console.log(`🔄 正在为用户 ${user.username} 生成哈希密码...`);
        const hashedPassword = await bcrypt.hash(user.password, 12);

        // 更新数据库
        await query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashedPassword, user.id]);

        console.log(`✅ 用户 ${user.username} 密码迁移成功`);
        migratedCount++;

      } catch (error) {
        console.error(`❌ 用户 ${user.username} 密码迁移失败:`, error.message);
        errorCount++;
      }
    }

    // 3. 输出结果
    console.log('\n📋 迁移结果统计:');
    console.log(`✅ 成功迁移: ${migratedCount} 个账户`);
    console.log(`⏭️ 跳过处理: ${skippedCount} 个账户`);
    console.log(`❌ 迁移失败: ${errorCount} 个账户`);
    console.log(`📊 总计处理: ${users.length} 个账户`);

    if (migratedCount > 0) {
      console.log('\n🎉 密码迁移完成！');
      console.log('💡 提示：');
      console.log('   - 所有明文密码已升级为bcrypt哈希');
      console.log('   - 现有用户下次登录时即可享受更安全的密码保护');
      console.log('   - 建议删除或备份此迁移脚本');
    } else {
      console.log('\nℹ️ 没有密码需要迁移');
    }

  } catch (error) {
    console.error('❌ 密码迁移过程中发生错误:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// 运行迁移
if (require.main === module) {
  console.log('⚠️ 警告：此操作将把数据库中的明文密码转换为哈希密码');
  console.log('⚠️ 建议先备份数据库后再运行此脚本');
  console.log('⚠️ 此操作不可逆！');

  // 询问用户确认
  process.stdout.write('\n❓ 确认要继续吗？(y/N): ');

  process.stdin.setEncoding('utf8');
  process.stdin.on('readable', () => {
    const chunk = process.stdin.read();
    if (chunk !== null) {
      const input = chunk.toString().trim().toLowerCase();
      if (input === 'y' || input === 'yes') {
        console.log('🚀 开始执行迁移...\n');
        migratePasswords();
      } else {
        console.log('❌ 操作已取消');
        process.exit(0);
      }
    }
  });
} else {
  module.exports = { migratePasswords };
}