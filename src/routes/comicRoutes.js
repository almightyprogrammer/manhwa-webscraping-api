const express = require('express');
const router = express.Router();
const comicController = require('../controllers/comicController');
const panelController = require('../controllers/panelController');

// Comics routes
router.get('/', comicController.getComics);
router.get('/panels', panelController.getPanels);

module.exports = router; 