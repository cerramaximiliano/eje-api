require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { logger, cleanLogs, printStartupBanner } = require('./config/pino');
const { loadSecrets } = require('./config/env');
const routes = require('./routes');

const app = express();

// Store server reference for graceful shutdown
let server = null;
let isShuttingDown = false;

// Environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3004;

/**
 * Configure CORS
 */
function configureCors() {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4200',
    'https://app.lawanalytics.com.ar',
    'https://admin.lawanalytics.com.ar',
    'https://lawanalytics.com.ar',
    'https://dashboard.lawanalytics.app'
  ];

  return cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'api-key']
  });
}

/**
 * Conectar a MongoDB
 */
async function connectDatabase() {
  const mongoUri = NODE_ENV === 'local'
    ? process.env.URLDB_LOCAL
    : process.env.URLDB;

  if (!mongoUri) {
    throw new Error('URI de MongoDB no configurada');
  }

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  });

  mongoose.connection.on('error', (err) => {
    logger.error('Error de conexión MongoDB: ' + err.message);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB desconectado');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconectado');
  });
}

/**
 * Configure Express middleware
 */
function configureMiddleware() {
  app.use(configureCors());
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Custom morgan format: METHOD /path STATUS - RESPONSEms
  const morganFormat = ':method :url :status - :response-time[0]ms';
  app.use(morgan(morganFormat, {
    stream: { write: (message) => logger.info(message.trim()) },
    skip: (req) => req.path === '/api/health' // Skip health checks
  }));
}

/**
 * Configure routes
 */
function configureRoutes() {
  app.use('/api', routes);

  app.get('/', (req, res) => {
    res.json({
      name: 'EJE API',
      version: '1.0.0',
      environment: NODE_ENV,
      endpoints: {
        health: '/api/health',
        causas: '/api/causas-eje',
        service: '/api/causas-eje-service',
        stats: '/api/worker-stats',
        config: '/api/config'
      }
    });
  });

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'Endpoint not found',
      path: req.path
    });
  });

  app.use((err, req, res, next) => {
    logger.error('Error on ' + req.method + ' ' + req.path + ': ' + err.message);
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal server error'
    });
  });
}

/**
 * Apagado graceful
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Señal ${signal} recibida. Apagando servidor...`);

  if (server) {
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) {
          logger.error('Error cerrando servidor HTTP: ' + err.message);
        } else {
          logger.info('Servidor HTTP cerrado');
        }
        resolve();
      });
    });
  }

  try {
    await mongoose.connection.close();
    logger.info('Conexión MongoDB cerrada');
  } catch (err) {
    logger.error('Error cerrando MongoDB: ' + err.message);
  }

  process.exit(0);
}

/**
 * Intentar iniciar el servidor con reintentos
 */
function startListening(retries = 5, delay = 2000) {
  return new Promise((resolve, reject) => {
    const tryStart = (attempt) => {
      if (isShuttingDown) {
        return reject(new Error('Apagado en progreso'));
      }

      server = app.listen(PORT);

      server.on('listening', () => {
        resolve(server);
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          if (attempt < retries) {
            logger.warn(`Puerto ${PORT} en uso, reintentando en ${delay/1000}s... (intento ${attempt+1}/${retries})`);
            server = null;
            setTimeout(() => tryStart(attempt + 1), delay);
          } else {
            logger.error(`Puerto ${PORT} sigue en uso después de ${retries} intentos`);
            reject(err);
          }
        } else {
          logger.error('Error del servidor: ' + err.message);
          reject(err);
        }
      });
    };

    tryStart(0);
  });
}

/**
 * Iniciar el servidor
 */
async function startServer() {
  try {
    // Cargar secretos si es necesario
    if (NODE_ENV !== 'development' || !process.env.URLDB) {
      await loadSecrets();
    }

    // Conectar a MongoDB
    await connectDatabase();

    // Configurar middleware y rutas
    configureMiddleware();
    configureRoutes();

    // Limpieza de logs periódica
    cleanLogs();
    setInterval(cleanLogs, 60 * 60 * 1000);

    // Iniciar servidor
    await startListening();

    // Mostrar banner de inicio
    printStartupBanner({
      name: 'EJE API',
      version: '1.0.0',
      environment: NODE_ENV,
      port: PORT,
      mongoStatus: 'Conectado'
    });

  } catch (error) {
    logger.error('Error al iniciar servidor: ' + error.message);
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  logger.error('Excepción no capturada: ' + error.message);
  gracefulShutdown('uncaughtException').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  logger.error('Promesa rechazada no manejada: ' + reason);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

module.exports = app;
