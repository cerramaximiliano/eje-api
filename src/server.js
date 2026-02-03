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
    'https://lawanalytics.com.ar'
  ];

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
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
    throw new Error('MongoDB URI not configured. Set URLDB or URLDB_LOCAL environment variable.');
  }

  logger.info({ environment: NODE_ENV }, 'Connecting to MongoDB...');

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  });

  logger.info('Connected to MongoDB');

  // Handle connection events
  mongoose.connection.on('error', (err) => {
    logger.error({ error: err.message }, 'MongoDB connection error');
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
  // CORS
  app.use(configureCors());

  // Body parsing
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  // Cookie parsing
  app.use(cookieParser());

  // Request logging
  if (NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }));
  }
}

/**
 * Configure routes
 */
function configureRoutes() {
  // API routes
  app.use('/api', routes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'EJE API',
      version: '1.0.0',
      description: 'API for EJE - Expediente Judicial Electrónico (Poder Judicial de la Ciudad de Buenos Aires)',
      environment: NODE_ENV,
      endpoints: {
        health: '/api/health',
        causas: '/api/causas-eje',
        service: '/api/causas-eje-service',
        stats: '/api/worker-stats'
      }
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'Endpoint not found',
      path: req.path
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    logger.error({
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    }, 'Unhandled error');

    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal server error',
      ...(NODE_ENV === 'development' && { stack: err.stack })
    });
  });
}

/**
 * Start the server
 */
async function startServer() {
  try {
    // Load secrets from AWS if not in development with .env
    if (NODE_ENV !== 'development' || !process.env.URLDB) {
      logger.info('Loading secrets from AWS...');
      await loadSecrets();
    }

    // Connect to database
    await connectDatabase();

    // Configure Express
    configureMiddleware();
    configureRoutes();

    // Clean logs periodically
    cleanLogs();
    setInterval(cleanLogs, 60 * 60 * 1000); // Every hour

    // Start listening
    app.listen(PORT, () => {
      logger.info({
        port: PORT,
        environment: NODE_ENV,
        nodeVersion: process.version
      }, `EJE API server started on port ${PORT}`);
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to start server');
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;
