import { Component, signal, computed, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CatalogueService, CatalogueItem } from '../../services/catalogue.service';

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

  catalogueFilter = signal<string>('all');
  catalogueItems = signal<CatalogueItem[]>([]);
  isLoading = signal<boolean>(false);
  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  /* Modal state */
  isModalOpen = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  editingId = signal<number | null>(null);

  /* Form state */
  formName = signal<string>('');
  formDesc = signal<string>('');
  formType = signal<'vm' | 'db' | 'saas'>('vm');
  formPrice = signal<number>(0);
  formCpu = signal<number>(0);
  formRam = signal<number>(0);
  formStorage = signal<number>(0);
  formBg = signal<string>('var(--blue-light)');
  formColor = signal<string>('var(--blue)');

  catalogueTabs = signal([
    { key: 'all', label: 'Tout' },
    { key: 'vm', label: 'IaaS' },
    { key: 'db', label: 'PaaS' },
    { key: 'saas', label: 'SaaS' },
  ]);

  filteredCatalogue = computed(() => {
    const f = this.catalogueFilter();
    return f === 'all' ? this.catalogueItems() : this.catalogueItems().filter(i => i.type === f);
  });

  ngOnInit() {
    this.loadCatalogue();
  }

  loadCatalogue() {
    this.isLoading.set(true);
    this.catalogueService.getAll().subscribe({
      next: (data) => {
        // Transform backend data to frontend format
        const items = (data || []).map(item => ({
          ...item,
          name: item.nomService || item.name,
          price: item.prix || item.price,
          active: item.isActive !== undefined ? item.isActive : item.active,
        }));
        this.catalogueItems.set(items);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur lors du chargement du catalogue', err);
        this.showToast('Erreur lors du chargement', 'var(--red)');
        this.isLoading.set(false);
      }
    });
  }

  openCreateModal() {
    console.log('Opening create modal');
    this.isEditMode.set(false);
    this.editingId.set(null);
    this.formName.set('');
    this.formDesc.set('');
    this.formType.set('vm');
    this.formPrice.set(0);
    this.formCpu.set(0);
    this.formRam.set(0);
    this.formStorage.set(0);
    this.formBg.set('var(--blue-light)');
    this.formColor.set('var(--blue)');
    this.isModalOpen.set(true);
    this.cdr.detectChanges();
    console.log('Modal open:', this.isModalOpen());
  }

  openEditModal(item: CatalogueItem) {
    this.isEditMode.set(true);
    this.editingId.set(item.id ?? null);
    this.formName.set(item.name || item.nomService || '');
    this.formDesc.set(item.description || '');
    this.formType.set(item.type || 'vm');
    this.formPrice.set(item.price || item.prix || 0);
    
    // Use backend fields if available
    this.formCpu.set(item.vcpu || 0);
    this.formRam.set(item.ramMB || 0);
    this.formStorage.set(item.stockageGB || 0);
    
    this.formBg.set(item.bg || 'var(--blue-light)');
    this.formColor.set(item.color || 'var(--blue)');
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.isEditMode.set(false);
    this.editingId.set(null);
    this.cdr.detectChanges();
  }

  saveService() {
    const payload: CatalogueItem = {
      name: this.formName(),
      description: this.formDesc(),
      type: this.formType(),
      price: this.formPrice(),
      vcpu: this.formCpu(),
      ramMB: this.formRam(),
      stockageGB: this.formStorage(),
      bg: this.formBg(),
      color: this.formColor(),
    };

    if (this.isEditMode() && this.editingId()) {
      this.catalogueService.update(this.editingId()!, payload).subscribe({
        next: () => {
          this.showToast('Service modifié avec succès', 'var(--green)');
          this.loadCatalogue();
          this.closeModal();
        },
        error: (err) => {
          console.error('Erreur lors de la modification', err);
          this.showToast('Erreur lors de la modification', 'var(--red)');
        }
      });
    } else {
      this.catalogueService.create(payload).subscribe({
        next: () => {
          this.showToast('Service créé avec succès', 'var(--green)');
          this.loadCatalogue();
          this.closeModal();
        },
        error: (err) => {
          console.error('Erreur lors de la création', err);
          this.showToast('Erreur lors de la création', 'var(--red)');
        }
      });
    }
  }

  deleteService(id: number | undefined) {
    if (!id) return;
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce service ?')) return;

    this.catalogueService.delete(id).subscribe({
      next: () => {
        this.showToast('Service supprimé avec succès', 'var(--green)');
        this.loadCatalogue();
      },
      error: (err) => {
        console.error('Erreur lors de la suppression', err);
        this.showToast('Erreur lors de la suppression', 'var(--red)');
      }
    });
  }

  toggleService(item: CatalogueItem) {
    if (!item.id) return;
    const newActive = !(item.active || item.isActive);
    this.catalogueService.update(item.id, { active: newActive }).subscribe({
      next: () => {
        this.loadCatalogue();
      },
      error: (err) => {
        console.error('Erreur lors de la mise à jour', err);
        this.showToast('Erreur lors de la mise à jour', 'var(--red)');
      }
    });
  }

  setCatalogueFilter(k: string) {
    this.catalogueFilter.set(k);
  }

  /* Input handlers */
  onNameChange(val: string) { this.formName.set(val); }
  onDescChange(val: string) { this.formDesc.set(val); }
  onTypeChange(val: string) { this.formType.set(val as 'vm' | 'db' | 'saas'); }
  onPriceChange(val: string) { this.formPrice.set(+val); }
  onCpuChange(val: string) { this.formCpu.set(+val); }
  onRamChange(val: string) { this.formRam.set(+val); }
  onStorageChange(val: string) { this.formStorage.set(+val); }
  onBgChange(val: string) { this.formBg.set(val); }
  onColorChange(val: string) { this.formColor.set(val); }

  private showToast(msg: string, color: string) {
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.isToastVisible.set(true);
    setTimeout(() => this.isToastVisible.set(false), 3000);
  }
}
