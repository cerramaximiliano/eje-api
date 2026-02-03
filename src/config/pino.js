const pino = require('pino');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../logs/logger.log');

// Ensure logs directory exists
const logsDir = path.dirname(logFilePath);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const streams = [
  { stream: process.stdout },
  { stream: fs.createWriteStream(logFilePath, { flags: 'a' }) }
];

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'eje-api' },
    timestamp: pino.stdTimeFunctions.isoTime
  },
  pino.multistream(streams)
);

/**
 * Clean logs file if it exceeds maxSize
 */
function cleanLogs(maxSize = 10 * 1024 * 1024) {
  try {
    if (fs.existsSync(logFilePath)) {
      const stats = fs.statSync(logFilePath);
      if (stats.size > maxSize) {
        fs.truncateSync(logFilePath, 0);
        logger.info('Log file cleaned due to size limit');
      }
    }
  } catch (error) {
    console.error('Error cleaning logs:', error);
  }
}

module.exports = { logger, cleanLogs };
