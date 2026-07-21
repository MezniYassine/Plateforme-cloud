import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-topbar',
  imports: [],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar {
  @Input() pageTitle: string = '';

  currentDate: string = new Date().toLocaleDateString();
}
