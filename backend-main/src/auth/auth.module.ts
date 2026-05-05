import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'src/entities/client.entity';
import { Personal } from 'src/entities/personal.entity';
import { Admin } from 'src/entities/admin.entity';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy'; // <-- Add GoogleStrategy
import { MicrosoftStrategy } from './microsoft.strategy';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([Client, Personal, Admin]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dynamix-dev-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    MicrosoftStrategy,
  ],
})
export class AuthModule { }
