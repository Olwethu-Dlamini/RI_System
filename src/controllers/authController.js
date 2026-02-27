// ============================================
// FILE: src/controllers/authController.js
// PURPOSE: Handle login and token generation
// ============================================

const db       = require('../config/database');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { USER_ROLE } = require('../config/constants');

const JWT_SECRET  = process.env.JWT_SECRET  || 'vehicle_scheduling_secret_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

class AuthController {

  // ==========================================
  // POST /api/auth/login
  // ==========================================
  /**
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
   *   "expiresIn": "8h",
   *   "user": {
   *     "id": 1,
   *     "username": "admin",
   *     "full_name": "System Admin",
   *     "role": "admin",          ← "admin" | "scheduler" | "technician"
   *     "email": "admin@company.com",
   *     "permissions": [...]      ← array of permission keys for this role
   *   }
   * }
   */
  static async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password are required',
        });
      }

      // ── Find active user ──────────────────
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

      // ── Validate password ─────────────────
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
      }

      // ── Normalise role ────────────────────
      // Migrate legacy role names to new ones gracefully.
      // "dispatcher" → "scheduler", "driver" → "technician"
      const normalisedRole = AuthController._normaliseRole(user.role);

      // ── Generate JWT ──────────────────────
      const token = jwt.sign(
        {
          id      : user.id,
          username: user.username,
          role    : normalisedRole,
          email   : user.email,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      // ── Build permission list for this role ──
      const userPermissions = AuthController._getPermissionsForRole(normalisedRole);

      return res.status(200).json({
        success  : true,
        token    : token,
        expiresIn: JWT_EXPIRES,
        user     : {
          id         : user.id,
          username   : user.username,
          full_name  : user.full_name,
          role       : normalisedRole,
          email      : user.email,
          permissions: userPermissions,
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
  // ==========================================
  static async getMe(req, res) {
    try {
      const [rows] = await db.query(
        'SELECT id, username, full_name, role, email, is_active, created_at FROM users WHERE id = ?',
        [req.user.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user           = rows[0];
      const normalisedRole = AuthController._normaliseRole(user.role);
      const userPermissions = AuthController._getPermissionsForRole(normalisedRole);

      return res.status(200).json({
        success: true,
        user   : {
          ...user,
          role       : normalisedRole,
          permissions: userPermissions,
        },
      });

    } catch (error) {
      console.error('GetMe error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to get user info' });
    }
  }

  // ==========================================
  // POST /api/auth/logout
  // ==========================================
  static async logout(req, res) {
    // JWT is stateless — actual logout is handled client-side
    // by deleting the stored token.
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  /**
   * Map legacy DB role values to the new role names.
   *
   *   DB value      New role
   *   ──────────────────────
   *   admin       → admin
   *   dispatcher  → scheduler   (legacy)
   *   driver      → technician  (legacy)
   *   scheduler   → scheduler
   *   technician  → technician
   */
  static _normaliseRole(dbRole) {
    const map = {
      dispatcher: USER_ROLE.SCHEDULER,
      driver    : USER_ROLE.TECHNICIAN,
      admin     : USER_ROLE.ADMIN,
      scheduler : USER_ROLE.SCHEDULER,
      technician: USER_ROLE.TECHNICIAN,
    };
    return map[dbRole] ?? dbRole;
  }

  /**
   * Returns all permission keys that a given role holds.
   * This list is sent to the client so the Flutter app can
   * show/hide UI elements without making extra round-trips.
   */
  static _getPermissionsForRole(role) {
    const { PERMISSIONS } = require('../config/constants');
    return Object.entries(PERMISSIONS)
      .filter(([, roles]) => roles.includes(role))
      .map(([permission]) => permission);
  }
}

module.exports = AuthController;