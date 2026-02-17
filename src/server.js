// ============================================
// FILE: src/server.js
// PURPOSE: Main application entry point
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const routes = require('./routes');
// Import Swagger
const swaggerUi = require('swagger-ui-express');  
const swaggerSpec = require('./config/swagger');  

// Import database connection (ensure it connects on startup)
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================
// MIDDLEWARE SETUP
// ======================

// Enable CORS for frontend (Flutter Web/Mobile)
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:8080'], // Adjust as needed for Flutter
  credentials: true
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// ======================
// SWAGGER ROUTES
// ======================

// Swagger UI at /api-docs
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Swagger JSON specification
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
// ======================
// ROUTES
// ======================

// API routes (all prefixed with /api)
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Vehicle Scheduling System API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      dashboard: '/api/dashboard/summary',
      reports: '/api/reports/*',
      jobs: '/api/jobs',
      vehicles: '/api/vehicles',
      assignments: '/api/assignments'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    database: 'connected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ======================
// ERROR HANDLING
// ======================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error handler:', err.stack || err.message);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ======================
// START SERVER
// ======================

// Test database connection before starting server
(async () => {
  try {
    // Test connection by executing a simple query
    const [result] = await db.query('SELECT 1 as test');
    console.log('✅ Database connection successful');
    
    // Start the server
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log('🚀 Vehicle Scheduling API');
      console.log('='.repeat(50));
      console.log(`📡 Server running at: http://localhost:${PORT}`);
      console.log(`🔗 API base path: /api`);
      console.log(`🗃️  Database: MySQL (XAMPP)`);
      console.log(`📅 Started: ${new Date().toLocaleString()}`);
      console.log('='.repeat(50) + '\n');
    });
  } catch (err) {
    console.error('❌ Failed to connect to database:');
    console.error(err.message);
    console.error('\nPlease ensure:');
    console.error('  1. XAMPP MySQL is running');
    console.error('  2. .env file has correct DB credentials');
    console.error('  3. Database exists and tables are created');
    process.exit(1);
  }
})();