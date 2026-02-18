// src/routes/jobs.js
const express = require('express');
const router = express.Router();
const Job = require('../models/Job');

/**
 * @swagger
 * tags:
 *   name: Jobs
 *   description: Job management endpoints
 */

/**
 * @swagger
 * /jobs:
 *   get:
 *     summary: Get all jobs
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by job status
 *       - in: query
 *         name: job_type
 *         schema:
 *           type: string
 *         description: Filter by job type
 *     responses:
 *       200:
 *         description: List of jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Job'
 *                 count:
 *                   type: integer
 */
router.get('/', async (req, res) => {
  try {
    const jobs = await Job.getAllJobs();
    res.json({ success: true,  jobs, count: jobs.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get job by ID
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Job'
 *       404:
 *         description: Job not found
 */
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.getJobById(parseInt(req.params.id));
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true,  job });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Create a new job
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Job'
 *     responses:
 *       201:
 *         description: Job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Job'
 */
router.post('/', async (req, res) => {
  try {
    const job = await Job.createJob(req.body);
    res.status(201).json({ success: true,  job, message: 'Job created successfully' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;

// PUT /api/jobs/:id/schedule - Update job schedule
router.put('/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      scheduled_date, 
      scheduled_time_start, 
      scheduled_time_end, 
      estimated_duration_minutes 
    } = req.body;

    // Validate date format
    if (!scheduled_date || !/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid date format. Use YYYY-MM-DD' 
      });
    }

    // Check for double-booking
    const conflict = await checkVehicleConflict(
      null, // Not assigning vehicle, just checking time
      scheduled_date,
      scheduled_time_start,
      scheduled_time_end
    );

    if (conflict) {
      return res.status(409).json({
        success: false,
        message: 'Time slot conflicts with existing job',
        conflict
      });
    }

    const [result] = await db.query(
      `UPDATE jobs 
       SET scheduled_date = ?, 
           scheduled_time_start = ?, 
           scheduled_time_end = ?, 
           estimated_duration_minutes = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [scheduled_date, scheduled_time_start, scheduled_time_end, 
       estimated_duration_minutes, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Job not found' 
      });
    }

    const [updatedJob] = await db.query('SELECT * FROM jobs WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Job schedule updated',
      job: updatedJob[0]
    });
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});