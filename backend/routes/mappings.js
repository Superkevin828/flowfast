const express = require('express');
const { listMappings, createMapping } = require('../controllers/mappingController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, listMappings);
router.post('/', authMiddleware, createMapping);

module.exports = router;
