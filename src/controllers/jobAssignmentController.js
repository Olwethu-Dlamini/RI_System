// ============================================
// FILE: src/controllers/jobAssignmentController.js
// PURPOSE: Handle HTTP requests for job assignments
// LAYER: Controller Layer (handles requests/responses)
// ============================================

const JobAssignmentService = require('../services/jobAssignmentService');

/**
 * Job Assignment Controller
 * 
 * This controller handles API requests for assigning vehicles to jobs.
 * It validates the incoming request data, calls the service layer,
 * and sends appropriate HTTP responses back to the client.
 */
class JobAssignmentController {
  
  // ==========================================
  // FUNCTION: assignJob
  // PURPOSE: Handle POST request to assign a vehicle to a job
  // ROUTE: POST /api/job-assignments/assign
  // ==========================================
  /**
   * Assign a vehicle to a job
   * 
   * Request body should contain:
   * {
   *   "job_id": 5,
   *   "vehicle_id": 2,
   *   "driver_id": 3,        // Optional
   *   "notes": "Some notes", // Optional
   *   "assigned_by": 1       // User ID making the assignment
   * }
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async assignJob(req, res) {
    try {
      // ============================================
      // Extract data from request body
      // ============================================
      const { job_id, vehicle_id, driver_id, notes, assigned_by } = req.body;
      
      // ============================================
      // Validate required fields
      // ============================================
      
      // Check if job_id is provided
      if (!job_id) {
        return res.status(400).json({
          success: false,
          message: 'job_id is required'
        });
      }
      
      // Check if vehicle_id is provided
      if (!vehicle_id) {
        return res.status(400).json({
          success: false,
          message: 'vehicle_id is required'
        });
      }
      
      // Check if assigned_by is provided
      if (!assigned_by) {
        return res.status(400).json({
          success: false,
          message: 'assigned_by (user ID) is required'
        });
      }
      
      // Validate that IDs are numbers
      if (isNaN(job_id) || isNaN(vehicle_id) || isNaN(assigned_by)) {
        return res.status(400).json({
          success: false,
          message: 'job_id, vehicle_id, and assigned_by must be valid numbers'
        });
      }
      
      // ============================================
      // Call service layer to perform assignment
      // ============================================
      console.log('📋 Attempting to assign job...');
      console.log(`   Job ID: ${job_id}`);
      console.log(`   Vehicle ID: ${vehicle_id}`);
      console.log(`   Driver ID: ${driver_id || 'None'}`);
      
      const assignment = await JobAssignmentService.assignJobToVehicle({
        job_id: parseInt(job_id),
        vehicle_id: parseInt(vehicle_id),
        driver_id: driver_id ? parseInt(driver_id) : null,
        notes: notes || null,
        assigned_by: parseInt(assigned_by)
      });
      
      // ============================================
      // Send success response
      // ============================================
      console.log('✅ Assignment successful!');
      
      return res.status(201).json({
        success: true,
        message: 'Job assigned to vehicle successfully',
        data: assignment
      });
      
    } catch (error) {
      // ============================================
      // Handle errors and send appropriate response
      // ============================================
      console.error('❌ Error in assignJob controller:', error.message);
      
      // Check for specific error types
      
      // Validation errors (job not found, vehicle not found, etc.)
      if (
        error.message.includes('not found') ||
        error.message.includes('already assigned') ||
        error.message.includes('Cannot assign job') ||
        error.message.includes('is currently inactive')
      ) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      // Time conflict errors
      if (error.message.includes('Time conflict')) {
        return res.status(409).json({ // 409 = Conflict
          success: false,
          message: error.message
        });
      }
      
      // Database errors
      if (error.code && error.code.startsWith('ER_')) {
        return res.status(500).json({
          success: false,
          message: 'Database error occurred',
          error: error.message
        });
      }
      
      // Generic server error
      return res.status(500).json({
        success: false,
        message: 'An error occurred while assigning the job',
        error: error.message
      });
    }
  }
  
  // ==========================================
  // BONUS FUNCTION: unassignJob
  // PURPOSE: Handle POST request to unassign a job
  // ROUTE: POST /api/job-assignments/unassign
  // ==========================================
  /**
   * Unassign a vehicle from a job
   * 
   * Request body should contain:
   * {
   *   "job_id": 5
   * }
   */
  static async unassignJob(req, res) {
    try {
      const { job_id } = req.body;
      
      // Validate required field
      if (!job_id) {
        return res.status(400).json({
          success: false,
          message: 'job_id is required'
        });
      }
      
      if (isNaN(job_id)) {
        return res.status(400).json({
          success: false,
          message: 'job_id must be a valid number'
        });
      }
      
      // Call service layer
      const result = await JobAssignmentService.unassignJob(parseInt(job_id));
      
      return res.status(200).json({
        success: true,
        message: result.message
      });
      
    } catch (error) {
      console.error('Error in unassignJob controller:', error.message);
      
      if (error.message.includes('not currently assigned')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'An error occurred while unassigning the job',
        error: error.message
      });
    }
  }
  
  // ==========================================
  // BONUS FUNCTION: getAssignmentsByVehicle
  // PURPOSE: Get all assignments for a specific vehicle
  // ROUTE: GET /api/job-assignments/vehicle/:vehicle_id
  // ==========================================
  /**
   * Get all assignments for a vehicle
   * 
   * URL parameter: vehicle_id
   * Optional query params: date (YYYY-MM-DD)
   */
  static async getAssignmentsByVehicle(req, res) {
    try {
      const { vehicle_id } = req.params;
      const { date } = req.query;
      
      if (!vehicle_id || isNaN(vehicle_id)) {
        return res.status(400).json({
          success: false,
          message: 'Valid vehicle_id is required'
        });
      }
      
      const Job = require('../models/Job');
      const assignments = await Job.getJobsByVehicle(
        parseInt(vehicle_id),
        date || null,
        ['completed', 'cancelled'] // Exclude completed/cancelled
      );
      
      return res.status(200).json({
        success: true,
        count: assignments.length,
        data: assignments
      });
      
    } catch (error) {
      console.error('Error in getAssignmentsByVehicle:', error.message);
      
      return res.status(500).json({
        success: false,
        message: 'An error occurred while fetching assignments',
        error: error.message
      });
    }
  }
}

module.exports = JobAssignmentController;