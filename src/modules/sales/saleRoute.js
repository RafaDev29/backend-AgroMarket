const express = require('express');
const router = express.Router();
const saleController = require('./saleController');
const jwtMiddleware = require('../auth/jwt/jwtMiddleware');
const upload = require('../../utils/multerConfig'); 


router.post('/create', jwtMiddleware, saleController.createSale);
router.patch('/:saleId', jwtMiddleware, upload.single('voucher'), saleController.updateSale);
router.post('/payment/:saleId', jwtMiddleware, upload.single('payment'), saleController.addPaymentImage);
router.get('/list', jwtMiddleware, saleController.listSales);
router.get('/:saleId', jwtMiddleware, saleController.getSaleById);
router.delete('/:saleId', jwtMiddleware, saleController.deleteSale);


module.exports = router;
