import { Component, signal } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { Activity } from '../../dashboard-helper.service';

interface IAMUser {
  id: string; name: string; email: string; role: string;
  tenant: string; mfa: boolean; lastLogin: string; active: boolean;
}

@Component({
  selector: 'app-iam-page',
  standalone: true,
  imports: [],
  templateUrl: './iam-page.html',
})
export class IamPageComponent {
  iamStats = signal([
    { label: 'Utilisateurs total', val: '53', sub: 'Tous rôles confondus', bg: 'var(--blue-light)', color: 'var(--blue)' },
    { label: 'MFA activé', val: '38', sub: '71% du total', bg: 'var(--green-light)', color: 'var(--green)' },
    { label: 'Tentatives échouées', val: '7', sub: 'Dernières 24h', bg: 'var(--amber-light)', color: 'var(--amber)' },
    { label: 'Comptes bloqués', val: '2', sub: 'Action requise', bg: 'var(--red-light)', color: 'var(--red)' },
  ]);

  iamUsers = signal<IAMUser[]>([
    { id: 'u1', name: 'Super Admin', email: 'admin@dynamix.tn', role: 'SUPER_ADMIN', tenant: 'Dynamix', mfa: true, lastLogin: "Aujourd'hui", active: true },
    { id: 'u2', name: 'Jane Doe', email: 'admin@cloudnet.tn', role: 'ADMIN_CLIENT', tenant: 'CloudNet SA', mfa: true, lastLogin: "Aujourd'hui", active: true },
    { id: 'u3', name: 'Anis Mrad', email: 'anis@cloudnet.tn', role: 'DEVELOPER', tenant: 'CloudNet SA', mfa: false, lastLogin: 'Il y a 2 jours', active: true },
    { id: 'u4', name: 'Lina Ferjani', email: 'admin@bistech.tn', role: 'ADMIN_CLIENT', tenant: 'BisTech Group', mfa: true, lastLogin: 'Hier', active: true },
    { id: 'u5', name: 'Hana Belkadi', email: 'admin@alphasys.tn', role: 'ADMIN_CLIENT', tenant: 'AlphaSys', mfa: true, lastLogin: 'Il y a 1h', active: true },
    { id: 'u6', name: 'Karim Bouaziz', email: 'admin@omega.tn', role: 'ADMIN_CLIENT', tenant: 'Omega Solutions', mfa: false, lastLogin: 'Il y a 7j', active: false },
  ]);

  securityEvents = signal<Activity[]>([
    { type: 'lock', msg: '<strong>karim@omega.tn</strong> — 5 tentatives échouées, compte bloqué', time: 'Il y a 3h', color: 'var(--red)', bg: 'var(--red-light)' },
    { type: 'mfa', msg: '<strong>anis@cloudnet.tn</strong> — connexion sans MFA (alerte)', time: 'Il y a 5h', color: 'var(--amber)', bg: 'var(--amber-light)' },
    { type: 'ok', msg: '<strong>admin@alphasys.tn</strong> — MFA activé avec succès', time: 'Hier, 10h', color: 'var(--green)', bg: 'var(--green-light)' },
    { type: 'ok', msg: '<strong>admin@cloudnet.tn</strong> — connexion depuis nouvel IP', time: 'Il y a 2 jours', color: 'var(--blue)', bg: 'var(--blue-light)' },
  ]);

  securityPolicies = signal([
    { label: 'MFA obligatoire (Admin Client)', desc: 'Exige le TOTP pour tous les admins enterprise', enabled: true },
    { label: 'Blocage après 5 tentatives', desc: 'Verrou 15 min après échecs répétés', enabled: true },
    { label: 'Session JWT — expiration 24h', desc: 'Les tokens expirent après 24 heures', enabled: true },
    { label: 'Alertes de connexion suspecte', desc: 'Notification email si nouvel IP détecté', enabled: false },
  ]);

  constructor(public h: DashboardHelperService) {}
}
