const express = require('express');
const router = express.Router();
const productsController = require('./productsController');
const jwtMiddleware = require('../auth/jwt/jwtMiddleware'); 
const upload = require('../../utils/multerConfig'); 

// Ruta para crear un producto
router.post('/create', jwtMiddleware, upload.array('images'), productsController.createProduct);
router.get('/list', jwtMiddleware, productsController.getProductsByProducer);
router.get('/listAll', productsController.getAllProducts);
router.patch('/:productId', jwtMiddleware, upload.array('images'), productsController.updateProduct);
router.delete('/:productId', jwtMiddleware, productsController.deleteProduct);

module.exports = router;
