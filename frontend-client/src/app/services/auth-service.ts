import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface UserData {
  id: number;
  email: string;
  role: string;
  status: string;
}
export interface LoginResponse {
  requiresMFA: boolean;
  token: string;
  user: UserData;
}

export interface MfaResponse {
  token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) { }

  private jsonHeaders = new HttpHeaders({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  // 3. ⚠️ IMPORTANT : On a supprimé 'role' du body. 
  // C'est beaucoup plus sécurisé, seul l'email et le mot de passe suffisent !
  login(body: { email: string; password: string }) {
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

  registerPersonal(body: Record<string, unknown>) {
    return this.http.post<unknown>(`${this.base}/auth/register/personal`, body, {
      headers: this.jsonHeaders,
    });
  }
}