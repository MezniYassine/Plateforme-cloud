import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
    constructor() {
        super({
            clientID: process.env.MICROSOFT_CLIENT_ID as string,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
            callbackURL: process.env.MICROSOFT_CALLBACK_URL as string,
            scope: ['openid', 'profile', 'email', 'user.read'],
        });
    }

    async validate(accessToken: string, refreshToken: string, profile: any, done: Function) {
        const { id, name, emails } = profile;

        const user = {
            providerId: id,
            provider: 'microsoft',
            email: emails[0].value,
            firstName: name.givenName,
            lastName: name.familyName,
        };

        done(null, user);
    }
}