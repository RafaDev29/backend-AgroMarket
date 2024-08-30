const express = require('express');
const cors = require('cors');
const customerRoutes = require('./src/modules/customer/customerRoute');
const responseHandler = require('./src/middleware/responseHandler');
const encryptRoutes = require('./src/modules/encrypt/encryptRoute');
const authRoutes = require('./src/modules/auth/authRoute');
const jwtMiddleware = require('./src/modules/auth/jwt/jwtMiddleware');
const producersRoutes = require('./src/modules/producers/producersRoute');
const productsRoutes = require('./src/modules/products/productsRoute');
const categoryRoutes = require('./src/modules/category/categoryRoute');
const imagesRoutes = require('./src/modules/images/imagesRoute'); 
const saleRoutes = require('./src/modules/sales/saleRoute'); 
const extendRoutes = require('./src/modules/extend/extendRoute')
const app = express();

app.use(cors());
app.use(express.json());
app.use(responseHandler);

app.use('/api/customers', customerRoutes);
app.use('/api/encrypt', encryptRoutes);
app.use('/api/producers', producersRoutes);
app.use('/api/products', productsRoutes); 
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/sales', saleRoutes)
app.use('/api/images', imagesRoutes);
app.use('/api/extend', extendRoutes)

const PORT = process.env.PORT || 5080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
