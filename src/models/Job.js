// ============================================
// FILE: src/models/Job.js
// PURPOSE: Job model - handles all job database operations
// LAYER: Data Layer (talks directly to MySQL)
// ============================================

const db = require('../config/database');

/**
 * Job Model
 * Handles all database operations for the jobs table
 * 
 * Jobs represent work orders: installations, deliveries, maintenance
 * Each job has a customer, location, time slot, and gets assigned to a vehicle
 */
class Job {
  
  // ==========================================
  // FUNCTION: createJob
  // PURPOSE: Insert a new job into database
  // RETURNS: Newly created job object with ID
  // ==========================================
  /**
   * Create a new job in the database
   * 
   * @param {Object} jobData - Job information
   * @param {string} jobData.customer_name - Customer name
   * @param {string} jobData.customer_phone - Customer phone number
   * @param {string} jobData.customer_address - Job location/address
   * @param {string} jobData.job_type - Type: 'installation', 'delivery', or 'maintenance'
   * @param {string} jobData.description - Job description/notes
   * @param {string} jobData.scheduled_date - Date in 'YYYY-MM-DD' format
   * @param {string} jobData.scheduled_time_start - Start time 'HH:MM:SS' format
   * @param {string} jobData.scheduled_time_end - End time 'HH:MM:SS' format
   * @param {number} jobData.estimated_duration_minutes - Estimated duration
   * @param {string} jobData.priority - Priority: 'low', 'normal', 'high', 'urgent'
   * @param {number} jobData.created_by - User ID who created the job
   * @returns {Promise<Object>} The newly created job with auto-generated fields
   * 
   * Example usage:
   *   const newJob = await Job.createJob({
   *     customer_name: 'John Doe',
   *     customer_phone: '555-1234',
   *     customer_address: '123 Main St, City',
   *     job_type: 'installation',
   *     description: 'Install new equipment',
   *     scheduled_date: '2024-02-20',
   *     scheduled_time_start: '09:00:00',
   *     scheduled_time_end: '12:00:00',
   *     estimated_duration_minutes: 180,
   *     priority: 'high',
   *     created_by: 1
   *   });
   */
  static async createJob(jobData) {
    try {
      // Destructure job data
      const {
        customer_name,
        customer_phone = null,
        customer_address,
        job_type,
        description = null,
        scheduled_date,
        scheduled_time_start,
        scheduled_time_end,
        estimated_duration_minutes,
        priority = 'normal',
        created_by
      } = jobData;
      
      // Generate unique job number (format: JOB-YYYY-NNNN)
      const jobNumber = await this.generateJobNumber();
      
      // SQL INSERT statement
      // current_status defaults to 'pending' in database
      const sql = `
        INSERT INTO jobs (
          job_number,
          job_type,
          customer_name,
          customer_phone,
          customer_address,
          description,
          scheduled_date,
          scheduled_time_start,
          scheduled_time_end,
          estimated_duration_minutes,
          priority,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      // Execute INSERT query
      const [result] = await db.query(sql, [
        jobNumber,
        job_type,
        customer_name,
        customer_phone,
        customer_address,
        description,
        scheduled_date,
        scheduled_time_start,
        scheduled_time_end,
        estimated_duration_minutes,
        priority,
        created_by
      ]);
      
      // Get the auto-generated ID
      const newJobId = result.insertId;
      
      // Fetch and return the complete job object
      const newJob = await this.getJobById(newJobId);
      
      return newJob;
      
    } catch (error) {
      console.error('Error in Job.createJob:', error);
      
      // Check for specific errors
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Job number already exists (duplicate entry)');
      }
      
      if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        throw new Error('Invalid user ID - creator does not exist');
      }
      
      throw error;
    }
  }
  
  // ==========================================
  // FUNCTION: updateJob
  // PURPOSE: Update job details
  // RETURNS: Updated job object
  // ==========================================
  /**
   * Update job information
   * Only updates fields that are provided in the updates object
   * 
   * @param {number} id - The job ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated job object
   * 
   * Example usage:
   *   // Update just the phone and time
   *   await Job.updateJob(5, {
   *     customer_phone: '555-9999',
   *     scheduled_time_start: '10:00:00',
   *     scheduled_time_end: '13:00:00'
   *   });
   *   
   *   // Update description and priority
   *   await Job.updateJob(5, {
   *     description: 'Updated requirements',
   *     priority: 'urgent'
   *   });
   */
  static async updateJob(id, updates) {
    try {
      // Define which fields are allowed to be updated
      const allowedFields = [
        'customer_name',
        'customer_phone',
        'customer_address',
        'job_type',
        'description',
        'scheduled_date',
        'scheduled_time_start',
        'scheduled_time_end',
        'estimated_duration_minutes',
        'priority',
        'current_status'
      ];
      
      // Build dynamic UPDATE query
      const updateFields = [];
      const updateValues = [];
      
      // Loop through updates and build SQL
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = ?`);
          updateValues.push(value);
        }
      }
      
      // If no valid fields to update
      if (updateFields.length === 0) {
        throw new Error('No valid fields provided for update');
      }
      
      // Add job ID to values array (for WHERE clause)
      updateValues.push(id);
      
      // Build final SQL query
      const sql = `
        UPDATE jobs
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;
      
      // Execute UPDATE
      const [result] = await db.query(sql, updateValues);
      
      // Check if job exists
      if (result.affectedRows === 0) {
        throw new Error(`Job with ID ${id} not found`);
      }
      
      // Fetch and return updated job
      const updatedJob = await this.getJobById(id);
      return updatedJob;
      
    } catch (error) {
      console.error('Error in Job.updateJob:', error);
      throw error;
    }
  }
  
  // ==========================================
  // FUNCTION: getJobsByDate
  // PURPOSE: Get all jobs scheduled for a specific date
  // RETURNS: Array of jobs for that date
  // ==========================================
  /**
   * Get all jobs scheduled for a specific date
   * Useful for daily schedule view
   * 
   * @param {string} date - Date in 'YYYY-MM-DD' format
   * @param {string} statusFilter - Optional: filter by status ('pending', 'assigned', etc.)
   * @returns {Promise<Array>} Array of jobs for that date
   * 
   * Example usage:
   *   // Get all jobs for Feb 20
   *   const jobs = await Job.getJobsByDate('2024-02-20');
   *   
   *   // Get only pending jobs for Feb 20
   *   const pendingJobs = await Job.getJobsByDate('2024-02-20', 'pending');
   */
  static async getJobsByDate(date, statusFilter = null) {
    try {
      // Base SQL query
      let sql = `
        SELECT 
          j.id,
          j.job_number,
          j.job_type,
          j.customer_name,
          j.customer_phone,
          j.customer_address,
          j.description,
          j.scheduled_date,
          j.scheduled_time_start,
          j.scheduled_time_end,
          j.estimated_duration_minutes,
          j.current_status,
          j.priority,
          j.created_by,
          j.created_at,
          j.updated_at,
          -- Also get assigned vehicle info (if assigned)
          ja.vehicle_id,
          v.vehicle_name,
          v.license_plate,
          -- Also get assigned driver info (if assigned)
          ja.driver_id,
          u.full_name as driver_name
        FROM jobs j
        LEFT JOIN job_assignments ja ON j.id = ja.job_id
        LEFT JOIN vehicles v ON ja.vehicle_id = v.id
        LEFT JOIN users u ON ja.driver_id = u.id
        WHERE j.scheduled_date = ?
      `;
      
      const params = [date];
      
      // Add status filter if provided
      if (statusFilter) {
        sql += ' AND j.current_status = ?';
        params.push(statusFilter);
      }
      
      // Order by start time
      sql += ' ORDER BY j.scheduled_time_start ASC';
      
      // Execute query
      const [rows] = await db.query(sql, params);
      
      return rows;
      
    } catch (error) {
      console.error('Error in Job.getJobsByDate:', error);
      throw error;
    }
  }
  
  // ==========================================
  // FUNCTION: getJobsByVehicle
  // PURPOSE: Get all jobs assigned to a specific vehicle
  // RETURNS: Array of jobs for that vehicle
  // ==========================================
  /**
   * Get all jobs assigned to a specific vehicle
   * Useful for vehicle schedule view and checking conflicts
   * 
   * @param {number} vehicleId - The vehicle ID
   * @param {string} date - Optional: filter by specific date 'YYYY-MM-DD'
   * @param {Array<string>} excludeStatuses - Optional: exclude certain statuses
   * @returns {Promise<Array>} Array of jobs assigned to this vehicle
   * 
   * Example usage:
   *   // Get all jobs for vehicle 1
   *   const allJobs = await Job.getJobsByVehicle(1);
   *   
   *   // Get jobs for vehicle 1 on Feb 20
   *   const jobsOnDate = await Job.getJobsByVehicle(1, '2024-02-20');
   *   
   *   // Get active jobs (exclude completed/cancelled)
   *   const activeJobs = await Job.getJobsByVehicle(1, null, ['completed', 'cancelled']);
   */
  static async getJobsByVehicle(vehicleId, date = null, excludeStatuses = []) {
    try {
      // Base SQL query
      let sql = `
        SELECT 
          j.id,
          j.job_number,
          j.job_type,
          j.customer_name,
          j.customer_phone,
          j.customer_address,
          j.description,
          j.scheduled_date,
          j.scheduled_time_start,
          j.scheduled_time_end,
          j.estimated_duration_minutes,
          j.current_status,
          j.priority,
          j.created_at,
          j.updated_at,
          -- Vehicle info
          v.vehicle_name,
          v.license_plate,
          -- Driver info
          u.full_name as driver_name,
          ja.assigned_at
        FROM jobs j
        INNER JOIN job_assignments ja ON j.id = ja.job_id
        INNER JOIN vehicles v ON ja.vehicle_id = v.id
        LEFT JOIN users u ON ja.driver_id = u.id
        WHERE ja.vehicle_id = ?
      `;
      
      const params = [vehicleId];
      
      // Add date filter if provided
      if (date) {
        sql += ' AND j.scheduled_date = ?';
        params.push(date);
      }
      
      // Exclude certain statuses if provided
      if (excludeStatuses.length > 0) {
        // Build placeholders: ?, ?, ?
        const placeholders = excludeStatuses.map(() => '?').join(', ');
        sql += ` AND j.current_status NOT IN (${placeholders})`;
        params.push(...excludeStatuses);
      }
      
      // Order by date and start time
      sql += ' ORDER BY j.scheduled_date ASC, j.scheduled_time_start ASC';
      
      // Execute query
      const [rows] = await db.query(sql, params);
      
      return rows;
      
    } catch (error) {
      console.error('Error in Job.getJobsByVehicle:', error);
      throw error;
    }
  }
  
  // ==========================================
  // FUNCTION: getJobById
  // PURPOSE: Get a single job by ID with full details
  // RETURNS: Job object with assignment info or null
  // ==========================================
  /**
   * Get a specific job by ID with all related information
   * 
   * @param {number} id - The job ID
   * @returns {Promise<Object|null>} Job object or null if not found
   * 
   * Example usage:
   *   const job = await Job.getJobById(5);
   *   if (job) {
   *     console.log(`Customer: ${job.customer_name}`);
   *     console.log(`Vehicle: ${job.vehicle_name || 'Not assigned'}`);
   *   }
   */
  static async getJobById(id) {
    try {
      const sql = `
        SELECT 
          j.id,
          j.job_number,
          j.job_type,
          j.customer_name,
          j.customer_phone,
          j.customer_address,
          j.description,
          j.scheduled_date,
          j.scheduled_time_start,
          j.scheduled_time_end,
          j.estimated_duration_minutes,
          j.current_status,
          j.priority,
          j.created_by,
          j.created_at,
          j.updated_at,
          -- Assignment info (if exists)
          ja.id as assignment_id,
          ja.vehicle_id,
          v.vehicle_name,
          v.license_plate,
          ja.driver_id,
          u.full_name as driver_name,
          ja.assigned_at,
          ja.notes as assignment_notes,
          -- Creator info
          creator.full_name as created_by_name
        FROM jobs j
        LEFT JOIN job_assignments ja ON j.id = ja.job_id
        LEFT JOIN vehicles v ON ja.vehicle_id = v.id
        LEFT JOIN users u ON ja.driver_id = u.id
        LEFT JOIN users creator ON j.created_by = creator.id
        WHERE j.id = ?
      `;
      
      const [rows] = await db.query(sql, [id]);
      
      return rows[0] || null;
      
    } catch (error) {
      console.error('Error in Job.getJobById:', error);
      throw error;
    }
  }
  
  // ==========================================
  // FUNCTION: getAllJobs
  // PURPOSE: Get all jobs with optional filters
  // RETURNS: Array of all jobs
  // ==========================================
  /**
   * Get all jobs with optional filtering
   * 
   * @param {Object} filters - Optional filters
   * @param {string} filters.status - Filter by status
   * @param {string} filters.job_type - Filter by job type
   * @param {string} filters.priority - Filter by priority
   * @param {number} filters.limit - Limit number of results
   * @returns {Promise<Array>} Array of jobs
   * 
   * Example usage:
   *   // Get all jobs
   *   const allJobs = await Job.getAllJobs();
   *   
   *   // Get only pending jobs
   *   const pending = await Job.getAllJobs({ status: 'pending' });
   *   
   *   // Get urgent installation jobs
   *   const urgent = await Job.getAllJobs({ 
   *     job_type: 'installation', 
   *     priority: 'urgent' 
   *   });
   */
  static async getAllJobs(filters = {}) {
    try {
      let sql = `
        SELECT 
          j.id,
          j.job_number,
          j.job_type,
          j.customer_name,
          j.customer_phone,
          j.customer_address,
          j.description,
          j.scheduled_date,
          j.scheduled_time_start,
          j.scheduled_time_end,
          j.estimated_duration_minutes,
          j.current_status,
          j.priority,
          j.created_at,
          -- Vehicle info if assigned
          v.vehicle_name,
          v.license_plate,
          -- Driver info if assigned
          u.full_name as driver_name
        FROM jobs j
        LEFT JOIN job_assignments ja ON j.id = ja.job_id
        LEFT JOIN vehicles v ON ja.vehicle_id = v.id
        LEFT JOIN users u ON ja.driver_id = u.id
        WHERE 1=1
      `;
      
      const params = [];
      
      // Apply filters
      if (filters.status) {
        sql += ' AND j.current_status = ?';
        params.push(filters.status);
      }
      
      if (filters.job_type) {
        sql += ' AND j.job_type = ?';
        params.push(filters.job_type);
      }
      
      if (filters.priority) {
        sql += ' AND j.priority = ?';
        params.push(filters.priority);
      }
      
      // Order by date and time
      sql += ' ORDER BY j.scheduled_date DESC, j.scheduled_time_start DESC';
      
      // Apply limit if specified
      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }
      
      const [rows] = await db.query(sql, params);
      return rows;
      
    } catch (error) {
      console.error('Error in Job.getAllJobs:', error);
      throw error;
    }
  }
  
  // ==========================================
  // FUNCTION: updateJobStatus
  // PURPOSE: Update the status of a job
  // RETURNS: Updated job object
  // ==========================================
  /**
   * Update job status
   * Status flow: pending → assigned → in_progress → completed/cancelled
   * 
   * @param {number} id - The job ID
   * @param {string} newStatus - New status value
   * @returns {Promise<Object>} Updated job object
   * 
   * Example usage:
   *   await Job.updateJobStatus(5, 'assigned');
   *   await Job.updateJobStatus(5, 'in_progress');
   *   await Job.updateJobStatus(5, 'completed');
   */
  static async updateJobStatus(id, newStatus) {
    try {
      // Valid statuses (must match database ENUM)
      const validStatuses = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
      
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
      }
      
      const sql = `
        UPDATE jobs
        SET current_status = ?
        WHERE id = ?
      `;
      
      const [result] = await db.query(sql, [newStatus, id]);
      
      if (result.affectedRows === 0) {
        throw new Error(`Job with ID ${id} not found`);
      }
      
      // Return updated job
      const updatedJob = await this.getJobById(id);
      return updatedJob;
      
    } catch (error) {
      console.error('Error in Job.updateJobStatus:', error);
      throw error;
    }
  }
  
  // ==========================================
  // HELPER FUNCTION: generateJobNumber
  // PURPOSE: Generate unique job number
  // RETURNS: String like 'JOB-2024-0001'
  // ==========================================
  /**
   * Generate unique job number in format: JOB-YYYY-NNNN
   * 
   * @returns {Promise<string>} Generated job number
   * 
   * Example output: 'JOB-2024-0001', 'JOB-2024-0002', etc.
   */
  static async generateJobNumber() {
    try {
      // Get current year
      const year = new Date().getFullYear();
      
      // Get the highest job number for this year
      const sql = `
        SELECT job_number 
        FROM jobs 
        WHERE job_number LIKE ?
        ORDER BY job_number DESC 
        LIMIT 1
      `;
      
      const [rows] = await db.query(sql, [`JOB-${year}-%`]);
      
      let nextNumber = 1;
      
      if (rows.length > 0) {
        // Extract number from last job_number (e.g., 'JOB-2024-0042' → 42)
        const lastJobNumber = rows[0].job_number;
        const lastNumber = parseInt(lastJobNumber.split('-')[2]);
        nextNumber = lastNumber + 1;
      }
      
      // Format as 4-digit number with leading zeros
      const formattedNumber = String(nextNumber).padStart(4, '0');
      
      // Return complete job number
      return `JOB-${year}-${formattedNumber}`;
      
    } catch (error) {
      console.error('Error in Job.generateJobNumber:', error);
      throw error;
    }
  }
  
  // ==========================================
  // BONUS FUNCTION: deleteJob
  // PURPOSE: Delete a job (only if not assigned)
  // RETURNS: Success result
  // ==========================================
  /**
   * Delete a job from database
   * Only allows deletion if job is not assigned to a vehicle
   * 
   * @param {number} id - The job ID
   * @returns {Promise<Object>} Result of deletion
   */
  static async deleteJob(id) {
    try {
      // Check if job has assignment
      const checkSql = `
        SELECT COUNT(*) as assignment_count
        FROM job_assignments
        WHERE job_id = ?
      `;
      
      const [checkResult] = await db.query(checkSql, [id]);
      
      if (checkResult[0].assignment_count > 0) {
        throw new Error('Cannot delete job that is assigned to a vehicle. Cancel it instead.');
      }
      
      // Safe to delete
      const deleteSql = 'DELETE FROM jobs WHERE id = ?';
      const [result] = await db.query(deleteSql, [id]);
      
      if (result.affectedRows === 0) {
        throw new Error(`Job with ID ${id} not found`);
      }
      
      return { success: true, message: 'Job deleted successfully' };
      
    } catch (error) {
      console.error('Error in Job.deleteJob:', error);
      throw error;
    }
  }
  
  // ==========================================
  // BONUS FUNCTION: getJobsByDateRange
  // PURPOSE: Get jobs within a date range
  // RETURNS: Array of jobs
  // ==========================================
  /**
   * Get jobs within a date range (useful for weekly/monthly views)
   * 
   * @param {string} startDate - Start date 'YYYY-MM-DD'
   * @param {string} endDate - End date 'YYYY-MM-DD'
   * @returns {Promise<Array>} Array of jobs in date range
   * 
   * Example usage:
   *   // Get all jobs in February 2024
   *   const jobs = await Job.getJobsByDateRange('2024-02-01', '2024-02-29');
   */
  static async getJobsByDateRange(startDate, endDate) {
    try {
      const sql = `
        SELECT 
          j.*,
          v.vehicle_name,
          v.license_plate,
          u.full_name as driver_name
        FROM jobs j
        LEFT JOIN job_assignments ja ON j.id = ja.job_id
        LEFT JOIN vehicles v ON ja.vehicle_id = v.id
        LEFT JOIN users u ON ja.driver_id = u.id
        WHERE j.scheduled_date BETWEEN ? AND ?
        ORDER BY j.scheduled_date ASC, j.scheduled_time_start ASC
      `;
      
      const [rows] = await db.query(sql, [startDate, endDate]);
      return rows;
      
    } catch (error) {
      console.error('Error in Job.getJobsByDateRange:', error);
      throw error;
    }
  }
}

// Export the Job class
module.exports = Job;