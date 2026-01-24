// server entry - clean and consistent
// Load environment in non-production only (avoid overriding host env vars)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Database connection
const connectDB = require('./db');
connectDB();

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
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3000',
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
        callback(null, true);
      } else {
        console.error('❌ Blocked by CORS:', origin);
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

// -------------------- Root Route --------------------
app.get('/', (req, res) => {
  res.send('✅ SnoRelax Backend is running. Use /api/... endpoints.');
});

// -------------------- Mount Routes --------------------
app.use('/api/auth', authRoutes);
app.use('/api/community/legacy', communityRoutes);
app.use('/api/community', communityMongoRoutes);
app.use('/api/moods', moodRoutes);
app.use('/api/chat/history', chatHistoryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/private', privateRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/reports', reportRoutes);

// -------------------- 404 Handler --------------------
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// -------------------- Global Error Handler --------------------
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err && err.stack ? err.stack : err);
  res.status(500).json({ error: err && err.message ? err.message : 'Internal Server Error' });
});

// -------------------- Socket.IO --------------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

app.set('io', io);

try {
  require('./sockets/communitySocket')(io);
} catch (e) {
  console.error('Failed to load communitySocket:', e);
}

try {
  // Temporarily disabled due to filesystem corruption
  // require('./sockets/chatbotSocket')(io);
  console.log('Chatbot socket temporarily disabled due to filesystem issues');
} catch (e) {
  console.error('Failed to load chatbotSocket:', e);
}

try {
  require('./sockets/adminSocket')(io);
} catch (e) {
  console.error('Failed to load adminSocket:', e);
}

// -------------------- Start Server --------------------
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

function startServer(port, attemptsLeft = 5) {
  server.listen(port, () => console.log(`🚀 SnoRelax server running on port ${port}`));

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${port} already in use.`);
      if (attemptsLeft > 0) {
        const nextPort = port + 1;
        console.log(`Trying port ${nextPort} (attempts left: ${attemptsLeft - 1})`);
        // remove existing listeners and try next port
        server.removeAllListeners('error');
        setTimeout(() => startServer(nextPort, attemptsLeft - 1), 500);
        return;
      }
      console.error('No available ports found. Exiting.');
      process.exit(1);
    }

    console.error('Server error during startup:', err);
    process.exit(1);
  });
}

startServer(DEFAULT_PORT);

module.exports = app;
