import { EventEmitter } from 'events';

export interface MonitoringEvent {
  type: 'deployment' | 'transaction' | 'error' | 'performance';
  timestamp: Date;
  data: any;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export class MonitoringService extends EventEmitter {
  private events: MonitoringEvent[] = [];
  private maxEvents = 1000;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.on('event', (event: MonitoringEvent) => {
      this.storeEvent(event);
      this.logEvent(event);
    });
  }

  private storeEvent(event: MonitoringEvent) {
    this.events.push(event);
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  private logEvent(event: MonitoringEvent) {
    const logLevel = this.getLogLevel(event.severity);
    const message = `[${event.type.toUpperCase()}] ${JSON.stringify(event.data)}`;
    
    console[logLevel](`${event.timestamp.toISOString()} - ${message}`);
  }

  private getLogLevel(severity: string): 'log' | 'warn' | 'error' {
    switch (severity) {
      case 'warning':
        return 'warn';
      case 'error':
      case 'critical':
        return 'error';
      default:
        return 'log';
    }
  }

  public recordDeployment(contractAddress: string, network: string, gasUsed?: number) {
    this.emit('event', {
      type: 'deployment',
      timestamp: new Date(),
      data: {
        contractAddress,
        network,
        gasUsed,
        message: 'Smart contract deployed successfully'
      },
      severity: 'info'
    });
  }

  public recordTransaction(txHash: string, type: string, gasUsed?: number, success: boolean = true) {
    this.emit('event', {
      type: 'transaction',
      timestamp: new Date(),
      data: {
        txHash,
        type,
        gasUsed,
        success,
        message: `Transaction ${success ? 'completed' : 'failed'}`
      },
      severity: success ? 'info' : 'error'
    });
  }

  public recordError(error: Error, context?: string) {
    this.emit('event', {
      type: 'error',
      timestamp: new Date(),
      data: {
        error: error.message,
        stack: error.stack,
        context,
        message: 'Error occurred'
      },
      severity: 'error'
    });
  }

  public recordPerformance(operation: string, duration: number, success: boolean = true) {
    this.emit('event', {
      type: 'performance',
      timestamp: new Date(),
      data: {
        operation,
        duration,
        success,
        message: `Operation ${operation} took ${duration}ms`
      },
      severity: duration > 5000 ? 'warning' : 'info'
    });
  }

  public getEvents(type?: string, limit: number = 100): MonitoringEvent[] {
    let filteredEvents = this.events;
    
    if (type) {
      filteredEvents = this.events.filter(event => event.type === type);
    }
    
    return filteredEvents.slice(-limit).reverse();
  }

  public getEventsSince(since: Date): MonitoringEvent[] {
    return this.events.filter(event => event.timestamp >= since);
  }

  public clearEvents() {
    this.events = [];
  }

  public getStats() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentEvents = this.getEventsSince(oneHourAgo);
    
    const stats = {
      totalEvents: this.events.length,
      recentEvents: recentEvents.length,
      eventsByType: {} as Record<string, number>,
      eventsBySeverity: {} as Record<string, number>,
      errors: recentEvents.filter(e => e.severity === 'error').length,
      warnings: recentEvents.filter(e => e.severity === 'warning').length
    };

    // Count events by type
    this.events.forEach(event => {
      stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
    });

    // Count events by severity
    this.events.forEach(event => {
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
    });

    return stats;
  }
}

// Singleton instance
export const monitoringService = new MonitoringService();