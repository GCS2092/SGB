require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { authenticate } = require('./middlewares/auth.middleware');
const reportRoutes = require('./modules/reports/report.routes');
const prisma = require('./config/database');

const apiLimiter = require('./middlewares/rateLimit.middleware').apiLimiter;
const requestLogger = require('./middlewares/logger.middleware');
const errorHandler = require('./middlewares/error.middleware');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const productsRoutes = require('./modules/products/products.routes');
const categoriesRoutes = require('./modules/categories/categories.routes');
const cartRoutes = require('./modules/cart/cart.routes');
const ordersRoutes = require('./modules/orders/orders.routes');
const addressesRoutes = require('./modules/addresses/addresses.routes');
const uploadRoutes = require('./modules/upload/upload.routes');
const wishlistRoutes = require('./modules/wishlist/wishlist.routes');
const reviewsRoutes = require('./modules/reviews/reviews.routes');
const couponsRoutes = require('./modules/coupons/coupons.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const ordersAdminRoutes = require('./modules/orders/orders.admin.routes');
const accountingRoutes = require('./modules/accounting/accounting.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const invoicesRoutes = require('./modules/invoices/invoices.routes');
const storesRoutes = require('./modules/stores/stores.routes');
const stockTransfersRoutes = require('./modules/stock-transfers/stock-transfers.routes');
const creditNotesRoutes = require('./modules/credit-notes/credit-notes.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const sellersRoutes = require('./modules/sellers/sellers.routes');

const app = express();

app.set('trust proxy', 1);

const allowedOrigins = [
  ...(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173', // port de "vite preview", utilisé par generate-static-html.js pour le pré-rendu SEO
];

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);
app.use(apiLimiter);

if (process.env.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


app.get('/', (req, res) => {
  res.json({
    message: 'Bienvenue sur l API SGB',
    version: '1.0.0',
    docs: '/api/docs',
    health: '/api/health',
  });
});

app.use(['/api/auth/register', '/api/auth/google'], (req, res) => res.status(404).json({ message: 'Inscription publique desactivee.' }));
app.use('/api/auth', authRoutes);
app.use('/api/stock-alerts', authenticate, require('./modules/products/stock-alerts.routes'));
app.use('/api/users', usersRoutes);
app.use('/api/products', authenticate, productsRoutes);
app.use('/api/categories', authenticate, categoriesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', authenticate, ordersRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/coupons', authenticate, couponsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings', authenticate, settingsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin/orders', ordersAdminRoutes);
app.use('/api/admin/accounting', accountingRoutes);
app.use('/api/admin/audit', auditRoutes);
app.use('/api/admin/invoices', invoicesRoutes);
app.use('/api/admin/stores', authenticate, storesRoutes);
app.use('/api/admin/stock-transfers', stockTransfersRoutes);
app.use('/api/admin/credit-notes', creditNotesRoutes);
app.use('/api/admin/reports', reportRoutes);
app.use('/api/sellers', sellersRoutes.router);
app.use('/api/admin/sellers', sellersRoutes.adminRouter);

app.use(errorHandler);

module.exports = app;