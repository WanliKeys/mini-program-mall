# PM2 日志轮转配置指南

## 1. 安装日志轮转模块

```bash
pm2 install pm2-logrotate
```

## 2. 配置命令（按日期保留30天）

```bash
# 按日期轮转（每天凌晨0点切割）
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

# 保留30天的日志
pm2 set pm2-logrotate:retain 30

# 日期格式后缀（如 app-out-2025-11-28.log）
pm2 set pm2-logrotate:dateFormat 'YYYY-MM-DD'

# 启用压缩（节省磁盘空间）
pm2 set pm2-logrotate:compress true

# 单个日志文件最大10MB（超过也会触发轮转）
pm2 set pm2-logrotate:max_size 10M

# 立即轮转当前日志（可选，用于测试）
pm2 set pm2-logrotate:rotateModule true
```

## 3. 查看当前配置

```bash
pm2 conf pm2-logrotate
```

## 4. 日志文件位置

默认路径：`~/.pm2/logs/`

轮转后效果：
```
~/.pm2/logs/
├── wx-backend-out.log              # 当前日志
├── wx-backend-error.log            # 当前错误日志
├── wx-backend-out-2025-11-27.log.gz  # 昨天（压缩）
├── wx-backend-out-2025-11-26.log.gz  # 前天（压缩）
├── ...
└── wx-backend-out-2025-10-29.log.gz  # 30天前（之后自动删除）
```

## 5. 常用 PM2 日志命令

```bash
# 查看实时日志
pm2 logs

# 查看特定应用日志
pm2 logs wx-backend

# 只看最近100行
pm2 logs --lines 100

# 清空所有日志
pm2 flush

# 查看应用信息（含日志路径）
pm2 info wx-backend
```

## 6. rotateInterval 时间格式说明（cron格式）

| 配置 | 说明 |
|------|------|
| `'0 0 * * *'` | 每天凌晨0点 |
| `'0 */12 * * *'` | 每12小时 |
| `'0 0 * * 0'` | 每周日凌晨 |
| `'0 0 1 * *'` | 每月1号凌晨 |

## 7. 一键配置脚本

将以下内容保存为 `setup-logrotate.sh` 并执行：

```bash
#!/bin/bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:dateFormat 'YYYY-MM-DD'
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:max_size 10M
echo "日志轮转配置完成！"
pm2 conf pm2-logrotate
```

执行：
```bash
chmod +x setup-logrotate.sh
./setup-logrotate.sh
```
