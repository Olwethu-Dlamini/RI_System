// src/routes/index.js
const express = require('express');
const router = express.Router();

// Import route modules that actually exist
const jobRoutes = require('./jobs');                    // ✅ NEW (just created above)
const vehicleRoutes = require('./vehicles');            // ✅ NEW (just created above)
const jobAssignmentRoutes = require('./jobAssignmentRoutes'); // ✅ Already exists
const jobStatusRoutes = require('./jobStatusRoutes');   // ✅ Already exists
const dashboardRoutes = require('./dashboard');         // ✅ Already exists
const reportsRoutes = require('./reports');             // ✅ Already exists

// Register routes with correct base paths
router.use('/jobs', jobRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/job-assignments', jobAssignmentRoutes);    // Matches your file name
router.use('/job-status', jobStatusRoutes);             // Matches your file name
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

module.exports = router;