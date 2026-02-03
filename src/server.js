require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { logger, cleanLogs } = require('./config/pino');
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
 * Connect to MongoDB
 */
async function connectDatabase() {
  const mongoUri = NODE_ENV === 'local'
    ? process.env.URLDB_LOCAL
    : process.env.URLDB;

  if (!mongoUri) {
    throw new Error('MongoDB URI not configured');
  }

  logger.info('Connecting to MongoDB (' + NODE_ENV + ')...');

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  });

  logger.info('Connected to MongoDB');

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error: ' + err.message);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
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

  if (NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));
  }
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
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  logger.info(signal + ' received. Shutting down gracefully...');
  
  if (server) {
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) {
          logger.error('Error closing HTTP server: ' + err.message);
        } else {
          logger.info('HTTP server closed');
        }
        resolve();
      });
    });
  }
  
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (err) {
    logger.error('Error closing MongoDB: ' + err.message);
  }
  
  process.exit(0);
}

/**
 * Try to start listening with retries
 */
function startListening(retries = 5, delay = 2000) {
  return new Promise((resolve, reject) => {
    const tryStart = (attempt) => {
      if (isShuttingDown) {
        return reject(new Error('Shutdown in progress'));
      }
      
      server = app.listen(PORT);
      
      server.on('listening', () => {
        logger.info('EJE API server started on port ' + PORT + ' (' + NODE_ENV + ')');
        resolve(server);
      });
      
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          if (attempt < retries) {
            logger.warn('Port ' + PORT + ' in use, retrying in ' + (delay/1000) + 's... (attempt ' + (attempt+1) + '/' + retries + ')');
            server = null;
            setTimeout(() => tryStart(attempt + 1), delay);
          } else {
            logger.error('Port ' + PORT + ' still in use after ' + retries + ' attempts');
            reject(err);
          }
        } else {
          logger.error('Server error: ' + err.message);
          reject(err);
        }
      });
    };
    
    tryStart(0);
  });
}

/**
 * Start the server
 */
async function startServer() {
  try {
    if (NODE_ENV !== 'development' || !process.env.URLDB) {
      logger.info('Loading secrets from AWS...');
      await loadSecrets();
    }

    await connectDatabase();
    configureMiddleware();
    configureRoutes();

    cleanLogs();
    setInterval(cleanLogs, 60 * 60 * 1000);

    await startListening();
    
  } catch (error) {
    logger.error('Failed to start server: ' + error.message);
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception: ' + error.message);
  gracefulShutdown('uncaughtException').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection: ' + reason);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

module.exports = app;
