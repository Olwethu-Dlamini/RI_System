// src/routes/vehicles.js
const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');

// GET /api/vehicles
router.get('/', async (req, res) => {
  try {
    const vehicles = await Vehicle.getAllVehicles(req.query.activeOnly === 'true');
    res.json({ success: true, data: vehicles, count: vehicles.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/vehicles/:id
router.get('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.getVehicleById(parseInt(req.params.id));
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    res.json({ success: true, data: vehicle });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;