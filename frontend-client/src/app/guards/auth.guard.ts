import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, CanActivateFn } from '@angular/router';
import { jwtDecode } from 'jwt-decode';

export const authGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const platformId = inject(PLATFORM_ID);

    if (!isPlatformBrowser(platformId)) return true;

    const token = localStorage.getItem('access_token');

    if (token) {
        const decoded: any = jwtDecode(token);
        const isExpired = decoded.exp < Date.now() / 1000;
        if (isExpired) {
            localStorage.removeItem('access_token');
            router.navigate(['/']);
            return false;
        }

        return true;
    }

    router.navigate(['/']);
    return false;
};