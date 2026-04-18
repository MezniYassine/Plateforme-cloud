import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-pending-approval',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './pending-approval.component.html',
  styleUrl: './pending-approval.component.scss'
})
export class PendingApprovalComponent {

  constructor(private router: Router) {
    // 1. On récupère la navigation en cours (doit être fait dans le constructeur)
    const navigation = this.router.getCurrentNavigation();

    // 2. On extrait l'état (state) passé lors de la redirection
    const fromSignup = navigation?.extras.state?.['fromSignup'];

    // 3. Si l'état n'existe pas ou est faux, on redirige vers l'accueil
    if (!fromSignup) {
      void this.router.navigate(['/']);
    }
  }

}