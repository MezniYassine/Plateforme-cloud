import { Component, signal, computed, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CatalogueService, CatalogueItem, ServiceType } from '../../services/catalogue.service';

@Component({
  selector: 'app-catalogue-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './catalogue-page.html',
})
export class CataloguePageComponent implements OnInit {
  constructor(
    private catalogueService: CatalogueService,
    private cdr: ChangeDetectorRef,
  ) {}

  /* ─── État global ─── */
  catalogueFilter = signal<string>('all');
  catalogueItems  = signal<CatalogueItem[]>([]);
  isLoading       = signal<boolean>(false);
  toastMsg        = signal<string>('');
  toastColor      = signal<string>('var(--green)');
  isToastVisible  = signal<boolean>(false);

  /* ─── Confirm Toast ─── */
  isConfirmToastVisible = signal<boolean>(false);
  confirmToastMsg = signal<string>('');
  private itemToDelete: number | null = null;

  /* ─── Modal ─── */
  isModalOpen = signal<boolean>(false);
  isEditMode  = signal<boolean>(false);
  editingId   = signal<number | null>(null);

  /* ─── Formulaire ─── */
  formName     = signal<string>('');
  formDesc     = signal<string>('');
  formType     = signal<ServiceType>('IAAS');
  formPrice    = signal<number>(0);
  formCpu      = signal<number>(0);
  formRam      = signal<number>(0);
  formStorage  = signal<number>(0);
  formTypeSgbd = signal<'POSTGRESQL' | 'MYSQL' | 'REDIS' | 'MONGODB'>('POSTGRESQL');

  /* ─── Onglets — clés = valeurs exactes du backend ─── */
  catalogueTabs = signal([
    { key: 'all',   label: 'Tout' },
    { key: 'IAAS',  label: 'IaaS' },
    { key: 'PAAS',  label: 'PaaS' },
    { key: 'SAAS',  label: 'SaaS' },
  ]);

  /* ─── Filtre direct sur typeService ─── */
  filteredCatalogue = computed(() => {
    const f = this.catalogueFilter();
    return f === 'all'
      ? this.catalogueItems()
      : this.catalogueItems().filter(i => i.typeService === f);
  });

  ngOnInit() { this.loadCatalogue(); }

  /* ─── Chargement ─── */
  loadCatalogue() {
    this.isLoading.set(true);
    this.catalogueService.getAll().subscribe({
      next: (data) => {
        this.catalogueItems.set(data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.showToast('Erreur lors du chargement', 'var(--red)');
        this.isLoading.set(false);
      },
    });
  }

  /* ─── Modal Create ─── */
  openCreateModal() {
    this.isEditMode.set(false);
    this.editingId.set(null);
    this.formName.set('');
    this.formDesc.set('');
    this.formType.set('IAAS');
    this.formPrice.set(0);
    this.formCpu.set(0);
    this.formRam.set(0);
    this.formStorage.set(0);
    this.formTypeSgbd.set('POSTGRESQL');
    this.isModalOpen.set(true);
    this.cdr.detectChanges();
  }

  /* ─── Modal Edit ─── */
  openEditModal(item: CatalogueItem) {
    this.isEditMode.set(true);
    this.editingId.set(item.id ?? null);
    this.formName.set(item.nomService || '');
    this.formDesc.set(item.description || '');
    this.formType.set(item.typeService || 'IAAS');
    this.formPrice.set(Number(item.prix) || 0);
    this.formCpu.set(item.vcpu || 0);
    this.formRam.set(item.ramMB || 0);
    this.formStorage.set(item.stockageGB || 0);
    this.formTypeSgbd.set((item.typeSgbd as any) || 'POSTGRESQL');
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.isEditMode.set(false);
    this.editingId.set(null);
    this.cdr.detectChanges();
  }

  /* ─── Save ─── */
  saveService() {
    const type   = this.formType();
    const isPaas = type === 'PAAS';
    const isIaas = type === 'IAAS';

    const payload: Partial<CatalogueItem> = {
      nomService:  this.formName(),
      description: this.formDesc(),
      typeService: type,
      prix:        this.formPrice(),
      vcpu:        this.formCpu(),
      ramMB:       this.formRam(),
      stockageGB:  this.formStorage(),
      typeSgbd:    isPaas ? this.formTypeSgbd() : null,
      isActive:    true,
    };

    if (this.isEditMode() && this.editingId()) {
      this.catalogueService.update(this.editingId()!, payload).subscribe({
        next: () => { this.showToast('Service modifié', 'var(--green)'); this.loadCatalogue(); this.closeModal(); },
        error: () => this.showToast('Erreur lors de la modification', 'var(--red)'),
      });
    } else {
      this.catalogueService.create(payload).subscribe({
        next: () => { this.showToast('Service créé', 'var(--green)'); this.loadCatalogue(); this.closeModal(); },
        error: () => this.showToast('Erreur lors de la création', 'var(--red)'),
      });
    }
  }

  /* ─── Delete ─── */
  deleteService(item: CatalogueItem) {
    if (!item.id) return;
    this.itemToDelete = item.id;
    this.confirmToastMsg.set(`Supprimer le service ${item.nomService} ?`);
    this.isConfirmToastVisible.set(true);
  }

  cancelDelete() {
    this.isConfirmToastVisible.set(false);
    this.itemToDelete = null;
  }

  confirmDelete() {
    const id = this.itemToDelete;
    if (!id) return;
    this.isConfirmToastVisible.set(false);
    this.itemToDelete = null;

    this.catalogueService.delete(id).subscribe({
      next: () => { this.showToast('Service supprimé', 'var(--green)'); this.loadCatalogue(); },
      error: () => this.showToast('Erreur lors de la suppression', 'var(--red)'),
    });
  }

  /* ─── Toggle active ─── */
  toggleService(item: CatalogueItem) {
    if (!item.id) return;
    const newActive = !item.isActive;
    this.catalogueService.update(item.id, { isActive: newActive }).subscribe({
      next: () => this.loadCatalogue(),
      error: () => this.showToast('Erreur lors de la mise à jour', 'var(--red)'),
    });
  }

  /* ─── Filtres ─── */
  setCatalogueFilter(k: string) { this.catalogueFilter.set(k); }

  /* ─── Handlers formulaire ─── */
  onNameChange(val: string)    { this.formName.set(val); }
  onDescChange(val: string)    { this.formDesc.set(val); }
  onTypeChange(val: string)    { this.formType.set(val as ServiceType); }
  onPriceChange(val: string)   { this.formPrice.set(+val); }
  onCpuChange(val: string)     { this.formCpu.set(+val); }
  onRamChange(val: string)     { this.formRam.set(+val); }
  onStorageChange(val: string) { this.formStorage.set(+val); }
  onTypeSgbdChange(val: string){ this.formTypeSgbd.set(val as 'POSTGRESQL' | 'MYSQL' | 'REDIS' | 'MONGODB'); }

  private showToast(msg: string, color: string) {
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.isToastVisible.set(true);
    setTimeout(() => this.isToastVisible.set(false), 3000);
  }
}
