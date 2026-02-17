// ============================================
// FILE: src/routes/jobAssignmentRoutes.js
// PURPOSE: Define API routes for job assignments
// LAYER: Route Layer (URL endpoints)
// ============================================

const express = require('express');
const router = express.Router();
const JobAssignmentController = require('../controllers/jobAssignmentController');

/**
 * Job Assignment Routes
 * 
 * These routes handle all API endpoints related to assigning vehicles to jobs.
 * 
 * Base URL: /api/job-assignments
 */

// ==========================================
// POST /api/job-assignments/assign
// PURPOSE: Assign a vehicle to a job
// ==========================================
/**
 * Assign a vehicle to a job
 * 
 * Request body:
 * {
 *   "job_id": 5,
 *   "vehicle_id": 2,
 *   "driver_id": 3,        // Optional
 *   "notes": "Some notes", // Optional
 *   "assigned_by": 1       // Required - user making the assignment
 * }
 * 
 * Success response (201):
 * {
 *   "success": true,
 *   "message": "Job assigned to vehicle successfully",
 *   "data": { ... complete assignment details ... }
 * }
 * 
 * Error responses:
 * - 400: Missing required fields or validation error
 * - 409: Time conflict detected
 * - 500: Server error
 */
router.post('/assign', JobAssignmentController.assignJob);

// ==========================================
// POST /api/job-assignments/unassign
// PURPOSE: Remove vehicle assignment from a job
// ==========================================
/**
 * Unassign a vehicle from a job
 * 
 * Request body:
 * {
 *   "job_id": 5
 * }
 * 
 * Success response (200):
 * {
 *   "success": true,
 *   "message": "Job unassigned successfully. Status changed to pending."
 * }
 */
router.post('/unassign', JobAssignmentController.unassignJob);

// ==========================================
// GET /api/job-assignments/vehicle/:vehicle_id
// PURPOSE: Get all assignments for a specific vehicle
// ==========================================
/**
 * Get all assignments for a vehicle
 * 
 * URL params:
 * - vehicle_id: The vehicle ID
 * 
 * Query params (optional):
 * - date: Filter by date (YYYY-MM-DD format)
 * 
 * Example: GET /api/job-assignments/vehicle/2?date=2024-02-20
 * 
 * Success response (200):
 * {
 *   "success": true,
 *   "count": 3,
 *   "data": [ ... array of assignments ... ]
 * }
 */
router.get('/vehicle/:vehicle_id', JobAssignmentController.getAssignmentsByVehicle);

// Export the router
module.exports = router;