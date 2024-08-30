const express = require('express');
const router = express.Router();
const imagesController = require('./imagesController');

// Ruta para obtener una imagen
router.get('/:imageName', imagesController.sendImage);
router.delete('/products/:productId', imagesController.deleteImagesController);
router.get('/list/:productId', imagesController.listImagesController);
module.exports = router;
