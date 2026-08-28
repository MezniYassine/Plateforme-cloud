import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const platformId = inject(PLATFORM_ID);
    const router = inject(Router);
    let token = null;

    if (isPlatformBrowser(platformId)) {
        token = localStorage.getItem('access_token');
    }

    let authReq = req;
    if (token) {
        authReq = req.clone({
            setHeaders: { Authorization: `Bearer ${token}` }
        });
    }

    // On "pipe" la requête pour écouter la réponse du serveur
    return next(authReq).pipe(
        catchError((error: HttpErrorResponse) => {
            // Si le serveur répond 401 (Non autorisé/Expiré)
            if (error.status === 401) {
                const isAuthEndpoint = req.url.includes('/auth/login') ||
                                       req.url.includes('/auth/verify-mfa') ||
                                       req.url.includes('/auth/forgot-password') ||
                                       req.url.includes('/auth/setup-password') ||
                                       req.url.includes('/auth/resend-mfa-otp');

                // Si ce n'est pas un endpoint d'authentification (ex: token JWT de session expiré sur API protégée)
                if (!isAuthEndpoint) {
                    if (isPlatformBrowser(platformId)) {
                        localStorage.removeItem('access_token'); // On supprime le token mort
                    }
                    router.navigate(['/login']); // On redirige vers la page de connexion
                }
            }
            return throwError(() => error);
        })
    );
};