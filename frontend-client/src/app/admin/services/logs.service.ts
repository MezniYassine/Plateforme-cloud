import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SystemLog {
  id: number;
  level: 'CRITICAL' | 'ERROR' | 'WARN' | 'INFO';
  source: 'ESXI' | 'DOCKER' | 'DBAAS' | 'PROVISIONING' | 'STORAGE' | 'SERVICE' | 'SYSTEM' | 'AUTH';
  serviceType?: string;
  resourceId?: string;
  resourceName?: string;
  clientEmail?: string;
  message: string;
  details?: string;
  resolved: boolean;
  resolvedAt?: string;
  createdAt: string;
}

export interface LogsResponse {
  logs: SystemLog[];
  total: number;
  stats: {
    unresolvedCount: number;
    criticalCount: number;
    errorCount: number;
    warnCount: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AdminLogsService {
  private http = inject(HttpClient);
  private get baseUrl(): string {
    return environment.apiBaseUrl.replace(/\/$/, '');
  }

  getLogs(filters?: { source?: string; level?: string; resolved?: boolean; limit?: number; page?: number }): Observable<LogsResponse> {
    let params: any = {};
    if (filters?.source && filters.source !== 'ALL') params.source = filters.source;
    if (filters?.level && filters.level !== 'ALL') params.level = filters.level;
    if (filters?.resolved !== undefined) params.resolved = String(filters.resolved);
    if (filters?.limit) params.limit = String(filters.limit);
    if (filters?.page) params.page = String(filters.page);

    return this.http.get<LogsResponse>(`${this.baseUrl}/admin/logs`, { params });
  }

  resolveLog(id: number): Observable<SystemLog> {
    return this.http.patch<SystemLog>(`${this.baseUrl}/admin/logs/${id}/resolve`, {});
  }

  clearResolved(): Observable<{ message: string; deletedCount: number }> {
    return this.http.delete<{ message: string; deletedCount: number }>(`${this.baseUrl}/admin/logs/clear-resolved`);
  }
}
