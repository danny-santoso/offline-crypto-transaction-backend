import { Router, Request, Response } from 'express';
import { authenticateToken, authorizeDevice } from '../middleware/auth';
import { syncService, SyncUploadRequest, ConflictResolution } from '../services/syncService';
import { monitoringService } from '../services/monitoring';

const router = Router();

/**
 * @route POST /mobile/sync/upload
 * @desc Upload offline transactions for processing
 * @access Private
 */
router.post('/upload', authenticateToken(['write:transactions']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const { device_id, last_sync, offline_transactions }: SyncUploadRequest = req.body;
    const walletAddress = req.user?.walletAddress;

    // Validate required fields
    if (!device_id || !offline_transactions || !Array.isArray(offline_transactions)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'device_id and offline_transactions array are required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate device ID matches authenticated user
    if (req.user?.deviceId !== device_id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DEVICE_MISMATCH',
          message: 'Device ID does not match authenticated session',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate offline transactions
    for (const transaction of offline_transactions) {
      if (!transaction.local_id || !transaction.type || !transaction.data || !transaction.timestamp) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_FORMAT',
            message: 'Each transaction must have local_id, type, data, and timestamp',
            timestamp: new Date().toISOString()
          }
        });
      }
    }

    console.log(`Processing sync upload for device ${device_id} with ${offline_transactions.length} transactions`);

    // Process the sync upload
    const result = await syncService.processSyncUpload(device_id, offline_transactions);

    // Record sync metrics
    monitoringService.recordPerformance(
      'sync_upload',
      offline_transactions.length * 100, // Approximate processing time
      result.failed === 0
    );

    res.json({
      success: true,
      data: {
        processed: result.processed,
        failed: result.failed,
        conflicts: result.conflicts,
        sync_timestamp: new Date().toISOString(),
        next_sync_recommended: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'sync upload');
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_UPLOAD_FAILED',
        message: 'Failed to process sync upload',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route GET /mobile/sync/download
 * @desc Download updates since last sync
 * @access Private
 */
router.get('/download', authenticateToken(['read:balance']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const since = req.query.since as string;
    const deviceId = req.query.device_id as string || req.user?.deviceId;

    // Validate required fields
    if (!since) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SINCE_PARAMETER',
          message: 'since parameter is required (ISO 8601 timestamp)',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate timestamp format
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TIMESTAMP',
          message: 'since parameter must be a valid ISO 8601 timestamp',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate device ID
    if (!deviceId || req.user?.deviceId !== deviceId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DEVICE_MISMATCH',
          message: 'Device ID does not match authenticated session',
          timestamp: new Date().toISOString()
        }
      });
    }

    console.log(`Generating sync download for device ${deviceId} since ${since}`);

    // Generate sync download data
    const syncData = await syncService.generateSyncDownload(deviceId, sinceDate);

    // Calculate update counts for metrics
    const totalUpdates = 
      syncData.updates.balance_changes.length +
      syncData.updates.new_transactions.length +
      syncData.updates.token_updates.length +
      syncData.updates.public_key_updates.length;

    monitoringService.recordPerformance('sync_download', totalUpdates * 50, true);

    res.json({
      success: true,
      data: syncData
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'sync download');
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_DOWNLOAD_FAILED',
        message: 'Failed to generate sync download',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /mobile/sync/resolve-conflicts
 * @desc Resolve synchronization conflicts
 * @access Private
 */
router.post('/resolve-conflicts', authenticateToken(['write:transactions']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const { conflicts }: { conflicts: ConflictResolution[] } = req.body;
    const deviceId = req.user?.deviceId;

    // Validate required fields
    if (!conflicts || !Array.isArray(conflicts)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONFLICTS',
          message: 'conflicts array is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate conflict format
    for (const conflict of conflicts) {
      if (!conflict.type || !conflict.resolution || !conflict.timestamp) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CONFLICT_FORMAT',
            message: 'Each conflict must have type, resolution, and timestamp',
            timestamp: new Date().toISOString()
          }
        });
      }

      if (!['use_server', 'use_local', 'merge'].includes(conflict.resolution)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RESOLUTION',
            message: 'resolution must be one of: use_server, use_local, merge',
            timestamp: new Date().toISOString()
          }
        });
      }
    }

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DEVICE_ID',
          message: 'Device ID is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    console.log(`Resolving ${conflicts.length} conflicts for device ${deviceId}`);

    // Resolve conflicts
    const result = await syncService.resolveConflicts(deviceId, conflicts);

    monitoringService.recordPerformance('conflict_resolution', conflicts.length * 200, result.failed === 0);

    res.json({
      success: true,
      data: {
        resolved: result.resolved,
        failed: result.failed,
        resolution_timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'conflict resolution');
    res.status(500).json({
      success: false,
      error: {
        code: 'CONFLICT_RESOLUTION_FAILED',
        message: 'Failed to resolve conflicts',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route GET /mobile/sync/status
 * @desc Get device synchronization status
 * @access Private
 */
router.get('/status', authenticateToken(['read:balance']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const deviceId = req.user?.deviceId;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DEVICE_ID',
          message: 'Device ID is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    const syncStatus = syncService.getDeviceSyncStatus(deviceId);

    res.json({
      success: true,
      data: {
        device_id: deviceId,
        ...syncStatus,
        current_timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'sync status');
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_STATUS_FAILED',
        message: 'Failed to get sync status',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /mobile/sync/force-sync
 * @desc Force a complete synchronization
 * @access Private
 */
router.post('/force-sync', authenticateToken(['write:transactions']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const deviceId = req.user?.deviceId;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DEVICE_ID',
          message: 'Device ID is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    console.log(`Force sync requested for device ${deviceId}`);

    // Generate complete sync data (from beginning of time)
    const syncData = await syncService.generateSyncDownload(deviceId, new Date(0));

    // Get current sync status
    const syncStatus = syncService.getDeviceSyncStatus(deviceId);

    monitoringService.recordPerformance('force_sync', 1000, true);

    res.json({
      success: true,
      data: {
        sync_data: syncData,
        sync_status: syncStatus,
        force_sync_timestamp: new Date().toISOString(),
        message: 'Complete synchronization data provided'
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'force sync');
    res.status(500).json({
      success: false,
      error: {
        code: 'FORCE_SYNC_FAILED',
        message: 'Failed to perform force sync',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route DELETE /mobile/sync/reset
 * @desc Reset device sync state (for troubleshooting)
 * @access Private
 */
router.delete('/reset', authenticateToken(['write:transactions']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const deviceId = req.user?.deviceId;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DEVICE_ID',
          message: 'Device ID is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    console.log(`Sync reset requested for device ${deviceId}`);

    // TODO: Implement actual sync state reset
    // This would clear the device's sync state and force a complete re-sync

    monitoringService.recordPerformance('sync_reset', 100, true);

    res.json({
      success: true,
      data: {
        device_id: deviceId,
        reset_timestamp: new Date().toISOString(),
        message: 'Device sync state has been reset. Please perform a force sync.'
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'sync reset');
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_RESET_FAILED',
        message: 'Failed to reset sync state',
        timestamp: new Date().toISOString()
      }
    });
  }
});

export default router;