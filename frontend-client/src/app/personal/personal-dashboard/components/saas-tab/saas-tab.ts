import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SaasInstance } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-saas-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './saas-tab.html',
})
export class SaasTabComponent {
  saasInstances = input<SaasInstance[]>([]);
  openDeploy = output<{ type: 'saas'; name: string }>();
  deleteSaas = output<number>();
  openUpgrade = output<SaasInstance>();

  getAppIcon(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('phpmyadmin')) return 'phpmyadmin';
    if (lower.includes('pgadmin')) return 'pgadmin';
    if (lower.includes('wordpress')) return 'wordpress';
    if (lower.includes('n8n')) return 'n8n';
    return 'cloud';
  }

  getAppColor(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('phpmyadmin')) return '#f89b24';
    if (lower.includes('pgadmin')) return '#326690';
    if (lower.includes('wordpress')) return '#21759b';
    if (lower.includes('n8n')) return '#ea4b71';
    return 'var(--blue)';
  }

  getAppBg(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('phpmyadmin')) return '#fff8e1';
    if (lower.includes('pgadmin')) return '#e8f4fd';
    if (lower.includes('wordpress')) return '#e3f2fd';
    if (lower.includes('n8n')) return '#fce4ec';
    return 'var(--blue-l)';
  }
}
