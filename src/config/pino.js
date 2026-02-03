const pino = require('pino');
const path = require('path');
const moment = require("moment-timezone");
const filePath = path.join(__dirname, '../logs');
const fsPromises = require("fs").promises;
const fs = require("fs");

// Ensure logs directory exists
if (!fs.existsSync(filePath)) {
  fs.mkdirSync(filePath, { recursive: true });
}

const levels = {
    emerg: 80,
    alert: 70,
    crit: 60,
    error: 50,
    warn: 40,
    notice: 30,
    info: 20,
    debug: 10,
};

// Determinar nivel de log según entorno
// En producción: solo info y superiores (no debug)
// En desarrollo: todos los niveles incluyendo debug
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// En modo cluster de PM2, usar logger con formato personalizado para evitar conflictos con pino-pretty
const isClusterMode = process.env.NODE_APP_INSTANCE !== undefined || process.env.pm_id !== undefined;

let logger;

if (isClusterMode) {
    // Logger con formato personalizado para modo cluster (sin pino-pretty que causa conflictos)
    console.log(`[PINO CONFIG] Modo cluster, nivel: ${logLevel.toUpperCase()}`);

    // Determinar qué niveles mostrar según configuración
    const levelPriority = { debug: 10, info: 20, warn: 40, error: 50 };
    const minLevel = levelPriority[logLevel] || 20;

    // Wrapper simple que usa console.log directamente (PM2 captura la salida)
    // Usa hora Argentina para consistencia con el negocio
    logger = {
        info: (msg, ...args) => {
            if (minLevel <= 20) {
                const timestamp = moment().tz('America/Argentina/Buenos_Aires').format('DD-MM-YYYY HH:mm:ss');
                console.log(`[${timestamp}] INFO: ${msg}`, ...args);
            }
        },
        warn: (msg, ...args) => {
            if (minLevel <= 40) {
                const timestamp = moment().tz('America/Argentina/Buenos_Aires').format('DD-MM-YYYY HH:mm:ss');
                console.log(`[${timestamp}] WARN: ${msg}`, ...args);
            }
        },
        error: (msg, ...args) => {
            if (minLevel <= 50) {
                const timestamp = moment().tz('America/Argentina/Buenos_Aires').format('DD-MM-YYYY HH:mm:ss');
                console.error(`[${timestamp}] ERROR: ${msg}`, ...args);
            }
        },
        debug: (msg, ...args) => {
            // Solo mostrar debug si el nivel configurado lo permite
            if (minLevel <= 10) {
                const timestamp = moment().tz('America/Argentina/Buenos_Aires').format('DD-MM-YYYY HH:mm:ss');
                console.log(`[${timestamp}] DEBUG: ${msg}`, ...args);
            }
        }
    };
} else {
    // Logger completo con pino-pretty para modo fork
    console.log(`[PINO CONFIG] Modo fork, nivel: ${logLevel.toUpperCase()}`);
    logger = pino({
        level: logLevel,
        transport: {
            targets: [
                {
                    target: 'pino-pretty',
                    level: logLevel,
                    options: {
                        colorize: true,
                        translateTime: 'dd-mm-yyyy, HH:MM:ss',
                    }
                },
                {
                    target: 'pino-pretty',
                    level: logLevel,
                    options: {
                        colorize: false,
                        translateTime: 'dd-mm-yyyy, HH:MM:ss',
                        destination: `${filePath}/logger.log`
                    }
                },
            ]
        },
    });
}

async function cleanLogs(forceClear = false) {
    try {
        const logsDir = path.join(__dirname, '../logs');

        // Ensure directory exists
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
            return;
        }

        const files = await fsPromises.readdir(logsDir);
        let filesProcessed = 0;

        logger.info(`Found ${files.length} files in logs directory`);

        for (const file of files) {
            if (file.endsWith('.log')) {
                const logFilePath = path.join(logsDir, file);
                const stats = await fsPromises.stat(logFilePath);
                const fileDate = moment(stats.mtime);
                const daysDiff = moment().diff(fileDate, 'days');

                logger.info(`Processing ${file} - Last modified: ${fileDate.format('YYYY-MM-DD HH:mm:ss')} (${daysDiff} days old)`);

                if (forceClear || daysDiff >= 1) {
                    const beforeSize = stats.size;
                    await fsPromises.truncate(logFilePath, 0);
                    const afterStats = await fsPromises.stat(logFilePath);

                    logger.info(`File ${file} cleaned - Size before: ${beforeSize} bytes, Size after: ${afterStats.size} bytes`);
                    filesProcessed++;
                } else {
                    logger.info(`File ${file} skipped - Not old enough`);
                }
            }
        }

        logger.info(`Log cleaning completed. Processed ${filesProcessed} files`);
    } catch (error) {
        logger.error(`Error cleaning logs: ${error.stack}`);
    }
}

module.exports = { logger, cleanLogs };
