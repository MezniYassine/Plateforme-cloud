import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Tile {
  glow: boolean;
  hovered: boolean;
  delay: number;
  dur: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit, OnDestroy {
  tiles: Tile[] = [];

  /** px per grid step (tile 76px + gap 3px) */
  private readonly STEP = 79;
  private numCols = 0;
  private hoveredIdx = -1;
  private readonly onMove = this.handleMouseMove.bind(this);
  private readonly isBrowser: boolean;

  // Catalog State
  selectedService: 'iaas' | 'paas' | 'saas' | null = null;

  catalogData: { iaas: any[]; paas: any[]; saas: any[] } = {
    iaas: [],
    paas: [],
    saas: []
  };

  private base = environment.apiBaseUrl.replace(/\/$/, '');

  contactForm: FormGroup;
  contactStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';

  constructor(
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.contactForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      subject: [''],
      message: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      this.loadDynamicCatalog();

      // Browser — use real viewport dimensions
      this.numCols = Math.ceil(window.innerWidth / this.STEP) + 2;
      const rows = Math.ceil(window.innerHeight / this.STEP) + 2;

      this.tiles = Array.from({ length: this.numCols * rows }, () => ({
        glow: Math.random() > 0.91,
        hovered: false,
        delay: +(Math.random() * 9).toFixed(2),
        dur: +(3 + Math.random() * 5).toFixed(2),
      }));

      // Run outside Angular zone for performance
      this.ngZone.runOutsideAngular(() => {
        window.addEventListener('mousemove', this.onMove, { passive: true });
        window.addEventListener('resize', this.handleResize.bind(this));
      });
    } else {
      // SSR (Node.js) — generate a static tile set; no window access
      this.numCols = 22; // ~1440px / 79px — safe default for SSR
      const rows = 14;   // ~1080px / 79px

      this.tiles = Array.from({ length: this.numCols * rows }, () => ({
        glow: false,
        hovered: false,
        delay: 0,
        dur: 4,
      }));
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('mousemove', this.onMove);
    }
  }

  private async loadDynamicCatalog(): Promise<void> {
    try {
      const response = await fetch(`${this.base}/catalogue`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      const iaas: any[] = [];
      const paas: any[] = [];
      const saas: any[] = [];

      for (const cat of (data || [])) {
        const typeSrv = cat.typeService || (cat.type?.toUpperCase()) || 'SAAS';
        const isVm = typeSrv === 'IAAS' || typeSrv === 'VM';
        const isPaas = typeSrv === 'PAAS' || typeSrv === 'DB';

        let icon = '';
        const nameLower = (cat.nomService || '').toLowerCase();

        if (!isVm && !isPaas) {
          // SaaS
          if (nameLower.includes('wordpress')) icon = '/assets/Wordpress logo.png';
          else if (nameLower.includes('n8n')) icon = '/assets/n8n_Logo.png';
          else if (nameLower.includes('phpmyadmin')) icon = '/assets/MySQL Logo.png';
          else if (nameLower.includes('pgadmin')) icon = '/assets/PostgreSQL Logo.png';
          else if (nameLower.includes('mongo')) icon = '/assets/MongoDB Logo.png';
          else if (nameLower.includes('redis')) icon = '/assets/Redis logo.png';
        }

        const priceText = cat.prix ? `À partir de ${cat.prix} DT/mois` : 'Inclus';

        const item = {
          name: cat.nomService || 'Service',
          desc: cat.description || (isVm ? 'Instances de calcul évolutives et performantes.' : isPaas ? 'Base de données managée.' : 'Application d\'entreprise prête à l\'emploi.'),
          price: priceText,
          icon: icon
        };

        if (isVm) iaas.push(item);
        else if (isPaas) paas.push(item);
        else saas.push(item);
      }

      this.catalogData = { iaas, paas, saas };
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to load dynamic catalog via fetch', err);
    }
  }

  private handleResize(): void {
    this.numCols = Math.ceil(window.innerWidth / this.STEP) + 2;
  }

  private handleMouseMove(e: MouseEvent): void {
    const col = Math.floor(e.clientX / this.STEP);
    const row = Math.floor(e.clientY / this.STEP);
    const idx = row * this.numCols + col;

    if (idx === this.hoveredIdx) return; // nothing changed

    // Un-hover previous tile
    if (this.hoveredIdx >= 0 && this.hoveredIdx < this.tiles.length) {
      this.tiles[this.hoveredIdx].hovered = false;
    }

    // Hover new tile
    this.hoveredIdx = idx;
    if (idx >= 0 && idx < this.tiles.length) {
      this.tiles[idx].hovered = true;
    }

    // Notify Angular (OnPush)
    this.cdr.markForCheck();
  }

  selectService(type: 'iaas' | 'paas' | 'saas'): void {
    if (this.selectedService === type) {
      this.selectedService = null;
    } else {
      this.selectedService = type;
      setTimeout(() => {
        const el = document.querySelector('.catalog-display');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }

  closeCatalog(): void {
    this.selectedService = null;
  }

  submitContact(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    this.contactStatus = 'loading';
    this.http.post<{ success: boolean; message: string }>(
      `${this.base}/api/contact`,
      this.contactForm.value
    ).subscribe({
      next: (res) => {
        if (res.success) {
          this.contactStatus = 'success';
          this.contactForm.reset();
          setTimeout(() => {
            this.contactStatus = 'idle';
            this.cdr.detectChanges();
          }, 5000);
        } else {
          this.contactStatus = 'error';
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.contactStatus = 'error';
        this.cdr.detectChanges();
      }
    });
  }

  getSelectedServiceTitle(): string {
    if (this.selectedService === 'iaas') return 'Infrastructure';
    if (this.selectedService === 'paas') return 'Bases de Données';
    if (this.selectedService === 'saas') return 'Applications';
    return '';
  }

  getSelectedCatalog() {
    if (!this.selectedService) return [];
    return this.catalogData[this.selectedService];
  }
}
