const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const guildRoutes = require('./routes/guilds');
const channelRoutes = require('./routes/channels');
const fileRoutes = require('./routes/files');
const userRoutes = require('./routes/users');
const friendRoutes = require('./routes/friends');
const typingRoutes = require('./routes/typing');
const dmRoutes = require('./routes/dm');
const reactionRoutes = require('./routes/reactions');
const pinRoutes = require('./routes/pins');
const presenceRoutes = require('./routes/presence');

const socketHandler = require('./socket/socketHandler');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security middleware - 開発用に緩めに設定
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "blob:", "*"],
      connectSrc: ["'self'", "ws:", "wss:", "*"],
      fontSrc: ["'self'", "data:", "*"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "*"],
      frameSrc: ["'none'"],
    },
  },
}));

// Rate limiting - 開発時は緩めに設定
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 1 * 60 * 1000, // 1 minute (開発用に短縮)
  max: parseInt(process.env.RATE_LIMIT_MAX) || 10000, // 10000 requests per minute (開発用に増加)
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  // 静的ファイルは制限から除外
  skip: (req, res) => {
    return req.url.startsWith('/css/') || 
           req.url.startsWith('/js/') || 
           req.url.startsWith('/uploads/') ||
           req.url.endsWith('.js') ||
           req.url.endsWith('.css') ||
           req.url.endsWith('.png') ||
           req.url.endsWith('.jpg') ||
           req.url.endsWith('.jpeg') ||
           req.url.endsWith('.gif') ||
           req.url.endsWith('.ico');
  }
});

// 開発中はレート制限を無効化
// app.use(limiter);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url} - ${req.ip}`);
  if (req.method !== 'GET') {
    console.log('📋 Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静的ファイルの前にMIMEタイプを設定
app.use((req, res, next) => {
  if (req.url.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript');
  } else if (req.url.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css');
  }
  next();
});

// Static files with explicit MIME types
const expressStatic = express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
});

app.use(expressStatic);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', authenticateToken, messageRoutes);
app.use('/api/guilds', authenticateToken, guildRoutes);
app.use('/api/channels', authenticateToken, channelRoutes);
app.use('/api/files', authenticateToken, fileRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/friends', authenticateToken, friendRoutes);
app.use('/api/typing', authenticateToken, typingRoutes);
app.use('/api/dm', authenticateToken, dmRoutes);
app.use('/api/reactions', authenticateToken, reactionRoutes);
app.use('/api/pins', authenticateToken, pinRoutes);
app.use('/api/presence', authenticateToken, presenceRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.io connection handling
const connectedIo = socketHandler(io);

// Store io instance for routes to access
app.set('io', connectedIo);

// Serve frontend for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
});
