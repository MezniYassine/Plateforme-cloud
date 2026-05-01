import { Component, input, output } from '@angular/core';
import { ResourceRequest } from '../../entreprise-helper.service';

@Component({
  selector: 'ent-requests-page',
  standalone: true,
  imports: [],
  templateUrl: './requests-page.html',
})
export class RequestsPageComponent {
  filteredRequests = input.required<ResourceRequest[]>();
  reqFilter = input.required<string>();
  pendingRequestsCount = input.required<number>();

  filterChange = output<string>();
  approveRequest = output<string>();
  rejectRequest = output<string>();

  serviceColor(type: 'vm' | 'db' | 'saas'): { color: string; bg: string } {
    const map = {
      vm: { color: 'var(--blue)', bg: 'var(--blue-light)' },
      db: { color: 'var(--teal)', bg: 'var(--teal-light)' },
      saas: { color: 'var(--purple)', bg: 'var(--purple-light)' },
    };
    return map[type] ?? map.vm;
  }
}
