import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(configService: ConfigService) {
        super({
            // On extrait le token depuis le header Authorization: Bearer <token>
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            // On utilise le même secret que celui du JwtModule (défini dans votre .env)
            secretOrKey: configService.get<string>('JWT_SECRET') || 'dynamix-dev-secret',
        });
    }

    // Cette méthode est appelée automatiquement si le token est valide.
    // Ce que l'on retourne ici se retrouve dans "req.user" du contrôleur.
    async validate(payload: any) {
        return {
            sub: payload.sub,
            email: payload.email,
            role: payload.role,
            status: payload.status
        };
    }
}
