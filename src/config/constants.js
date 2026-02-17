// ============================================
// Application Constants
// ============================================
// This file contains all constant values used in the application
// Using constants prevents typos and makes code easier to maintain
// Instead of: status = 'pendng' (typo!)
// We use: status = JOB_STATUS.PENDING (safe!)

// ============================================
// Job Status Values
// ============================================
// Must match the ENUM in database jobs table
// Lifecycle: pending → assigned → in_progress → completed/cancelled

const JOB_STATUS = {
  PENDING: 'pending',           // Job created, not assigned yet
  ASSIGNED: 'assigned',         // Assigned to vehicle and driver
  IN_PROGRESS: 'in_progress',  // Driver started the job
  COMPLETED: 'completed',       // Job finished successfully
  CANCELLED: 'cancelled'        // Job cancelled/aborted
};

// ============================================
// Job Types
// ============================================
// Must match the ENUM in database jobs table

const JOB_TYPE = {
  INSTALLATION: 'installation',  // Install equipment at customer site
  DELIVERY: 'delivery',          // Deliver products
  MAINTENANCE: 'maintenance'     // Routine maintenance work
};

// ============================================
// Job Priority Levels
// ============================================
// Must match the ENUM in database jobs table

const JOB_PRIORITY = {
  LOW: 'low',           // Can wait, no rush
  NORMAL: 'normal',     // Standard priority
  HIGH: 'high',         // Important, schedule soon
  URGENT: 'urgent'      // Emergency, top priority
};

// ============================================
// User Roles
// ============================================
// Must match the ENUM in database users table

const USER_ROLE = {
  ADMIN: 'admin',           // Full system access
  DISPATCHER: 'dispatcher',  // Can create/assign jobs
  DRIVER: 'driver'          // Can view assigned jobs
};

// ============================================
// Vehicle Types
// ============================================
// Must match the ENUM in database vehicles table

const VEHICLE_TYPE = {
  VAN: 'van',       // Delivery van
  TRUCK: 'truck',   // Pickup truck
  CAR: 'car'        // Service car
};

// ============================================
// HTTP Status Codes
// ============================================
// Standard HTTP response codes

const HTTP_STATUS = {
  OK: 200,                    // Success
  CREATED: 201,               // Resource created
  BAD_REQUEST: 400,           // Invalid request
  UNAUTHORIZED: 401,          // Not authenticated
  FORBIDDEN: 403,             // Not authorized
  NOT_FOUND: 404,             // Resource not found
  CONFLICT: 409,              // Conflict (e.g., double booking)
  INTERNAL_SERVER_ERROR: 500  // Server error
};

// ============================================
// Time Constants
// ============================================
// Useful for calculations and validation

const TIME_CONSTANTS = {
  MINUTES_PER_HOUR: 60,
  HOURS_PER_DAY: 24,
  BUFFER_TIME_MINUTES: 30,  // Buffer time between jobs (for travel)
  MAX_JOB_DURATION_HOURS: 8  // Maximum job duration in hours
};

// ============================================
// Validation Rules
// ============================================
// Business rules for validation

const VALIDATION_RULES = {
  MIN_CUSTOMER_NAME_LENGTH: 2,
  MAX_CUSTOMER_NAME_LENGTH: 100,
  MIN_DESCRIPTION_LENGTH: 5,
  MAX_DESCRIPTION_LENGTH: 1000,
  PHONE_REGEX: /^[\d\s\-\+\(\)]+$/,  // Allows: 555-0123, (555) 012-3456, +1 555 0123
  JOB_NUMBER_PREFIX: 'JOB-'
};

// ============================================
// Error Messages
// ============================================
// Standardized error messages

const ERROR_MESSAGES = {
  DATABASE_ERROR: 'Database operation failed',
  VALIDATION_ERROR: 'Invalid input data',
  NOT_FOUND: 'Resource not found',
  ALREADY_EXISTS: 'Resource already exists',
  DOUBLE_BOOKING: 'Vehicle is already booked for this time slot',
  INVALID_TIME_RANGE: 'End time must be after start time',
  PAST_DATE: 'Cannot schedule jobs in the past',
  VEHICLE_NOT_ACTIVE: 'Vehicle is not available (out of service)',
  UNAUTHORIZED: 'You do not have permission to perform this action'
};

// ============================================
// Success Messages
// ============================================
// Standardized success messages

const SUCCESS_MESSAGES = {
  JOB_CREATED: 'Job created successfully',
  JOB_UPDATED: 'Job updated successfully',
  JOB_DELETED: 'Job deleted successfully',
  JOB_ASSIGNED: 'Job assigned successfully',
  STATUS_CHANGED: 'Job status updated successfully',
  VEHICLE_CREATED: 'Vehicle created successfully',
  VEHICLE_UPDATED: 'Vehicle updated successfully'
};

// ============================================
// Export All Constants
// ============================================
// Other files can import these constants

module.exports = {
  JOB_STATUS,
  JOB_TYPE,
  JOB_PRIORITY,
  USER_ROLE,
  VEHICLE_TYPE,
  HTTP_STATUS,
  TIME_CONSTANTS,
  VALIDATION_RULES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};