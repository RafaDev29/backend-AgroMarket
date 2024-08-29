const express = require('express');
const router = express.Router();
const saleController = require('./saleController');
const jwtMiddleware = require('../auth/jwt/jwtMiddleware');


router.post('/create', jwtMiddleware, saleController.createSale);

module.exports = router;
