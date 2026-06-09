const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/systemController');
const { protect, authorize } = require('../middlewares/auth');

router.use(protect);
router.use(authorize('admin'));

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

module.exports = router;
