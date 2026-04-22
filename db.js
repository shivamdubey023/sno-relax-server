// sno-relax-server/db.js
const mongoose = require('mongoose');

require('./models');

let chalk;
try {
  chalk = require('chalk');
} catch (e) {
  chalk = { blue: (s) => s, green: (s) => s, yellow: (s) => s, red: (s) => s, cyan: (s) => s };
}

let mongoMemoryServer = null;
let MongoMemoryServer;
try {
  MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;
} catch (e) {
  MongoMemoryServer = null;
}

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || null;

mongoose.set('bufferCommands', true);

const log = {
  info: (msg) => console.log(chalk.blue('ℹ️ [DB]'), msg),
  success: (msg) => console.log(chalk.green('✅ [DB]'), msg),
  warn: (msg) => console.log(chalk.yellow('⚠️ [DB]'), msg),
  error: (msg) => console.log(chalk.red('❌ [DB]'), msg),
  connection: (type) => console.log(chalk.cyan('🔗 [DB]'), 'MongoDB connection event:', type),
};

mongoose.connection.on('connecting', () => log.info('Connecting to MongoDB...'));
mongoose.connection.on('connected', () => log.success(`Connected: ${mongoose.connection.name}`));
mongoose.connection.on('disconnected', () => log.warn('Disconnected from MongoDB'));
mongoose.connection.on('error', (err) => log.error(`Connection error: ${err.message}`));
mongoose.connection.on('reconnect', (attempt) => log.info(`Reconnected after ${attempt} attempts`));
mongoose.connection.on('close', () => log.info('Connection closed'));

const INDEXES = [
  { name: 'User_email', model: 'User', index: { email: 1 }, options: { unique: true } },
  { name: 'User_phone', model: 'User', index: { phone: 1 }, options: { unique: true } },
  { name: 'User_userId', model: 'User', index: { userId: 1 }, options: { unique: true } },
  { name: 'Mood_user_date', model: 'Mood', index: { userId: 1, date: -1 }, options: {} },
  { name: 'CommunityGroup_name', model: 'CommunityGroup', index: { name: 'text' }, options: {} },
  { name: 'GroupMessage_group_created', model: 'GroupMessage', index: { groupId: 1, createdAt: -1 }, options: {} },
  { name: 'ChatHistory_user_timestamp', model: 'ChatHistory', index: { userId: 1, timestamp: -1 }, options: {} },
  { name: 'PrivateMessage_sender_receiver', model: 'PrivateMessage', index: { senderId: 1, receiverId: 1 }, options: {} },
  { name: 'HospitalReport_user_created', model: 'HospitalReport', index: { userId: 1, createdAt: -1 }, options: {} },
  { name: 'HealthPlan_user_created', model: 'HealthPlan', index: { userId: 1, createdAt: -1 }, options: {} },
  { name: 'UserProfileChange_user_changed', model: 'UserProfileChange', index: { userId: 1, changedAt: -1 }, options: {} },
  { name: 'TrainingEntry_user_processed', model: 'TrainingEntry', index: { userId: 1, processed: 1 }, options: {} },
];

async function createIndexes() {
  log.info('Creating database indexes...');
  let created = 0;
  let skipped = 0;
  
  for (const idx of INDEXES) {
    try {
      const Model = mongoose.model(idx.model);
      await Model.createIndexes();
      created++;
    } catch (e) {
      if (e.message.includes('already exists')) {
        skipped++;
      } else {
        log.warn(`Index ${idx.name}: ${e.message}`);
      }
    }
  }
  
  log.success(`Indexes: ${created} created, ${skipped} existing`);
  return { created, skipped };
}

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
        
        const state = mongoose.connection.readyState;
        log.connection(state === 1 ? 'connected' : 'not connected');
        
        await createIndexes();
        return { connected: true, type: 'memory' };
      } catch (memErr) {
        log.warn(`Failed to start in-memory MongoDB: ${memErr.message}`);
        return { connected: false, type: 'none' };
      }
    }

    log.warn('No MONGODB_URI set — skipping MongoDB connection. Using in-memory stores only.');
    return { connected: false, type: 'none' };
  }

  try {
    const isLocal = /localhost|127\.0\.0\.1/.test(MONGO_URI);
    const isSRV = /mongodb\+srv:/.test(MONGO_URI);
    log.info(`Attempting to connect to MongoDB... (type=${isSRV ? 'atlas-srv' : isLocal ? 'local' : 'uri'})`);
  } catch (e) {
    log.info('Attempting to connect to MongoDB...');
  }

  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
    });

    log.success('MongoDB connected successfully');
    await createIndexes();
    return { connected: true, type: 'atlas' };
  } catch (err) {
    log.warn(`MongoDB connection error: ${err.message}`);
    if (process.env.NODE_ENV === 'development' && MongoMemoryServer) {
      log.info('Attempting to start mongodb-memory-server fallback (development only)');
      try {
        mongoMemoryServer = await MongoMemoryServer.create();
        const memUri = mongoMemoryServer.getUri();
        await mongoose.connect(memUri, { serverSelectionTimeoutMS: 5000 });
        log.success('Connected to in-memory MongoDB for development (fallback)');
        await createIndexes();
        return { connected: true, type: 'memory' };
      } catch (memErr) {
        log.warn(`In-memory MongoDB fallback failed: ${memErr.message}`);
      }
    }

    log.warn('Server will attempt to continue without MongoDB');
    return { connected: false, type: 'none' };
  }
};

module.exports = { connectDB, createIndexes };