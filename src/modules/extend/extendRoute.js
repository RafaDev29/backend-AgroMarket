const express = require('express');
const router = express.Router();
const extendController = require('./extendController');

router.post('/create', extendController.createExtend);
router.get('/list', extendController.listExtend);

module.exports = router;
