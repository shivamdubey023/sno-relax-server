// server entry - clean and consistent
// Load environment in non-production only (avoid overriding host env vars)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const chalk = require('chalk');
const mongoose = require('mongoose');

// Database connection
const { connectDB } = require('./db');
connectDB();

// ==================== Logging Helpers ====================
const log = {
  info: (ctx, msg) => console.log(chalk.blue('ℹ️'), chalk.gray(`[${ctx}]`), msg),
  success: (ctx, msg) => console.log(chalk.green('✅'), chalk.gray(`[${ctx}]`), msg),
  warn: (ctx, msg) => console.log(chalk.yellow('⚠️'), chalk.gray(`[${ctx}]`), msg),
  error: (ctx, msg) => console.log(chalk.red('❌'), chalk.gray(`[${ctx}]`), msg),
  api: (method, endpoint, user) => {
    const userInfo = user ? chalk.gray(`(user: ${user})`) : '';
    console.log(chalk.cyan('📡'), chalk.yellow(method), endpoint, userInfo);
  },
  socket: (event, data) => console.log(chalk.magenta('🔌'), chalk.yellow('[Socket]'), event, data ? chalk.gray(`- ${JSON.stringify(data).slice(0, 50)}`) : ''),
  ws: (action, detail) => console.log(chalk.cyan('🌐'), chalk.yellow('[WS]'), action, detail || ''),
};

// Routes
const authRoutes = require('./routes/authRoutes');
const communityRoutes = require('./routes/communityRoutes');
const communityMongoRoutes = require('./routes/communityMongoRoutes');
const moodRoutes = require('./routes/moodRoutes');
const chatRoutes = require('./routes/chatbotRoutes');
const adminRoutes = require('./routes/adminRoutes');
const translateRoutes = require('./routes/translateRoutes');
const aiRoutes = require('./routes/aiRoutes');
const privateRoutes = require('./routes/privateRoutes');
const chatHistoryRoutes = require('./routes/chatHistoryRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

// -------------------- CORS --------------------
const allowedOrigins = [
  'https://sno-relax-client.vercel.app',
  'https://sno-relax-admin.vercel.app',
  'https://sno-relax-server.onrender.com',
  // Localhost
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:10000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:10000',
  // Local network IPs (allow any port on these IPs)
  'http://192.168.',
  'http://10.',
  'http://172.',
  // Production URLs
  'https://sno-relax-client.onrender.com',
  'https://sno-relax-client.netlify.app',
  'https://sno-relax-client.github.io',
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow no-origin requests (like mobile apps or curl)
      if (!origin) return callback(null, true);
      
      // Check if origin matches any allowed pattern
      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed.endsWith('.')) {
          // For IP prefixes like 192.168., check if origin starts with it
          return origin.startsWith(allowed);
        }
        return origin.startsWith(allowed);
      });
      
      if (isAllowed) {
        callback(null, true);
      } else {
        log.warn('CORS', `Blocked request from: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json());

// -------------------- URL Normalizer --------------------
app.use((req, res, next) => {
  req.url = req.url.replace(/\/\/+/g, '/');
  next();
});

// -------------------- Request Logger Middleware --------------------
app.use((req, res, next) => {
  const start = Date.now();
  const userId = req.headers.authorization ? 'authenticated' : 'anonymous';
  
  // Log API call
  log.api(req.method, req.originalUrl, userId);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode >= 400 ? chalk.red(res.statusCode) : chalk.green(res.statusCode);
    if (duration > 1000) {
      log.warn('API', `${req.method} ${req.originalUrl} took ${duration}ms ${status}`);
    }
  });
  
  next();
});

// -------------------- Root Route --------------------
app.get('/', (req, res) => {
  res.send('✅ SnoRelax Backend is running. Use /api/... endpoints.');
});

// Health check endpoint
app.get('/health', (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      state: mongoStates[mongoState] || 'unknown',
      name: mongoose.connection.name || null,
    },
    clients: {
      socket: connectedClients.size,
    },
    memory: process.memoryUsage(),
  });
});

// -------------------- Mount Routes --------------------
log.info('API', 'Mounting routes...');
app.use('/api/auth', authRoutes);
app.use('/api/community/legacy', communityRoutes);
app.use('/api/community', communityMongoRoutes);
app.use('/api/moods', moodRoutes);
// Alias for clients that call singular form: /api/mood/:userId
app.use('/api/mood', moodRoutes);
app.use('/api/chat/history', chatHistoryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/private', privateRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/reports', reportRoutes);
log.success('API', 'All routes mounted');

// -------------------- 404 Handler --------------------
app.use((req, res) => {
  log.warn('API', `404 - Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Endpoint not found' });
});

// -------------------- Global Error Handler --------------------
app.use((err, req, res, next) => {
  log.error('Server', err.stack || err.message);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// -------------------- Socket.IO --------------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);

// Track connected clients
const connectedClients = new Map();

io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  const clientOrigin = socket.handshake.headers.origin || 'unknown';
  log.ws('Client connected', `${socket.id} from ${clientIp} (${clientOrigin})`);
  
  connectedClients.set(socket.id, { 
    connectedAt: new Date(),
    ip: clientIp,
    origin: clientOrigin 
  });
  io.emit('clientsCount', connectedClients.size);
  log.info('Socket', `Total clients: ${connectedClients.size}`);

  socket.on('disconnect', (reason) => {
    const client = connectedClients.get(socket.id);
    log.ws('Client disconnected', `${socket.id} (${reason}) - ${client?.ip || 'unknown IP'}`);
    connectedClients.delete(socket.id);
    io.emit('clientsCount', connectedClients.size);
    log.info('Socket', `Total clients: ${connectedClients.size}`);
  });

  // Identify user
  socket.on('identify', (userId) => {
    log.socket('identify', `${socket.id} -> user: ${userId}`);
    connectedClients.set(socket.id, { 
      ...connectedClients.get(socket.id), 
      userId,
      identifiedAt: new Date()
    });
  });

  // Join group
  socket.on('joinGroup', (groupId) => {
    log.socket('joinGroup', `${socket.id} -> group: ${groupId}`);
  });

  // Send message
  socket.on('sendGroupMessage', (payload) => {
    log.socket('sendMessage', `${socket.id} -> "${payload?.message?.slice(0, 30)}..."`);
  });

  // Typing
  socket.on('typing', (payload) => {
    log.socket('typing', `${payload?.userId} is ${payload?.isTyping ? 'typing' : 'stopped'}`);
  });
});

log.info('Socket', 'Loading WebSocket handlers...');

try {
  require('./sockets/communitySocket')(io);
  log.success('Socket', 'Community socket loaded');
} catch (e) {
  log.error('Socket', `Failed to load communitySocket: ${e.message}`);
}

try {
  require('./sockets/chatbotSocket')(io);
  log.success('Socket', 'Chatbot socket loaded');
} catch (e) {
  log.error('Socket', `Failed to load chatbotSocket: ${e.message}`);
}

try {
  require('./sockets/adminSocket')(io);
  log.success('Socket', 'Admin socket loaded');
} catch (e) {
  log.error('Socket', `Failed to load adminSocket: ${e.message}`);
}

log.info('Socket', 'WebSocket handlers ready');

// -------------------- Start Server --------------------
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 10000;

function startServer(port, attemptsLeft = 5) {
  server.listen(port, () => {
    log.success('Server', `🚀 SnoRelax running on port ${port}`);
    log.info('Server', `📱 API available at http://localhost:${port}/api`);
    log.info('Server', `🔌 WebSocket available at ws://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      log.error('Server', `Port ${port} already in use`);
      if (attemptsLeft > 0) {
        const nextPort = port + 1;
        log.warn('Server', `Trying port ${nextPort} (attempts left: ${attemptsLeft - 1})`);
        server.removeAllListeners('error');
        setTimeout(() => startServer(nextPort, attemptsLeft - 1), 500);
        return;
      }
      log.error('Server', 'No available ports found. Exiting.');
      process.exit(1);
    }

    log.error('Server', `Startup error: ${err.message}`);
    process.exit(1);
  });
}

startServer(DEFAULT_PORT);

module.exports = app;
