const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// 日志文件路径
const logDir = '/var/log/mall';
const logFile = path.join(logDir, 'referral-jump.log');

// 确保日志目录存在
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * 接收H5跳转日志
 * POST /api/log/jump
 */
router.post('/jump', (req, res) => {
  try {
    const { timestamp, userAgent, log } = req.body;

    const logEntry = {
      timestamp: timestamp || new Date().toISOString(),
      userAgent: userAgent || 'unknown',
      log: log || 'empty log',
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    };

    // 写入日志文件
    const logLine = `[${logEntry.timestamp}] ${logEntry.ip} ${logEntry.userAgent} | ${logEntry.log}\n`;

    // 同步写入文件
    try {
      fs.appendFileSync(logFile, logLine, 'utf8');
    } catch (fileErr) {
      console.error('写入日志文件失败:', fileErr);
    }

    console.log('引流跳转日志:', logEntry);

    res.json({
      success: true,
      message: '日志已记录',
      data: logEntry
    });

  } catch (error) {
    console.error('处理跳转日志失败:', error);
    res.status(500).json({
      success: false,
      message: '日志记录失败',
      error: error.message
    });
  }
});

/**
 * 获取跳转日志
 * GET /api/log/jump
 */
router.get('/jump', (req, res) => {
  try {
    const lines = req.query.lines || 50;
    const command = `tail -n ${lines} ${logFile}`;

    require('child_process').exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('读取日志失败:', error);
        res.status(500).json({
          success: false,
          message: '读取日志失败',
          error: error.message
        });
        return;
      }

      const logs = stdout.trim().split('\n').filter(line => line.trim());

      res.json({
        success: true,
        message: '获取日志成功',
        data: logs
      });
    });

  } catch (error) {
    console.error('获取日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取日志失败',
      error: error.message
    });
  }
});

module.exports = router;