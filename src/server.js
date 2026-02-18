// ============================================
// FILE: src/server.js
// ============================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const db         = require('./config/database');
const routes     = require('./routes');
const swaggerUi  = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const app  = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET  = process.env.JWT_SECRET  || 'vehicle_scheduling_secret_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

// ======================
// MIDDLEWARE
// ======================
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const localhostPattern   = /^http:\/\/localhost:\d+$/;
    const localhostIPPattern = /^http:\/\/127\.0\.0\.1:\d+$/;
    if (localhostPattern.test(origin) || localhostIPPattern.test(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials  : true,
  methods      : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ======================
// SWAGGER
// ======================
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ======================
// AUTH ROUTES - defined directly here to avoid any caching issues
// ======================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    // Find user in database
    const [rows] = await db.query(
      'SELECT * FROM users WHERE username = ? AND is_active = 1',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    const user = rows[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    return res.status(200).json({
      success  : true,
      token    : token,
      expiresIn: JWT_EXPIRES,
      user     : {
        id       : user.id,
        username : user.username,
        full_name: user.full_name,
        role     : user.role,
        email    : user.email,
      },
    });

  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message,
    });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await db.query(
      'SELECT id, username, full_name, role, email FROM users WHERE id = ?',
      [decoded.id]
    );

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    return res.status(200).json({ success: true, user: rows[0] });

  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// ======================
// ALL OTHER API ROUTES
// ======================
app.use('/api', routes);

// Root
app.get('/', (req, res) => {
  res.json({
    message  : 'Vehicle Scheduling System API',
    version  : '1.0.0',
    status   : 'running',
    timestamp: new Date().toISOString(),
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status   : 'healthy',
    uptime   : process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found', path: req.originalUrl });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error  : process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ======================
// START SERVER
// ======================
(async () => {
  try {
    await db.query('SELECT 1 as test');
    console.log('✅ Database connection successful');

    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log('🚀 Vehicle Scheduling API');
      console.log('='.repeat(50));
      console.log(`📡 Server:  http://localhost:${PORT}`);
      console.log(`🔗 API:     http://localhost:${PORT}/api`);
      console.log(`🔐 Login:   POST http://localhost:${PORT}/api/auth/login`);
      console.log('='.repeat(50) + '\n');
    });
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
})();