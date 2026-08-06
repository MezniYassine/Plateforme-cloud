import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PaasInstance } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-paas-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paas-tab.html',
})
export class PaasTabComponent {
  paasInstances = input<PaasInstance[]>([]);
  openDeploy = output<{ type: 'paas'; name: string }>();
  deletePaas = output<number>();
  openUpgrade = output<PaasInstance>();

  getIconForSgbd(type: string): string {
    if (type === 'POSTGRESQL') return 'db';
    if (type === 'MYSQL') return 'db';
    if (type === 'REDIS') return 'redis';
    if (type === 'MONGODB') return 'mongo';
    return 'db';
  }

  getColorForSgbd(type: string): string {
    if (type === 'POSTGRESQL') return 'var(--blue)';
    if (type === 'MYSQL') return '#e65c00';
    if (type === 'REDIS') return 'var(--red)';
    if (type === 'MONGODB') return '#10B981';
    return 'var(--text-muted)';
  }
}
