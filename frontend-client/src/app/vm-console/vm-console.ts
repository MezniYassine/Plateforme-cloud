import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';

declare var WMKS: any;

@Component({
  selector: 'app-vm-console',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './vm-console.html',
  styleUrls: ['./vm-console.scss']
})
export class VmConsoleComponent implements OnInit, OnDestroy {
  private wmksInstance: any = null;
  isBrowser: boolean;
  vmId!: string;
  vm: any = null;
  returnUrl: string = '/personal-dashboard'; // Default fallback

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;
    this.vmId = history.state.id || '';
    this.returnUrl = history.state.returnUrl || '/personal-dashboard';
    if (this.vmId) {
      this.chargerDonneesVM();
    }
  }

  chargerDonneesVM() {
    this.http.get<any>(`${environment.apiBaseUrl}/esxi/my-vms/${this.vmId}`)
      .subscribe({
        next: (donnees) => {
          this.vm = Array.isArray(donnees) ? donnees[0] : donnees;
          if (this.vm && this.vm.vmReference && this.vm.status === 'RUNNING') {
            this.initialiserConsole(this.vm.vmReference);
          }
        },
        error: (err) => console.error("Erreur détails VM :", err)
      });
  }

  changerStatut(action: 'start' | 'stop') {
    this.http.post<any>(`${environment.apiBaseUrl}/esxi/my-vms/${this.vmId}/power`, { action })
      .subscribe({
        next: (reponse) => {
          if (reponse.status === 'Success' && this.vm) {
            this.vm.status = reponse.newStatus;

            if (action === 'stop') {
              if (this.wmksInstance) {
                this.wmksInstance.disconnect();
                this.wmksInstance = null;
              }
            } else if (action === 'start') {
              setTimeout(() => {
                this.initialiserConsole(this.vm.vmReference);
              }, 3000);
            }
          }
        },
        error: (err) => console.error("Erreur lors du changement de puissance :", err)
      });
  }

  initialiserConsole(vmReference: string) {
    if (this.wmksInstance) return;

    this.http.get<any>(`${environment.apiBaseUrl}/esxi/machine-virtuelle/${vmReference}/console`)
      .subscribe({
        next: (donnees) => this.connexionWebMKS(donnees),
        error: (err) => console.error("Erreur ticket console :", err)
      });
  }

  connexionWebMKS(config: any) {
    if (!this.isBrowser) return;
    const globalWindow = window as any;
    if (globalWindow['$'] && !globalWindow['$'].now) {
      globalWindow['$'].now = () => Date.now();
    }

    this.wmksInstance = WMKS.createWMKS('wmks-container', {
      useVnc: true,
      sendContinuousUpdates: true,
      rescale: true, // Grâce au nettoyage CSS, cette option va parfaitement dimensionner le canvas
    });

    const wssUrl = `wss://${config.host}:${config.port}/ticket/${config.ticket}`;
    this.wmksInstance.connect(wssUrl);

    // Écoute les changements de taille d'écran pour réaligner la souris instantanément
    window.addEventListener('resize', this.recadrerSourisConsole);

    // Premier rafraîchissement de sécurité après injection dans le DOM
    setTimeout(() => this.recadrerSourisConsole(), 600);
  }

  private recadrerSourisConsole = () => {
    if (this.wmksInstance && typeof this.wmksInstance.updateScreen === 'function') {
      this.wmksInstance.updateScreen(); // Force WebMKS à recalculer l'échelle de la souris
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('resize', this.recadrerSourisConsole);
      if (this.wmksInstance) {
        this.wmksInstance.disconnect();
      }
    }
  }
}