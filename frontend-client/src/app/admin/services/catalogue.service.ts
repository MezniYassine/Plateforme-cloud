import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ServiceType = 'IAAS' | 'PAAS' | 'SAAS';

export interface CatalogueItem {
  id?: number;
  nomService?: string;
  description?: string;
  typeService?: ServiceType;
  typeSgbd?: string | null;
  vcpu?: number;
  ramMB?: number;
  stockageGB?: number;
  prix?: number;
  isActive?: boolean;
  active?: boolean;
  popular?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogueService {
  private readonly base = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) { }

  getAll() {
    return this.http.get<CatalogueItem[]>(`${this.base}/catalogue`);
  }

  getById(id: number) {
    return this.http.get<CatalogueItem>(`${this.base}/catalogue/${id}`);
  }

  create(payload: Partial<CatalogueItem>) {
    return this.http.post<CatalogueItem>(`${this.base}/catalogue`, payload);
  }

  update(id: number, payload: Partial<CatalogueItem>) {
    return this.http.patch<CatalogueItem>(`${this.base}/catalogue/${id}`, payload);
  }

  delete(id: number) {
    return this.http.delete<{ message: string }>(`${this.base}/catalogue/${id}`);
  }
}
