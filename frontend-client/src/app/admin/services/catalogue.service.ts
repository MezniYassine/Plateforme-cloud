import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface CatalogueItem {
  id?: number;
  name?: string;
  nomService?: string;
  description?: string;
  type?: 'vm' | 'db' | 'saas';
  price?: number;
  prix?: number;
  vcpu?: number;
  ramMB?: number;
  stockageGB?: number;
  specs?: string[];
  bg?: string;
  color?: string;
  active?: boolean;
  isActive?: boolean;
  popular?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogueService {
  private readonly base = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  // GET all catalogues
  getAll() {
    return this.http.get<CatalogueItem[]>(`${this.base}/catalogue`);
  }

  // GET one catalogue
  getById(id: number) {
    return this.http.get<CatalogueItem>(`${this.base}/catalogue/${id}`);
  }

  // POST create catalogue
  create(payload: CatalogueItem) {
    const backendPayload = {
      nomService: payload.name,
      description: payload.description,
      vcpu: payload.vcpu || 0,
      ramMB: payload.ramMB || 0,
      stockageGB: payload.stockageGB || 0,
      prix: payload.price || 0,
      isActive: true,
    };
    return this.http.post<CatalogueItem>(`${this.base}/catalogue`, backendPayload);
  }

  // PATCH update catalogue
  update(id: number, payload: CatalogueItem) {
    const backendPayload: any = {};
    if (payload.name !== undefined) backendPayload.nomService = payload.name;
    if (payload.description !== undefined) backendPayload.description = payload.description;
    if (payload.vcpu !== undefined) backendPayload.vcpu = payload.vcpu;
    if (payload.ramMB !== undefined) backendPayload.ramMB = payload.ramMB;
    if (payload.stockageGB !== undefined) backendPayload.stockageGB = payload.stockageGB;
    if (payload.price !== undefined) backendPayload.prix = payload.price;
    if (payload.active !== undefined) backendPayload.isActive = payload.active;
    
    return this.http.patch<CatalogueItem>(`${this.base}/catalogue/${id}`, backendPayload);
  }

  // DELETE catalogue
  delete(id: number) {
    return this.http.delete<{ message: string }>(`${this.base}/catalogue/${id}`);
  }
}
