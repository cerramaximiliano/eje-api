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

// Determinar nivel de log según entorno
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// En modo cluster de PM2, usar logger con formato personalizado
const isClusterMode = process.env.NODE_APP_INSTANCE !== undefined || process.env.pm_id !== undefined;

// Función para obtener timestamp formateado
const getTimestamp = () => moment().tz('America/Argentina/Buenos_Aires').format('DD-MM-YYYY HH:mm:ss');

let logger;

if (isClusterMode) {
    const levelPriority = { debug: 10, info: 20, warn: 40, error: 50 };
    const minLevel = levelPriority[logLevel] || 20;

    logger = {
        info: (msg, ...args) => {
            if (minLevel <= 20) {
                console.log(`[${getTimestamp()}] INFO: ${msg}`, ...args);
            }
        },
        warn: (msg, ...args) => {
            if (minLevel <= 40) {
                console.log(`[${getTimestamp()}] WARN: ${msg}`, ...args);
            }
        },
        error: (msg, ...args) => {
            if (minLevel <= 50) {
                console.error(`[${getTimestamp()}] ERROR: ${msg}`, ...args);
            }
        },
        debug: (msg, ...args) => {
            if (minLevel <= 10) {
                console.log(`[${getTimestamp()}] DEBUG: ${msg}`, ...args);
            }
        },
        // Función para imprimir sin formato de timestamp
        raw: (msg) => console.log(msg)
    };
} else {
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
    // Agregar función raw para modo fork
    logger.raw = (msg) => console.log(msg);
}

/**
 * Imprime el banner de inicio del servidor
 */
function printStartupBanner(config) {
    const {
        name = 'EJE API',
        version = '1.0.0',
        environment = 'development',
        port = 3004,
        mongoStatus = 'Conectado',
        logLevel: level = logLevel
    } = config;

    const timestamp = getTimestamp();
    const width = 56;
    const line = '═'.repeat(width);
    const emptyLine = '║' + ' '.repeat(width) + '║';

    const centerText = (text, w) => {
        const padding = Math.max(0, w - text.length);
        const left = Math.floor(padding / 2);
        const right = padding - left;
        return ' '.repeat(left) + text + ' '.repeat(right);
    };

    const formatRow = (label, value) => {
        const content = `  ${label.padEnd(14)} ${value}`;
        return '║' + content.padEnd(width) + '║';
    };

    const banner = `
╔${line}╗
║${centerText(`${name} v${version}`, width)}║
╠${line}╣
${formatRow('Entorno:', environment)}
${formatRow('Puerto:', port.toString())}
${formatRow('MongoDB:', mongoStatus)}
${formatRow('Nivel de log:', level.toUpperCase())}
${formatRow('Iniciado:', timestamp)}
╚${line}╝
`;

    // Usar raw si existe, sino console.log
    if (logger.raw) {
        logger.raw(banner);
    } else {
        console.log(banner);
    }
}

/**
 * Limpia archivos de log antiguos (más de 1 día)
 */
async function cleanLogs(forceClear = false) {
    try {
        const logsDir = path.join(__dirname, '../logs');

        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
            return;
        }

        const files = await fsPromises.readdir(logsDir);
        let filesProcessed = 0;

        for (const file of files) {
            if (file.endsWith('.log')) {
                const logFilePath = path.join(logsDir, file);
                const stats = await fsPromises.stat(logFilePath);
                const fileDate = moment(stats.mtime);
                const daysDiff = moment().diff(fileDate, 'days');

                if (forceClear || daysDiff >= 1) {
                    await fsPromises.truncate(logFilePath, 0);
                    filesProcessed++;
                }
            }
        }

        // Solo loguear si se limpiaron archivos
        if (filesProcessed > 0) {
            logger.info(`Limpieza de logs: ${filesProcessed} archivo(s) procesado(s)`);
        }
    } catch (error) {
        logger.error(`Error limpiando logs: ${error.message}`);
    }
}

module.exports = { logger, cleanLogs, printStartupBanner };
