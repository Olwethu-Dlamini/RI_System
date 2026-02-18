// ============================================
// FILE: src/controllers/authController.js
// PURPOSE: Handle login and token generation
// ============================================

const db        = require('../config/database');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');

// JWT secret key - stored in .env file
// Never hardcode this in production
const JWT_SECRET  = process.env.JWT_SECRET  || 'vehicle_scheduling_secret_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h'; // Token valid for 8 hours (one work day)

class AuthController {

  // ==========================================
  // POST /api/auth/login
  // PURPOSE: Validate credentials, return token
  // ==========================================
  /**
   * Login with username + password
   *
   * Request body:
   * {
   *   "username": "admin",
   *   "password": "yourpassword"
   * }
   *
   * Success response (200):
   * {
   *   "success": true,
   *   "token": "eyJhbGci...",
   *   "user": {
   *     "id": 1,
   *     "username": "admin",
   *     "full_name": "System Admin",
   *     "role": "admin",
   *     "email": "admin@company.com"
   *   }
   * }
   */
  static async login(req, res) {
    try {
      const { username, password } = req.body;

      // ----------------------------------------
      // Validate required fields
      // ----------------------------------------
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password are required',
        });
      }

      // ----------------------------------------
      // Find user in database
      // ----------------------------------------
      const [rows] = await db.query(
        'SELECT * FROM users WHERE username = ? AND is_active = 1',
        [username]
      );

      if (rows.length === 0) {
        // User not found or inactive
        // Use generic message so we don't reveal if username exists
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
      }

      const user = rows[0];

      // ----------------------------------------
      // Check password
      // bcrypt.compare handles hashed passwords safely
      // ----------------------------------------
      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
      }

      // ----------------------------------------
      // Generate JWT token
      // Payload contains user info (NOT password)
      // ----------------------------------------
      const token = jwt.sign(
        {
          id      : user.id,
          username: user.username,
          role    : user.role,
          email   : user.email,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      // ----------------------------------------
      // Return token + safe user object
      // Never return password_hash to client
      // ----------------------------------------
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
        message: 'Login failed. Please try again.',
      });
    }
  }

  // ==========================================
  // GET /api/auth/me
  // PURPOSE: Return current logged-in user info
  // REQUIRES: Valid JWT token in header
  // ==========================================
  static async getMe(req, res) {
    try {
      // req.user is set by authMiddleware
      const [rows] = await db.query(
        'SELECT id, username, full_name, role, email, is_active, created_at FROM users WHERE id = ?',
        [req.user.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      return res.status(200).json({
        success: true,
        user   : rows[0],
      });

    } catch (error) {
      console.error('GetMe error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to get user info',
      });
    }
  }

  // ==========================================
  // POST /api/auth/logout
  // PURPOSE: Client-side logout (clear token)
  // NOTE: JWT is stateless - real logout happens
  //       on Flutter side by deleting stored token
  // ==========================================
  static async logout(req, res) {
    // With JWT we just tell the client to delete their token
    // No server-side session to destroy
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
}

module.exports = AuthController;