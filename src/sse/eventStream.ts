import { Response } from 'express';

export interface LogEvent {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'status';
  stage: 'listener' | 'parser' | 'classifier' | 'enricher' | 'storage' | 'system';
  message: string;
  details?: any;
}

class EventStreamManager {
  private clients: Set<Response> = new Set();
  private history: LogEvent[] = [];
  private maxHistory = 100;

  addClient(res: Response) {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });

    // Send history to newly connected client
    res.write(`data: ${JSON.stringify({ type: 'history', events: this.history })}\n\n`);
  }

  emit(event: Omit<LogEvent, 'id' | 'timestamp'>) {
    const fullEvent: LogEvent = {
      ...event,
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
    };

    this.history.push(fullEvent);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const payload = `data: ${JSON.stringify({ type: 'event', event: fullEvent })}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  getHistory(): LogEvent[] {
    return this.history;
  }
}

export const eventStream = new EventStreamManager();
