import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface LoginResponse {
  requiresMFA: boolean;
  token: string;
}

export interface MfaResponse {
  token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  private jsonHeaders = new HttpHeaders({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  login(body: { email: string | null; password: string | null; role: string }) {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, body, {
      headers: this.jsonHeaders,
    });
  }

  verifyMFA(code: string) {
    return this.http.post<MfaResponse>(`${this.base}/auth/mfa/verify`, { code }, {
      headers: this.jsonHeaders,
    });
  }

  registerEnterprise(body: Record<string, unknown>) {
    return this.http.post<unknown>(`${this.base}/auth/register/enterprise`, body, {
      headers: this.jsonHeaders,
    });
  }

  registerDeveloper(body: Record<string, unknown>) {
    return this.http.post<unknown>(`${this.base}/auth/register/developer`, body, {
      headers: this.jsonHeaders,
    });
  }
}
