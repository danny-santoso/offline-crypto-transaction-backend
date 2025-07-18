import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import tokenRoutes from './routes/tokenRoutes';
import keyRoutes from './routes/keyRoutes';
import deploymentRoutes from './routes/deploymentRoutes';
import authRoutes from './routes/authRoutes';
import mobileRoutes from './routes/mobileRoutes';
import syncRoutes from './routes/syncRoutes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API routes
app.get('/api', (req, res) => {
  res.json({
    message: 'Offline Crypto Transactions API',
    version: '1.0.0',
    endpoints: {
      balance: 'GET /api/balance/:address',
      purchaseTokens: 'POST /api/purchase-tokens',
      redeemTokens: 'POST /api/redeem-tokens',
      publicKeys: 'GET /api/public-keys',
      validateSignature: 'POST /api/validate-signature',
      deploymentStatus: 'GET /api/deployment/status',
      deploymentInfo: 'GET /api/deployment/info/:network',
      deploymentConfig: 'GET /api/deployment/config/:network',
      deploymentReport: 'GET /api/deployment/report',
      deploymentEvents: 'GET /api/deployment/events',
      validateDeployment: 'POST /api/deployment/validate/:network'
    }
  });
});

// Mount API routes
app.use('/api', tokenRoutes);
app.use('/api', keyRoutes);
app.use('/api/deployment', deploymentRoutes);
app.use('/auth', authRoutes);
app.use('/mobile', mobileRoutes);
app.use('/mobile/sync', syncRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
  });
});

// Start server only if this file is run directly (not imported for testing)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  });
}

export default app;