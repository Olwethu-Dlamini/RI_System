// ============================================
// FILE: src/services/jobAssignmentService.js
// PURPOSE: Business logic for assigning jobs to vehicles
// LAYER: Service Layer (business logic)
// ============================================

const db = require('../config/database');
const Job = require('../models/Job');
const Vehicle = require('../models/Vehicle');
const VehicleAvailabilityService = require('./vehicleAvailabilityService');

/**
 * Job Assignment Service - CORRECTED FOR EXISTING SCHEMA
 * 
 * KEY FIXES:
 * ✅ ALL validations/conflict checks OUTSIDE transaction (prevents long lock holds)
 * ✅ SINGLE minimal transaction with ONLY write operations (< 50ms lock time)
 * ✅ NO nested transactions (avoids lock escalation)
 * ✅ SIMPLE status update (works with existing jobs.current_status column)
 * ✅ REMOVED non-existent 'phone' column reference from users table
 * ✅ Guaranteed connection release in ALL code paths
 */
class JobAssignmentService {
  
  // ==========================================
  // MAIN FUNCTION: assignJobToVehicle
  // PURPOSE: Assign vehicle to job with minimal lock contention
  // ==========================================
  static async assignJobToVehicle(assignmentData) {
    // ✅ STEP 0: EXTRACT DATA (outside transaction)
    const { job_id, vehicle_id, driver_id = null, notes = null, assigned_by } = assignmentData;
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 Starting Job Assignment Process');
    console.log('═══════════════════════════════════════════════════════');
    
    // ============================================
    // ✅ STEP 1: VALIDATE JOB (READ-ONLY - OUTSIDE TRANSACTION)
    // ============================================
    console.log(`\n📋 STEP 1: Validating job ID ${job_id} (read-only)...`);
    
    const job = await Job.getJobById(job_id);
    if (!job) {
      throw new Error(`Job with ID ${job_id} not found`);
    }
    
    console.log(`   Job Number: ${job.job_number}`);
    console.log(`   Current Status: ${job.current_status}`);
    
    // Check if job is in a status that allows assignment
    if (!['pending', 'assigned'].includes(job.current_status)) {
      throw new Error(
        `Cannot assign job with status "${job.current_status}". ` +
        `Job must be in "pending" or "assigned" status to be assigned.`
      );
    }
    
    console.log('   ✓ Job validation passed');
    
    // ============================================
    // ✅ STEP 2: VALIDATE VEHICLE (READ-ONLY - OUTSIDE TRANSACTION)
    // ============================================
    console.log(`\n🚗 STEP 2: Validating vehicle ID ${vehicle_id} (read-only)...`);
    
    const vehicle = await Vehicle.getVehicleById(vehicle_id);
    if (!vehicle) {
      throw new Error(`Vehicle with ID ${vehicle_id} not found`);
    }
    
    console.log(`   Vehicle Name: ${vehicle.vehicle_name}`);
    console.log(`   License Plate: ${vehicle.license_plate}`);
    console.log(`   Active: ${vehicle.is_active ? 'Yes' : 'No'}`);
    
    if (!vehicle.is_active) {
      throw new Error(
        `Vehicle "${vehicle.vehicle_name}" (${vehicle.license_plate}) is currently inactive. ` +
        `Please activate the vehicle before assigning jobs.`
      );
    }
    
    console.log('   ✓ Vehicle validation passed');
    
    // ============================================
    // ✅ STEP 3: CHECK CONFLICTS (READ-ONLY - OUTSIDE TRANSACTION)
    // ============================================
    console.log(`\n⏰ STEP 3: Checking scheduling conflicts (read-only)...`);
    console.log(`   Date: ${job.scheduled_date}`);
    console.log(`   Time: ${job.scheduled_time_start} - ${job.scheduled_time_end}`);
    
    const availabilityCheck = await VehicleAvailabilityService.checkVehicleAvailability(
      vehicle_id,
      job.scheduled_date,
      job.scheduled_time_start,
      job.scheduled_time_end,
      job_id // Exclude current job from conflict check
    );
    
    if (!availabilityCheck.isAvailable) {
      // Build concise conflict message
      const conflictList = availabilityCheck.conflicts.map((conflict, index) => 
        `   ${index + 1}. ${conflict.job_number} (${conflict.scheduled_time_start} - ${conflict.scheduled_time_end})`
      ).join('\n');
      
      throw new Error(
        `Time conflict detected for vehicle "${vehicle.vehicle_name}":\n` +
        conflictList + '\n' +
        `Suggestion: Choose a different vehicle or reschedule the job.`
      );
    }
    
    console.log('   ✓ No scheduling conflicts found');
    
    // ============================================
    // ✅ STEP 4: MINIMAL TRANSACTION (WRITE-ONLY OPERATIONS ONLY)
    // ============================================
    console.log(`\n💾 STEP 4: Executing atomic write operations...`);
    
    let connection = null;
    let assignmentId = null;
    
    try {
      // Acquire connection and start transaction ONLY for writes
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      // ✅ WRITE 1: Delete existing assignment (handles reassignment safely)
      await connection.query(
        'DELETE FROM job_assignments WHERE job_id = ?',
        [job_id]
      );
      console.log('   ✓ Cleared existing assignment for this job');
      
      // ✅ WRITE 2: Create new assignment record
      const [assignmentResult] = await connection.query(
        `INSERT INTO job_assignments (
          job_id,
          vehicle_id,
          driver_id,
          notes,
          assigned_by,
          assigned_at
        ) VALUES (?, ?, ?, ?, ?, NOW())`,
        [job_id, vehicle_id, driver_id, notes, assigned_by]
      );
      
      assignmentId = assignmentResult.insertId;
      console.log(`   ✓ Created assignment record (ID: ${assignmentId})`);
      
      // ✅ WRITE 3: Update job status IN SAME TRANSACTION (SIMPLE UPDATE - NO HISTORY TABLE)
      await connection.query(
        'UPDATE jobs SET current_status = ?, updated_at = NOW() WHERE id = ?',
        ['assigned', job_id]
      );
      
      console.log('   ✓ Updated job status: pending → assigned');
      
      // ✅ COMMIT - Release locks immediately after writes complete
      await connection.commit();
      console.log('   ✓ Transaction committed (locks released)');
      
    } catch (error) {
      // Rollback on error if transaction was started
      if (connection) {
        try {
          await connection.rollback();
          console.warn('   ⚠️ Transaction rolled back due to error');
        } catch (rollbackErr) {
          console.error('   ❌ Error during rollback:', rollbackErr.message);
        }
      }
      
      // Special handling for lock timeouts
      if (
        error.message.includes('Lock wait timeout exceeded') || 
        error.message.includes('try restarting transaction') ||
        error.code === 'ER_LOCK_WAIT_TIMEOUT'
      ) {
        throw new Error(
          'Database lock timeout during assignment. ' +
          'This usually means another process is modifying the same job/vehicle simultaneously. ' +
          'Please wait 2 seconds and retry the assignment.'
        );
      }
      
      // Re-throw all other errors
      throw error;
      
    } finally {
      // ALWAYS release connection regardless of success/failure
      if (connection) {
        connection.release();
        console.log('   ✓ Database connection released');
      }
    }
    
    // ============================================
    // ✅ STEP 5: FETCH RESULT (READ-ONLY - OUTSIDE TRANSACTION)
    // ============================================
    console.log(`\n📊 STEP 5: Fetching complete assignment details...`);
    const completeAssignment = await this.getAssignmentDetails(assignmentId);
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Job Assignment Completed Successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Job: ${completeAssignment.job_number}`);
    console.log(`   Vehicle: ${completeAssignment.vehicle_name} (${completeAssignment.license_plate})`);
    console.log(`   Date: ${completeAssignment.scheduled_date}`);
    console.log(`   Time: ${completeAssignment.scheduled_time_start} - ${completeAssignment.scheduled_time_end}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    return {
      success: true,
      message: 'Job assigned successfully',
       completeAssignment
    };
  }
  
  // ==========================================
  // FUNCTION: unassignJob
  // PURPOSE: Remove vehicle assignment from a job
  // ==========================================
  static async unassignJob(jobId, changedBy) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 Starting Job Unassignment Process');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Job ID: ${jobId}\n`);
    
    // ✅ VALIDATIONS OUTSIDE TRANSACTION (READ-ONLY)
    const job = await Job.getJobById(jobId);
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    console.log(`   Job Number: ${job.job_number}`);
    console.log(`   Current Status: ${job.current_status}`);
    
    // Check if job has an assignment
    const [assignments] = await db.query(
      `SELECT 
        ja.id,
        v.vehicle_name,
        v.license_plate,
        u.full_name as driver_name
      FROM job_assignments ja
      INNER JOIN vehicles v ON ja.vehicle_id = v.id
      LEFT JOIN users u ON ja.driver_id = u.id
      WHERE ja.job_id = ?`,
      [jobId]
    );
    
    if (assignments.length === 0) {
      throw new Error(
        `Job ${job.job_number} is not currently assigned to any vehicle. ` +
        `Cannot unassign a job that has no assignment.`
      );
    }
    
    const assignment = assignments[0];
    console.log(`   Assigned to: ${assignment.vehicle_name} (${assignment.license_plate})`);
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
    
    // ✅ MINIMAL TRANSACTION FOR WRITES ONLY
    let connection = null;
    
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      // Delete the assignment
      console.log('\n   Removing assignment from database...');
      await connection.query(
        'DELETE FROM job_assignments WHERE job_id = ?',
        [jobId]
      );
      console.log('   ✓ Assignment removed');
      
      // Update job status IN SAME TRANSACTION (simple update - no history table)
      await connection.query(
        'UPDATE jobs SET current_status = ?, updated_at = NOW() WHERE id = ?',
        ['pending', jobId]
      );
      
      console.log('   ✓ Job status updated to pending');
      
      await connection.commit();
      
    } catch (error) {
      if (connection) {
        await connection.rollback();
        console.warn('   ⚠️ Transaction rolled back');
      }
      throw error;
      
    } finally {
      if (connection) {
        connection.release();
        console.log('   ✓ Database connection released');
      }
    }
    
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
  }
  
  // ==========================================
  // FUNCTION: reassignJob
  // PURPOSE: Move a job from one vehicle to another
  // ==========================================
  static async reassignJob(reassignmentData) {
    const { job_id, new_vehicle_id, driver_id = null, notes = null, assigned_by } = reassignmentData;
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 Starting Job Reassignment Process');
    console.log('═══════════════════════════════════════════════════════');
    
    // Get current job details for logging
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
    
    // Directly assign to new vehicle
    console.log('   Assigning to new vehicle...');
    const newAssignment = await this.assignJobToVehicle({
      job_id,
      vehicle_id: new_vehicle_id,
      driver_id,
      notes: notes || `Reassigned from ${job.vehicle_name || 'previous vehicle'}`,
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
  }
  
  // ==========================================
  // HELPER FUNCTION: getAssignmentDetails (FIXED - REMOVED NON-EXISTENT 'phone' COLUMN)
  // PURPOSE: Get complete assignment information using ONLY existing columns
  // ==========================================
  static async getAssignmentDetails(assignmentId) {
    try {
      const [rows] = await db.query(
        `SELECT 
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
          
          -- Driver info (if assigned) - USING ONLY EXISTING COLUMNS
          d.id as driver_id,
          d.full_name as driver_name,
          d.email as driver_email,
          -- REMOVED: d.phone (column doesn't exist in your schema)
          
          -- Assigned by user info
          u.full_name as assigned_by_name,
          u.email as assigned_by_email
          
        FROM job_assignments ja
        INNER JOIN jobs j ON ja.job_id = j.id
        INNER JOIN vehicles v ON ja.vehicle_id = v.id
        LEFT JOIN users d ON ja.driver_id = d.id
        INNER JOIN users u ON ja.assigned_by = u.id
        WHERE ja.id = ?`,
        [assignmentId]
      );
      
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
          u.full_name as driver_name,
          u.email as driver_email  -- CHANGED FROM phone TO email (guaranteed to exist)
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