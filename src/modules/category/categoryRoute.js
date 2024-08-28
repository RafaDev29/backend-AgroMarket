const express = require('express');
const router = express.Router();
const categoryController = require('./categoryController');

router.post('/create', categoryController.createCategory);
router.get('/list', categoryController.listCategories);

module.exports = router;
