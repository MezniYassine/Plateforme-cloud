import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    // On injecte l'outil qui permet de savoir si on est sur le serveur ou le navigateur
    const platformId = inject(PLATFORM_ID);
    let token = null;

    // 1. On vérifie PROPREMENT qu'on est sur le navigateur avant d'utiliser localStorage
    if (isPlatformBrowser(platformId)) {
        token = localStorage.getItem('access_token');
    }

    // 2. Si on a trouvé un token (donc on est sur le navigateur ET connecté), on l'injecte
    if (token) {
        const clonedRequest = req.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`
            }
        });
        return next(clonedRequest);
    }

    // 3. Sinon (sur le serveur ou non connecté), on laisse passer la requête normale
    return next(req);
};