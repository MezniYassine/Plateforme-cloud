import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class EsxiService {
  private http = inject(HttpClient);

  // Récupérer les stats de l'hôte physique
  getHostStats(): Observable<any> {
    return this.http.get<any>(`${environment.apiBaseUrl}/esxi/host-stats`).pipe(
      map(res => res?.data ?? res)
    );
  }

  // Récupérer la liste des VMs ESXi
  getVms(): Observable<any[]> {
    return this.http.get<any>(`${environment.apiBaseUrl}/esxi/vms`).pipe(
      map(res => res?.data ?? res ?? [])
    );
  }

  // Commande de démarrage/arrêt d'une VM
  toggleVmPower(id: string, action: 'start' | 'stop'): Observable<any> {
    return this.http.post<any>(`${environment.apiBaseUrl}/esxi/power/${id}`, { action });
  }
}
