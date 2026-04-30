import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const platformId = inject(PLATFORM_ID);

    // 1. Si la requête est exécutée par le serveur (SSR), on laisse passer
    // car le serveur n'a pas de localStorage.
    if (!isPlatformBrowser(platformId)) {
        return true;
    }

    // 2. Si on est bien dans le navigateur, on fait la vraie vérification !
    const token = localStorage.getItem('access_token');

    if (token) {
        return true; // Le token est là, on le laisse entrer
    }

    // 3. S'il n'y a pas de token dans le navigateur, on le renvoie à l'accueil
    router.navigate(['/']);
    return false;
};