// ============================================
// FILE: src/middleware/authMiddleware.js
// PURPOSE: Protect routes - verify JWT token
// ============================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vehicle_scheduling_secret_2024';

// ==========================================
// VERIFY TOKEN MIDDLEWARE
// Add this to any route that needs login
// ==========================================
/**
 * Checks the Authorization header for a valid JWT token.
 * If valid, attaches user info to req.user and calls next().
 * If invalid or missing, returns 401 Unauthorized.
 *
 * Usage in routes:
 *   const { verifyToken } = require('../middleware/authMiddleware');
 *   router.get('/protected', verifyToken, controller.method);
 */
const verifyToken = (req, res, next) => {
  try {
    // Token comes in header: Authorization: Bearer eyJhbGci...
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided',
      });
    }

    // Split "Bearer eyJhbGci..." → take the token part
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token format invalid. Use: Bearer <token>',
      });
    }

    // Verify the token is valid and not expired
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to request so controllers can use it
    // e.g. req.user.id, req.user.role
    req.user = decoded;

    // Continue to the actual route handler
    next();

  } catch (error) {
    // Token is expired or tampered with
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.',
    });
  }
};

// ==========================================
// ROLE CHECK MIDDLEWARE
// Use after verifyToken to restrict by role
// ==========================================
/**
 * Restricts a route to specific roles.
 *
 * Usage:
 *   router.post('/admin-only', verifyToken, requireRole('admin'), controller.method);
 *   router.post('/dispatch',   verifyToken, requireRole('admin', 'dispatcher'), controller.method);
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
    }

    next();
  };
};

module.exports = { verifyToken, requireRole };