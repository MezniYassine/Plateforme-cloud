import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';

declare var WMKS: any;

@Component({
  selector: 'app-vm-console',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './vm-console.html',
  styleUrl: './vm-console.scss'
})
export class VmConsoleComponent implements OnInit, OnDestroy {
  private wmksInstance: any = null;
  isBrowser: boolean;
  vmId!: string;
  vm: any = null;
  returnUrl: string = '/personal-dashboard';
  
  isLoading: boolean = true;
  isPowering: boolean = false;
  copiedIp: boolean = false;
  isFullscreen: boolean = false;
  consoleError: string | null = null;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;
    this.vmId = history.state.id || this.route.snapshot.queryParams['id'] || '';
    this.returnUrl = history.state.returnUrl || this.route.snapshot.queryParams['returnUrl'] || '/personal-dashboard';
    
    if (this.vmId) {
      this.chargerDonneesVM();
    } else {
      this.isLoading = false;
      this.consoleError = "Aucun identifiant de machine virtuelle fourni.";
    }

    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen = !!document.fullscreenElement;
    });
  }

  getOsLogo(os?: string): string {
    const o = (os || '').toLowerCase();
    if (o.includes('ubuntu')) return 'assets/ubuntu.png';
    if (o.includes('debian')) return 'assets/Debian.png';
    if (o.includes('alpine')) return 'assets/alpine.png';
    if (o.includes('2000')) return 'assets/windows 2000.png';
    if (o.includes('windows') || o.includes('win')) return 'assets/windows 7.png';
    return 'assets/ubuntu.png';
  }

  copyIp(ip: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!ip || ip === 'N/A' || ip === 'En attente') return;
    navigator.clipboard.writeText(ip);
    this.copiedIp = true;
    setTimeout(() => this.copiedIp = false, 2000);
  }

  toggleFullscreen() {
    const container = document.getElementById('wmks-frame-wrapper') || document.getElementById('wmks-container') || document.documentElement;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        setTimeout(() => this.recadrerSourisConsole(), 300);
      }).catch(err => console.error("Fullscreen error:", err));
    } else {
      document.exitFullscreen().then(() => {
        setTimeout(() => this.recadrerSourisConsole(), 300);
      });
    }
  }

  sendCad() {
    if (this.wmksInstance && typeof this.wmksInstance.sendCAD === 'function') {
      this.wmksInstance.sendCAD();
    }
  }

  chargerDonneesVM() {
    this.isLoading = true;
    this.consoleError = null;
    this.cdr.detectChanges();
    this.http.get<any>(`${environment.apiBaseUrl}/esxi/my-vms/${this.vmId}`)
      .subscribe({
        next: (donnees) => {
          this.isLoading = false;
          this.vm = Array.isArray(donnees) ? donnees[0] : donnees;
          this.cdr.detectChanges();
          if (this.vm && this.vm.vmReference && this.vm.status === 'RUNNING') {
            this.initialiserConsole(this.vm.vmReference);
          }
        },
        error: (err) => {
          this.isLoading = false;
          this.consoleError = "Impossible de récupérer les détails de la machine virtuelle.";
          this.cdr.detectChanges();
          console.error("Erreur détails VM :", err);
        }
      });
  }

  changerStatut(action: 'start' | 'stop' | 'restart' | 'suspend') {
    this.isPowering = true;
    if (this.wmksInstance) {
      this.wmksInstance.disconnect();
      this.wmksInstance = null;
    }
    this.cdr.detectChanges();
    this.http.post<any>(`${environment.apiBaseUrl}/esxi/my-vms/${this.vmId}/power`, { action })
      .subscribe({
        next: (reponse) => {
          this.isPowering = false;
          if (reponse.status === 'Success' && this.vm) {
            this.vm.status = reponse.newStatus;

            if (action === 'stop' || action === 'suspend') {
              if (this.wmksInstance) {
                try { this.wmksInstance.disconnect(); } catch (e) {}
                this.wmksInstance = null;
              }
              const container = document.getElementById('wmks-container');
              if (container) container.innerHTML = '';
            } else if (action === 'start' || action === 'restart') {
              // Réinitialisation propre du canvas WebMKS via rechargement automatique
              setTimeout(() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }, 1200);
            }
          }
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isPowering = false;
          this.cdr.detectChanges();
          console.error("Erreur lors du changement de puissance :", err);
        }
      });
  }

  reconnecterConsole() {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  initialiserConsole(vmReference: string) {
    if (this.wmksInstance) {
      try { this.wmksInstance.disconnect(); } catch (e) {}
      this.wmksInstance = null;
    }

    const container = document.getElementById('wmks-container');
    if (container) container.innerHTML = '';

    this.http.get<any>(`${environment.apiBaseUrl}/esxi/machine-virtuelle/${vmReference}/console`)
      .subscribe({
        next: (donnees) => this.connexionWebMKS(donnees),
        error: (err) => {
          console.error("Erreur ticket console :", err);
        }
      });
  }

  connexionWebMKS(config: any) {
    if (!this.isBrowser) return;
    const globalWindow = window as any;
    if (globalWindow['$'] && !globalWindow['$'].now) {
      globalWindow['$'].now = () => Date.now();
    }

    const container = document.getElementById('wmks-container');
    if (container) {
      container.innerHTML = '';
    }

    try {
      this.wmksInstance = WMKS.createWMKS('wmks-container', {
        useVnc: true,
        sendContinuousUpdates: true,
        rescale: true,
      });

      if (this.wmksInstance && typeof this.wmksInstance.register === 'function') {
        if (WMKS?.CONST?.Events?.CONNECTION_STATE_CHANGE) {
          this.wmksInstance.register(WMKS.CONST.Events.CONNECTION_STATE_CHANGE, (evt: any, data: any) => {
            if (data?.state === 'CONNECTED' || data?.state === WMKS.CONST?.ConnectionState?.CONNECTED) {
              setTimeout(() => this.recadrerSourisConsole(), 150);
            }
            this.cdr.detectChanges();
          });
        }
        if (WMKS?.CONST?.Events?.ERROR) {
          this.wmksInstance.register(WMKS.CONST.Events.ERROR, (evt: any, err: any) => {
            console.warn('[WMKS] Erreur flux:', err);
          });
        }
      }

      const wssUrl = `wss://${config.host}:${config.port}/ticket/${config.ticket}`;
      this.wmksInstance.connect(wssUrl);

      // Écoute les changements de taille d'écran pour réaligner la souris instantanément
      window.addEventListener('resize', this.recadrerSourisConsole);

      // Rafraîchissements échelonnés pour garantir un affichage net dès l'arrivée des frames vidéo
      setTimeout(() => {
        this.recadrerSourisConsole();
        this.cdr.detectChanges();
      }, 400);

      setTimeout(() => {
        this.recadrerSourisConsole();
        this.cdr.detectChanges();
      }, 1200);
    } catch (e) {
      console.error("Erreur WebMKS:", e);
    }
  }

  private recadrerSourisConsole = () => {
    if (this.wmksInstance && typeof this.wmksInstance.updateScreen === 'function') {
      this.wmksInstance.updateScreen();
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('resize', this.recadrerSourisConsole);
      if (this.wmksInstance) {
        try { this.wmksInstance.disconnect(); } catch (e) {}
        this.wmksInstance = null;
      }
    }
  }
}