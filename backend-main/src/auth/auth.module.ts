import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport'; // <-- 1. Ajout de Passport
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'src/entities/client.entity';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy'; // <-- 2. Import de ta stratégie (vérifie le chemin !)

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([Client]),
    PassportModule, // <-- 3. Enregistrement de Passport
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dynamix-dev-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy // <-- 4. C'est LUI qui corrige ton erreur !
  ],
})
export class AuthModule { }
