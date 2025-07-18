import { EventEmitter } from 'events';
import { monitoringService } from './monitoring';

export interface OfflineTransaction {
  local_id: string;
  type: 'token_validation' | 'balance_check' | 'key_update';
  data: any;
  timestamp: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export interface SyncUploadRequest {
  device_id: string;
  last_sync: string;
  offline_transactions: OfflineTransaction[];
}

export interface BalanceChange {
  type: 'credit' | 'debit';
  amount: string;
  timestamp: string;
  transaction_id: string;
  description?: string;
}

export interface TransactionUpdate {
  id: string;
  type: 'purchase' | 'redeem' | 'transfer';
  amount: string;
  status: 'pending' | 'confirmed' | 'failed';
  created_at: string;
  confirmed_at?: string;
  block_number?: number;
  transaction_hash?: string;
}

export interface TokenUpdate {
  token_id: string;
  status: 'active' | 'used' | 'expired';
  used_at?: string;
  expired_at?: string;
}

export interface PublicKeyUpdate {
  address: string;
  action: 'added' | 'removed' | 'updated';
  public_key?: string;
  status?: 'active' | 'revoked';
  timestamp: string;
}

export interface SyncDownloadResponse {
  sync_timestamp: string;
  updates: {
    balance_changes: BalanceChange[];
    new_transactions: TransactionUpdate[];
    token_updates: TokenUpdate[];
    public_key_updates: PublicKeyUpdate[];
  };
}

export interface ConflictResolution {
  type: 'balance_mismatch' | 'transaction_conflict' | 'token_status_conflict';
  local_value: any;
  server_value: any;
  resolution: 'use_server' | 'use_local' | 'merge';
  timestamp: string;
}

class SyncService extends EventEmitter {
  private deviceSyncStates: Map<string, { lastSync: Date; pendingTransactions: OfflineTransaction[] }> = new Map();
  private conflictQueue: Map<string, ConflictResolution[]> = new Map();

  constructor() {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.on('sync_upload', (deviceId: string, transactions: OfflineTransaction[]) => {
      this.processSyncUpload(deviceId, transactions);
    });

    this.on('conflict_detected', (deviceId: string, conflict: ConflictResolution) => {
      this.handleConflict(deviceId, conflict);
    });
  }

  /**
   * Process offline transactions uploaded from mobile device
   */
  async processSyncUpload(deviceId: string, transactions: OfflineTransaction[]): Promise<{
    processed: number;
    failed: number;
    conflicts: ConflictResolution[];
  }> {
    const startTime = Date.now();
    let processed = 0;
    let failed = 0;
    const conflicts: ConflictResolution[] = [];

    try {
      for (const transaction of transactions) {
        try {
          await this.processOfflineTransaction(deviceId, transaction);
          processed++;
        } catch (error) {
          console.error(`Failed to process transaction ${transaction.local_id}:`, error);
          failed++;
          
          // Check if this is a conflict
          if (error instanceof SyncConflictError) {
            conflicts.push({
              type: error.conflictType,
              local_value: error.localValue,
              server_value: error.serverValue,
              resolution: 'use_server', // Default resolution
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      // Update device sync state
      this.deviceSyncStates.set(deviceId, {
        lastSync: new Date(),
        pendingTransactions: []
      });

      const duration = Date.now() - startTime;
      monitoringService.recordPerformance('sync_upload', duration, failed === 0);

      return { processed, failed, conflicts };

    } catch (error) {
      monitoringService.recordError(error as Error, `sync_upload:${deviceId}`);
      throw error;
    }
  }

  /**
   * Generate sync download data for a device
   */
  async generateSyncDownload(deviceId: string, since: Date): Promise<SyncDownloadResponse> {
    const startTime = Date.now();

    try {
      // TODO: Integrate with blockchain service to get real updates
      const updates: SyncDownloadResponse['updates'] = {
        balance_changes: await this.getBalanceChangesSince(deviceId, since),
        new_transactions: await this.getNewTransactionsSince(deviceId, since),
        token_updates: await this.getTokenUpdatesSince(deviceId, since),
        public_key_updates: await this.getPublicKeyUpdatesSince(deviceId, since)
      };

      const duration = Date.now() - startTime;
      monitoringService.recordPerformance('sync_download', duration, true);

      return {
        sync_timestamp: new Date().toISOString(),
        updates
      };

    } catch (error) {
      monitoringService.recordError(error as Error, `sync_download:${deviceId}`);
      throw error;
    }
  }

  /**
   * Resolve synchronization conflicts
   */
  async resolveConflicts(deviceId: string, resolutions: ConflictResolution[]): Promise<{
    resolved: number;
    failed: number;
  }> {
    let resolved = 0;
    let failed = 0;

    try {
      for (const resolution of resolutions) {
        try {
          await this.applyConflictResolution(deviceId, resolution);
          resolved++;
        } catch (error) {
          console.error(`Failed to resolve conflict:`, error);
          failed++;
        }
      }

      // Clear resolved conflicts from queue
      if (resolved > 0) {
        this.conflictQueue.delete(deviceId);
      }

      return { resolved, failed };

    } catch (error) {
      monitoringService.recordError(error as Error, `conflict_resolution:${deviceId}`);
      throw error;
    }
  }

  /**
   * Get device sync status
   */
  getDeviceSyncStatus(deviceId: string): {
    lastSync: string | null;
    pendingTransactions: number;
    pendingConflicts: number;
    syncHealth: 'healthy' | 'warning' | 'error';
  } {
    const syncState = this.deviceSyncStates.get(deviceId);
    const conflicts = this.conflictQueue.get(deviceId) || [];
    
    const lastSync = syncState?.lastSync?.toISOString() || null;
    const pendingTransactions = syncState?.pendingTransactions?.length || 0;
    const pendingConflicts = conflicts.length;

    // Determine sync health
    let syncHealth: 'healthy' | 'warning' | 'error' = 'healthy';
    if (pendingConflicts > 0) {
      syncHealth = 'error';
    } else if (pendingTransactions > 10) {
      syncHealth = 'warning';
    } else if (lastSync && new Date(lastSync) < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
      syncHealth = 'warning'; // No sync in 24 hours
    }

    return {
      lastSync,
      pendingTransactions,
      pendingConflicts,
      syncHealth
    };
  }

  private async processOfflineTransaction(deviceId: string, transaction: OfflineTransaction): Promise<void> {
    switch (transaction.type) {
      case 'token_validation':
        await this.processTokenValidation(deviceId, transaction);
        break;
      case 'balance_check':
        await this.processBalanceCheck(deviceId, transaction);
        break;
      case 'key_update':
        await this.processKeyUpdate(deviceId, transaction);
        break;
      default:
        throw new Error(`Unknown transaction type: ${transaction.type}`);
    }
  }

  private async processTokenValidation(deviceId: string, transaction: OfflineTransaction): Promise<void> {
    // TODO: Implement actual token validation logic
    console.log(`Processing token validation for device ${deviceId}:`, transaction.data);
    
    // Simulate validation
    const isValid = Math.random() > 0.1; // 90% success rate
    if (!isValid) {
      throw new SyncConflictError(
        'token_status_conflict',
        transaction.data.expected_status,
        'invalid'
      );
    }
  }

  private async processBalanceCheck(deviceId: string, transaction: OfflineTransaction): Promise<void> {
    // TODO: Implement actual balance check logic
    console.log(`Processing balance check for device ${deviceId}:`, transaction.data);
    
    // Simulate balance mismatch
    if (Math.random() < 0.05) { // 5% chance of conflict
      throw new SyncConflictError(
        'balance_mismatch',
        transaction.data.local_balance,
        '1.23' // Server balance
      );
    }
  }

  private async processKeyUpdate(deviceId: string, transaction: OfflineTransaction): Promise<void> {
    // TODO: Implement actual key update logic
    console.log(`Processing key update for device ${deviceId}:`, transaction.data);
  }

  private async getBalanceChangesSince(deviceId: string, since: Date): Promise<BalanceChange[]> {
    // TODO: Get real balance changes from blockchain service
    return [
      {
        type: 'credit',
        amount: '0.5',
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        transaction_id: 'tx_987654321',
        description: 'Token redemption'
      }
    ];
  }

  private async getNewTransactionsSince(deviceId: string, since: Date): Promise<TransactionUpdate[]> {
    // TODO: Get real transactions from blockchain service
    return [
      {
        id: 'tx_987654321',
        type: 'redeem',
        amount: '0.5',
        status: 'confirmed',
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        confirmed_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        block_number: 12345680,
        transaction_hash: '0x' + Math.random().toString(16).substring(2, 66)
      }
    ];
  }

  private async getTokenUpdatesSince(deviceId: string, since: Date): Promise<TokenUpdate[]> {
    // TODO: Get real token updates from blockchain service
    return [
      {
        token_id: 'ot_abc123',
        status: 'used',
        used_at: new Date(Date.now() - 20 * 60 * 1000).toISOString()
      }
    ];
  }

  private async getPublicKeyUpdatesSince(deviceId: string, since: Date): Promise<PublicKeyUpdate[]> {
    // TODO: Get real public key updates from blockchain service
    return [];
  }

  private async applyConflictResolution(deviceId: string, resolution: ConflictResolution): Promise<void> {
    switch (resolution.resolution) {
      case 'use_server':
        // Server value takes precedence
        console.log(`Applying server resolution for ${resolution.type}`);
        break;
      case 'use_local':
        // Local value takes precedence
        console.log(`Applying local resolution for ${resolution.type}`);
        break;
      case 'merge':
        // Merge both values
        console.log(`Merging values for ${resolution.type}`);
        break;
    }
  }

  private handleConflict(deviceId: string, conflict: ConflictResolution): void {
    const existingConflicts = this.conflictQueue.get(deviceId) || [];
    existingConflicts.push(conflict);
    this.conflictQueue.set(deviceId, existingConflicts);
    
    monitoringService.recordError(
      new Error(`Sync conflict detected: ${conflict.type}`),
      `sync_conflict:${deviceId}`
    );
  }
}

class SyncConflictError extends Error {
  constructor(
    public conflictType: ConflictResolution['type'],
    public localValue: any,
    public serverValue: any
  ) {
    super(`Sync conflict: ${conflictType}`);
    this.name = 'SyncConflictError';
  }
}

// Singleton instance
export const syncService = new SyncService();

export { SyncConflictError };