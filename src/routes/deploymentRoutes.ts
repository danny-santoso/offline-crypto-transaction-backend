import { Router, Request, Response } from 'express';
import { deploymentConfigService } from '../services/deploymentConfig';
import { monitoringService } from '../services/monitoring';

const router = Router();

/**
 * @route GET /api/deployment/status
 * @desc Get deployment status for all networks
 * @access Public
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const status = deploymentConfigService.getDeploymentStatus();
    const stats = monitoringService.getStats();
    
    res.json({
      success: true,
      data: {
        networks: status,
        monitoring: stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    monitoringService.recordError(error as Error, 'deployment status endpoint');
    res.status(500).json({
      success: false,
      error: 'Failed to get deployment status',
      message: (error as Error).message
    });
  }
});

/**
 * @route GET /api/deployment/info/:network
 * @desc Get deployment information for a specific network
 * @access Public
 */
router.get('/info/:network', (req: Request, res: Response) => {
  try {
    const { network } = req.params;
    const deploymentInfo = deploymentConfigService.loadDeploymentInfo(network);
    
    if (!deploymentInfo) {
      return res.status(404).json({
        success: false,
        error: 'Deployment not found',
        message: `No deployment found for network: ${network}`
      });
    }

    return res.json({
      success: true,
      data: deploymentInfo
    });
  } catch (error) {
    monitoringService.recordError(error as Error, 'deployment info endpoint');
    return res.status(500).json({
      success: false,
      error: 'Failed to get deployment info',
      message: (error as Error).message
    });
  }
});

/**
 * @route GET /api/deployment/config/:network
 * @desc Get network configuration
 * @access Public
 */
router.get('/config/:network', (req: Request, res: Response) => {
  try {
    const { network } = req.params;
    const config = deploymentConfigService.getNetworkConfig(network);
    
    // Remove sensitive information
    const safeConfig = {
      ...config,
      rpcUrl: config.rpcUrl.includes('localhost') || config.rpcUrl.includes('127.0.0.1') ? config.rpcUrl : '[REDACTED]'
    };
    
    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    monitoringService.recordError(error as Error, 'deployment config endpoint');
    res.status(500).json({
      success: false,
      error: 'Failed to get network config',
      message: (error as Error).message
    });
  }
});

/**
 * @route GET /api/deployment/report
 * @desc Generate deployment report
 * @access Public
 */
router.get('/report', (req: Request, res: Response) => {
  try {
    const report = deploymentConfigService.generateDeploymentReport();
    
    res.setHeader('Content-Type', 'text/markdown');
    res.send(report);
  } catch (error) {
    monitoringService.recordError(error as Error, 'deployment report endpoint');
    res.status(500).json({
      success: false,
      error: 'Failed to generate deployment report',
      message: (error as Error).message
    });
  }
});

/**
 * @route GET /api/deployment/events
 * @desc Get monitoring events
 * @access Public
 */
router.get('/events', (req: Request, res: Response) => {
  try {
    const { type, limit = '100' } = req.query;
    const events = monitoringService.getEvents(
      type as string,
      parseInt(limit as string)
    );
    
    res.json({
      success: true,
      data: {
        events,
        total: events.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    monitoringService.recordError(error as Error, 'deployment events endpoint');
    res.status(500).json({
      success: false,
      error: 'Failed to get monitoring events',
      message: (error as Error).message
    });
  }
});

/**
 * @route POST /api/deployment/validate/:network
 * @desc Validate deployment for a specific network
 * @access Public
 */
router.post('/validate/:network', (req: Request, res: Response) => {
  try {
    const { network } = req.params;
    const isValid = deploymentConfigService.validateDeployment(network);
    
    res.json({
      success: true,
      data: {
        network,
        isValid,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    monitoringService.recordError(error as Error, 'deployment validation endpoint');
    res.status(500).json({
      success: false,
      error: 'Failed to validate deployment',
      message: (error as Error).message
    });
  }
});

export default router;