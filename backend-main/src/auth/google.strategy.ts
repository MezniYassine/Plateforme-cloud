import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor() {
        super({
            clientID: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            callbackURL: process.env.GOOGLE_CALLBACK_URL as string,
            scope: ['email', 'profile'], // On demande à Google l'email et le nom
        });
    }

    // Cette méthode est appelée automatiquement quand Google nous renvoie l'utilisateur
    async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
        const { name, emails, id } = profile;

        // On formate les données de Google pour qu'elles soient propres
        const user = {
            providerId: id,
            email: emails[0].value,
            firstName: name.givenName,
            lastName: name.familyName,
        };

        // On passe l'utilisateur à l'étape suivante (le contrôleur)
        done(null, user);
    }
}