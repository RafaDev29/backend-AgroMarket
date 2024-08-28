const express = require('express');
const router = express.Router();
const imagesController = require('./imagesController');

// Ruta para obtener una imagen
router.get('/:imageName', imagesController.sendImage);

module.exports = router;
