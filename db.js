// sno-relax-server/db.js
const mongoose = require('mongoose');
let chalk;
try {
  chalk = require('chalk');
} catch (e) {
  chalk = { blue: (s) => s, green: (s) => s, yellow: (s) => s, red: (s) => s, cyan: (s) => s };
}

let mongoMemoryServer = null;
let MongoMemoryServer;
try {
  // require at runtime so production (no dev dep) isn't affected
  MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;
} catch (e) {
  MongoMemoryServer = null;
}

// Only connect when a MONGODB_URI (or MONGO_URI) environment variable is provided.
// This prevents the server from attempting to connect to localhost in hosted environments.
// Set `MONGODB_URI` in your deployment or local env when you want DB connectivity.
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || null;

// Keep mongoose buffering enabled by default to avoid throwing when routes call models
// before a connection is established. Route handlers should perform fallbacks where needed.
mongoose.set('bufferCommands', true);

// ==================== Log Helpers ====================
const log = {
  info: (msg) => console.log(chalk.blue('ℹ️ [DB]'), msg),
  success: (msg) => console.log(chalk.green('✅ [DB]'), msg),
  warn: (msg) => console.log(chalk.yellow('⚠️ [DB]'), msg),
  error: (msg) => console.log(chalk.red('❌ [DB]'), msg),
  connection: (type) => console.log(chalk.cyan('🔗 [DB]'), 'MongoDB connection event:', type),
};

// Connection event listeners
mongoose.connection.on('connecting', () => log.info('Connecting to MongoDB...'));
mongoose.connection.on('connected', () => log.success(`Connected: ${mongoose.connection.name}`));
mongoose.connection.on('disconnected', () => log.warn('Disconnected from MongoDB'));
mongoose.connection.on('error', (err) => log.error(`Connection error: ${err.message}`));
mongoose.connection.on('reconnect', (attempt) => log.info(`Reconnected after ${attempt} attempts`));
mongoose.connection.on('close', () => log.info('Connection closed'));

const connectDB = async () => {
  log.info('Initializing database connection...');
  
  if (!MONGO_URI) {
    if (process.env.NODE_ENV === 'development' && MongoMemoryServer) {
      log.info('No MONGODB_URI set — starting mongodb-memory-server for development');
      try {
        mongoMemoryServer = await MongoMemoryServer.create();
        const memUri = mongoMemoryServer.getUri();
        await mongoose.connect(memUri, { serverSelectionTimeoutMS: 5000 });
        log.success('Connected to in-memory MongoDB for development');
        
        // Log server info
        const state = mongoose.connection.readyState;
        log.connection(state === 1 ? 'connected' : 'not connected');
        return;
      } catch (memErr) {
        log.warn(`Failed to start in-memory MongoDB: ${memErr.message}`);
        return;
      }
    }

    log.warn('No MONGODB_URI set — skipping MongoDB connection. Using in-memory stores only.');
    return;
  }

  // Diagnostic: check if the URI appears local or cloud (don't print the full URI)
  try {
    const isLocal = /localhost|127\.0\.0\.1/.test(MONGO_URI);
    const isSRV = /mongodb\+srv:/.test(MONGO_URI);
    log.info(`Attempting to connect to MongoDB... (type=${isSRV ? 'atlas-srv' : isLocal ? 'local' : 'uri'})`);
  } catch (e) {
    log.info('Attempting to connect to MongoDB...');
  }

  try {
    // Use a short server selection timeout so the app doesn't hang for long when Mongo is unreachable
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    log.success('MongoDB connected successfully');
  } catch (err) {
    log.warn(`MongoDB connection error: ${err.message}`);
    // If local development and mongodb-memory-server is available, try falling back
    if (process.env.NODE_ENV === 'development' && MongoMemoryServer) {
      log.info('Attempting to start mongodb-memory-server fallback (development only)');
      try {
        mongoMemoryServer = await MongoMemoryServer.create();
        const memUri = mongoMemoryServer.getUri();
        await mongoose.connect(memUri, { serverSelectionTimeoutMS: 5000 });
        log.success('Connected to in-memory MongoDB for development (fallback)');
        return;
      } catch (memErr) {
        log.warn(`In-memory MongoDB fallback failed: ${memErr.message}`);
      }
    }

    log.warn('Server will attempt to continue without MongoDB');
  }
};

module.exports = connectDB;
