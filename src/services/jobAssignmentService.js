// ============================================
// FILE: src/services/jobAssignmentService.js
// PURPOSE: Business logic for assigning jobs to vehicles
// LAYER: Service Layer (business logic)
// ============================================

const db = require('../config/database');
const Job = require('../models/Job');
const Vehicle = require('../models/Vehicle');
const VehicleAvailabilityService = require('./vehicleAvailabilityService');
const JobStatusService = require('./jobStatusService');

/**
 * Job Assignment Service
 * 
 * This service handles the business logic for assigning vehicles to jobs.
 * 
 * Steps performed:
 * 1. Validate job exists and is assignable
 * 2. Validate vehicle exists and is active
 * 3. Check for time conflicts using VehicleAvailabilityService
 * 4. Create assignment in job_assignments table
 * 5. Update job status to "assigned" using JobStatusService
 * 6. Return complete assignment details
 * 
 * This service orchestrates multiple other services:
 * - Job Model: For job data
 * - Vehicle Model: For vehicle data
 * - VehicleAvailabilityService: For conflict checking
 * - JobStatusService: For status lifecycle management
 */
class JobAssignmentService {
  
  // ==========================================
  // MAIN FUNCTION: assignJobToVehicle
  // PURPOSE: Assign a vehicle to a job with full validation
  // ==========================================
  /**
   * Assign a vehicle to a job
   * 
   * @param {Object} assignmentData - Assignment details
   * @param {number} assignmentData.job_id - The job ID to assign
   * @param {number} assignmentData.vehicle_id - The vehicle ID to assign
   * @param {number} assignmentData.driver_id - Optional driver ID
   * @param {string} assignmentData.notes - Optional assignment notes
   * @param {number} assignmentData.assigned_by - User ID who is making the assignment
   * @returns {Promise<Object>} Complete assignment details
   * 
   * Example usage:
   *   const assignment = await JobAssignmentService.assignJobToVehicle({
   *     job_id: 5,
   *     vehicle_id: 2,
   *     driver_id: 3,
   *     notes: 'Driver is experienced with this route',
   *     assigned_by: 1
   *   });
   */
  static async assignJobToVehicle(assignmentData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Extract data from input
      const { job_id, vehicle_id, driver_id = null, notes = null, assigned_by } = assignmentData;
      
      console.log('═══════════════════════════════════════════════════════');
      console.log('🚀 Starting Job Assignment Process');
      console.log('═══════════════════════════════════════════════════════');
      
      // ============================================
      // STEP 1: Validate job exists and get details
      // ============================================
      console.log(`\n📋 STEP 1: Validating job ID ${job_id}...`);
      
      const job = await Job.getJobById(job_id);
      
      // Check if job exists
      if (!job) {
        throw new Error(`Job with ID ${job_id} not found`);
      }
      
      console.log(`   Job Number: ${job.job_number}`);
      console.log(`   Customer: ${job.customer_name}`);
      console.log(`   Current Status: ${job.current_status}`);
      console.log(`   Scheduled: ${job.scheduled_date} ${job.scheduled_time_start} - ${job.scheduled_time_end}`);
      
      // Check if job is already assigned
      if (job.current_status === 'assigned') {
        console.log('   ℹ️  Job is already assigned - proceeding with reassignment');
      }
      
      // Check if job is in a status that allows assignment
      // We can only assign jobs that are "pending" or already "assigned" (for reassignment)
      if (!['pending', 'assigned'].includes(job.current_status)) {
        throw new Error(
          `Cannot assign job with status "${job.current_status}". ` +
          `Job must be in "pending" or "assigned" status to be assigned. ` +
          `Current allowed transitions: ${JobStatusService.ALLOWED_TRANSITIONS[job.current_status]?.join(', ') || 'none'}`
        );
      }
      
      console.log('   ✓ Job is valid and ready to assign');
      
      // ============================================
      // STEP 2: Validate vehicle exists and is active
      // ============================================
      console.log(`\n🚗 STEP 2: Validating vehicle ID ${vehicle_id}...`);
      
      const vehicle = await Vehicle.getVehicleById(vehicle_id);
      
      // Check if vehicle exists
      if (!vehicle) {
        throw new Error(`Vehicle with ID ${vehicle_id} not found`);
      }
      
      console.log(`   Vehicle Name: ${vehicle.vehicle_name}`);
      console.log(`   License Plate: ${vehicle.license_plate}`);
      console.log(`   Type: ${vehicle.vehicle_type}`);
      console.log(`   Active: ${vehicle.is_active ? 'Yes' : 'No'}`);
      
      // Check if vehicle is active (not in maintenance)
      if (!vehicle.is_active) {
        throw new Error(
          `Vehicle "${vehicle.vehicle_name}" (${vehicle.license_plate}) is currently inactive. ` +
          `This usually means the vehicle is in maintenance or out of service. ` +
          `Please activate the vehicle before assigning jobs.`
        );
      }
      
      console.log('   ✓ Vehicle is active and available');
      
      // ============================================
      // STEP 3: Check for time conflicts
      // ============================================
      console.log(`\n⏰ STEP 3: Checking for scheduling conflicts...`);
      console.log(`   Date: ${job.scheduled_date}`);
      console.log(`   Time: ${job.scheduled_time_start} - ${job.scheduled_time_end}`);
      console.log(`   Duration: ${job.estimated_duration_minutes} minutes`);
      
      // Use the VehicleAvailabilityService to check conflicts
      const availabilityCheck = await VehicleAvailabilityService.checkVehicleAvailability(
        vehicle_id,
        job.scheduled_date,
        job.scheduled_time_start,
        job.scheduled_time_end,
        job_id // Exclude current job from conflict check (important for updates)
      );
      
      // Check if vehicle is not available
      if (!availabilityCheck.isAvailable) {
        console.log('   ❌ Conflict detected!');
        
        // Build detailed error message with conflict information
        let errorMsg = `\n⚠️  TIME CONFLICT DETECTED!\n\n`;
        errorMsg += `Vehicle "${vehicle.vehicle_name}" is already scheduled during this time.\n\n`;
        errorMsg += `Requested time slot: ${job.scheduled_date} ${job.scheduled_time_start} - ${job.scheduled_time_end}\n\n`;
        errorMsg += `Conflicting jobs (${availabilityCheck.conflicts.length}):\n`;
        errorMsg += `${'─'.repeat(70)}\n`;
        
        availabilityCheck.conflicts.forEach((conflict, index) => {
          errorMsg += `\n${index + 1}. Job: ${conflict.job_number}\n`;
          errorMsg += `   Customer: ${conflict.customer_name}\n`;
          errorMsg += `   Time Slot: ${conflict.scheduled_time_start} - ${conflict.scheduled_time_end}\n`;
          errorMsg += `   Job Type: ${conflict.job_type}\n`;
          errorMsg += `   Status: ${conflict.current_status}\n`;
          errorMsg += `   Priority: ${conflict.priority}\n`;
          if (conflict.driver_name) {
            errorMsg += `   Driver: ${conflict.driver_name}\n`;
          }
        });
        
        errorMsg += `\n${'─'.repeat(70)}\n`;
        errorMsg += `\nSuggestion: Choose a different vehicle or reschedule the job.\n`;
        
        throw new Error(errorMsg);
      }
      
      console.log('   ✓ No scheduling conflicts found');
      console.log(`   ✓ Vehicle is available for ${availabilityCheck.details?.duration || 'N/A'} minutes`);
      
      // ============================================
      // STEP 4: Create the assignment record
      // ============================================
      console.log(`\n💾 STEP 4: Creating job assignment in database...`);
      
      // ✅ FIX: Delete existing assignment for this job first (handles re-assignment)
      // This prevents "Duplicate entry" errors on the unique_vehicle_job constraint
      await connection.query('DELETE FROM job_assignments WHERE job_id = ?', [job_id]);
      console.log('   ✓ Cleared any existing assignment for this job');
      
      const assignmentSql = `
        INSERT INTO job_assignments (
          job_id,
          vehicle_id,
          driver_id,
          notes,
          assigned_by,
          assigned_at
        ) VALUES (?, ?, ?, ?, ?, NOW())
      `;
      
      const [assignmentResult] = await connection.query(assignmentSql, [
        job_id,
        vehicle_id,
        driver_id,
        notes,
        assigned_by
      ]);
      
      const assignmentId = assignmentResult.insertId;
      
      console.log(`   ✓ Assignment record created (ID: ${assignmentId})`);
      if (driver_id) {
        console.log(`   ✓ Driver assigned (ID: ${driver_id})`);
      }
      if (notes) {
        console.log(`   ✓ Assignment notes: "${notes}"`);
      }
      
      // ============================================
      // STEP 5: Update job status to "assigned"
      // ============================================
      console.log(`\n🔄 STEP 5: Updating job status to "assigned"...`);
      
      // Use JobStatusService to ensure proper status transition
      // ✅ FIX: Only pass the 3 parameters that the service expects
      await JobStatusService.updateJobStatus(
        job_id, 
        'assigned',
        assigned_by,
        `Assigned to vehicle: ${vehicle.vehicle_name} (${vehicle.license_plate})`
      );
      
      console.log('   ✓ Job status updated: pending → assigned');
      
      // ============================================
      // STEP 6: Fetch and return complete assignment details
      // ============================================
      console.log(`\n📊 STEP 6: Fetching complete assignment details...`);
      
      const completeAssignment = await this.getAssignmentDetails(assignmentId);
      
      console.log('   ✓ Assignment details retrieved');
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('✅ Job Assignment Completed Successfully!');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`   Job: ${completeAssignment.job_number}`);
      console.log(`   Vehicle: ${completeAssignment.vehicle_name}`);
      console.log(`   Date: ${completeAssignment.scheduled_date}`);
      console.log(`   Time: ${completeAssignment.scheduled_time_start} - ${completeAssignment.scheduled_time_end}`);
      console.log('═══════════════════════════════════════════════════════\n');
      
      await connection.commit();
      
      return {
        success: true,
        message: 'Job assigned successfully',
        data: completeAssignment
      };
      
    } catch (error) {
      await connection.rollback();
      console.error('\n❌ Error in JobAssignmentService.assignJobToVehicle:');
      console.error('═══════════════════════════════════════════════════════');
      console.error(error.message);
      console.error('═══════════════════════════════════════════════════════\n');
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // ==========================================
  // FUNCTION: unassignJob
  // PURPOSE: Remove vehicle assignment from a job
  // ==========================================
  /**
   * Unassign a vehicle from a job
   * This removes the assignment and changes job status back to "pending"
   * 
   * @param {number} jobId - The job ID to unassign
   * @param {number} changedBy - User ID performing the unassignment
   * @returns {Promise<Object>} Result of unassignment
   * 
   * Example usage:
   *   const result = await JobAssignmentService.unassignJob(5, 1);
   */
  static async unassignJob(jobId, changedBy) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      console.log('═══════════════════════════════════════════════════════');
      console.log('🔄 Starting Job Unassignment Process');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`   Job ID: ${jobId}\n`);
      
      // Check if job exists and get details
      const job = await Job.getJobById(jobId);
      
      if (!job) {
        throw new Error(`Job with ID ${jobId} not found`);
      }
      
      console.log(`   Job Number: ${job.job_number}`);
      console.log(`   Current Status: ${job.current_status}`);
      
      // Check if job has an assignment
      const checkSql = `
        SELECT 
          ja.id,
          v.vehicle_name,
          u.full_name as driver_name
        FROM job_assignments ja
        LEFT JOIN vehicles v ON ja.vehicle_id = v.id
        LEFT JOIN users u ON ja.driver_id = u.id
        WHERE ja.job_id = ?
      `;
      
      const [assignments] = await connection.query(checkSql, [jobId]);
      
      if (assignments.length === 0) {
        throw new Error(
          `Job ${job.job_number} is not currently assigned to any vehicle. ` +
          `Cannot unassign a job that has no assignment.`
        );
      }
      
      const assignment = assignments[0];
      console.log(`   Assigned to: ${assignment.vehicle_name}`);
      if (assignment.driver_name) {
        console.log(`   Driver: ${assignment.driver_name}`);
      }
      
      // Check if job can be unassigned based on status
      if (job.current_status === 'in_progress') {
        throw new Error(
          `Cannot unassign job ${job.job_number} because it is currently in progress. ` +
          `Please complete or cancel the job first.`
        );
      }
      
      if (job.current_status === 'completed') {
        throw new Error(
          `Cannot unassign job ${job.job_number} because it is already completed. ` +
          `Completed jobs cannot be modified.`
        );
      }
      
      // Delete the assignment
      console.log('\n   Removing assignment from database...');
      const deleteSql = `
        DELETE FROM job_assignments WHERE job_id = ?
      `;
      
      await connection.query(deleteSql, [jobId]);
      console.log('   ✓ Assignment removed');
      
      // Update job status back to pending using JobStatusService
      console.log('   Updating job status: assigned → pending...');
      
      await JobStatusService.updateJobStatus(
        jobId, 
        'pending',
        changedBy,
        `Vehicle unassigned. Job returned to pending status.`
      );
      
      console.log('   ✓ Job status updated to pending');
      
      await connection.commit();
      
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('✅ Job Unassignment Completed Successfully!');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`   Job ${job.job_number} is now available for reassignment`);
      console.log('═══════════════════════════════════════════════════════\n');
      
      return {
        success: true,
        message: `Job ${job.job_number} unassigned successfully. Status changed to pending.`,
        job: {
          id: job.id,
          job_number: job.job_number,
          new_status: 'pending',
          previous_vehicle: assignment.vehicle_name
        }
      };
      
    } catch (error) {
      await connection.rollback();
      console.error('\n❌ Error in JobAssignmentService.unassignJob:');
      console.error('═══════════════════════════════════════════════════════');
      console.error(error.message);
      console.error('═══════════════════════════════════════════════════════\n');
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // ==========================================
  // FUNCTION: reassignJob
  // PURPOSE: Move a job from one vehicle to another
  // ==========================================
  /**
   * Reassign a job from one vehicle to another
   * This is a convenience function that combines unassign + assign
   * 
   * @param {Object} reassignmentData - Reassignment details
   * @param {number} reassignmentData.job_id - The job ID
   * @param {number} reassignmentData.new_vehicle_id - The new vehicle ID
   * @param {number} reassignmentData.driver_id - Optional new driver ID
   * @param {string} reassignmentData.notes - Optional reassignment notes
   * @param {number} reassignmentData.assigned_by - User ID making the change
   * @returns {Promise<Object>} Complete new assignment details
   * 
   * Example usage:
   *   const newAssignment = await JobAssignmentService.reassignJob({
   *     job_id: 5,
   *     new_vehicle_id: 3,
   *     driver_id: 2,
   *     notes: 'Reassigned due to vehicle maintenance',
   *     assigned_by: 1
   *   });
   */
  static async reassignJob(reassignmentData) {
    try {
      const { job_id, new_vehicle_id, driver_id = null, notes = null, assigned_by } = reassignmentData;
      
      console.log('═══════════════════════════════════════════════════════');
      console.log('🔄 Starting Job Reassignment Process');
      console.log('═══════════════════════════════════════════════════════');
      
      // Get current job details
      const job = await Job.getJobById(job_id);
      
      if (!job) {
        throw new Error(`Job with ID ${job_id} not found`);
      }
      
      console.log(`   Job: ${job.job_number}`);
      console.log(`   Current Vehicle: ${job.vehicle_name || 'None'}`);
      console.log(`   Status: ${job.current_status}\n`);
      
      // Only allow reassignment if job is currently assigned or pending
      if (!['pending', 'assigned'].includes(job.current_status)) {
        throw new Error(
          `Job ${job.job_number} cannot be reassigned because it is in "${job.current_status}" status. ` +
          `Only jobs in "pending" or "assigned" status can be reassigned directly.`
        );
      }
      
      // Directly assign to new vehicle (the DELETE happens inside assignJobToVehicle)
      console.log('   Assigning to new vehicle...');
      const newAssignment = await this.assignJobToVehicle({
        job_id,
        vehicle_id: new_vehicle_id,
        driver_id,
        notes: notes || `Reassigned from ${job.vehicle_name}`,
        assigned_by
      });
      
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('✅ Job Reassignment Completed Successfully!');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`   Job: ${job.job_number}`);
      console.log(`   Old Vehicle: ${job.vehicle_name || 'None'}`);
      console.log(`   New Vehicle: ${newAssignment.data?.vehicle_name || 'N/A'}`);
      console.log('═══════════════════════════════════════════════════════\n');
      
      return newAssignment;
      
    } catch (error) {
      console.error('\n❌ Error in JobAssignmentService.reassignJob:');
      console.error('═══════════════════════════════════════════════════════');
      console.error(error.message);
      console.error('═══════════════════════════════════════════════════════\n');
      throw error;
    }
  }
  
  // ==========================================
  // HELPER FUNCTION: getAssignmentDetails
  // PURPOSE: Get complete assignment information
  // RETURNS: Full assignment object with all related data
  // ==========================================
  /**
   * Get complete details of an assignment
   * Joins job, vehicle, driver, and user information
   * 
   * @param {number} assignmentId - The assignment ID
   * @returns {Promise<Object>} Complete assignment details
   */
  static async getAssignmentDetails(assignmentId) {
    try {
      const sql = `
        SELECT 
          -- Assignment info
          ja.id as assignment_id,
          ja.assigned_at,
          ja.notes as assignment_notes,
          
          -- Job info
          j.id as job_id,
          j.job_number,
          j.job_type,
          j.customer_name,
          j.customer_phone,
          j.customer_address,
          j.description as job_description,
          j.scheduled_date,
          j.scheduled_time_start,
          j.scheduled_time_end,
          j.estimated_duration_minutes,
          j.current_status,
          j.priority,
          
          -- Vehicle info
          v.id as vehicle_id,
          v.vehicle_name,
          v.license_plate,
          v.vehicle_type,
          v.capacity_kg,
          
          -- Driver info (if assigned)
          d.id as driver_id,
          d.full_name as driver_name,
          d.email as driver_email,
          d.phone as driver_phone,
          
          -- Assigned by user info
          u.full_name as assigned_by_name
          
        FROM job_assignments ja
        INNER JOIN jobs j ON ja.job_id = j.id
        INNER JOIN vehicles v ON ja.vehicle_id = v.id
        LEFT JOIN users d ON ja.driver_id = d.id
        INNER JOIN users u ON ja.assigned_by = u.id
        WHERE ja.id = ?
      `;
      
      const [rows] = await db.query(sql, [assignmentId]);
      
      if (!rows[0]) {
        throw new Error(`Assignment with ID ${assignmentId} not found`);
      }
      
      return rows[0];
      
    } catch (error) {
      console.error('Error in JobAssignmentService.getAssignmentDetails:', error);
      throw error;
    }
  }
  
  // ==========================================
  // BONUS FUNCTION: getAssignmentsByDateRange
  // PURPOSE: Get all assignments within a date range
  // ==========================================
  /**
   * Get all job assignments within a date range
   * Useful for schedule planning and reporting
   * 
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {number} vehicleId - Optional: filter by specific vehicle
   * @returns {Promise<Array>} Array of assignments
   */
  static async getAssignmentsByDateRange(startDate, endDate, vehicleId = null) {
    try {
      let sql = `
        SELECT 
          ja.id as assignment_id,
          j.job_number,
          j.customer_name,
          j.scheduled_date,
          j.scheduled_time_start,
          j.scheduled_time_end,
          j.job_type,
          j.current_status,
          v.vehicle_name,
          v.license_plate,
          u.full_name as driver_name
        FROM job_assignments ja
        INNER JOIN jobs j ON ja.job_id = j.id
        INNER JOIN vehicles v ON ja.vehicle_id = v.id
        LEFT JOIN users u ON ja.driver_id = u.id
        WHERE j.scheduled_date BETWEEN ? AND ?
      `;
      
      const params = [startDate, endDate];
      
      if (vehicleId) {
        sql += ' AND ja.vehicle_id = ?';
        params.push(vehicleId);
      }
      
      sql += ' ORDER BY j.scheduled_date ASC, j.scheduled_time_start ASC';
      
      const [assignments] = await db.query(sql, params);
      
      return assignments;
      
    } catch (error) {
      console.error('Error in JobAssignmentService.getAssignmentsByDateRange:', error);
      throw error;
    }
  }
}

// Export the service
module.exports = JobAssignmentService;