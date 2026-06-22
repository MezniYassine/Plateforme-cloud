import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntrepriseController } from './entreprise-admin.controller';
import { EntrepriseService } from './entreprise-admin.service';
import { Client } from 'src/entities/client.entity';
import { Entreprise } from 'src/entities/entreprise.entity';
import { Demande } from 'src/demande/entities/demande.entity';
import { JwtModule } from '@nestjs/jwt';



@Module({
  // On importe l'entité pour que TypeORM puisse injecter le "clientRepo" dans ton AdminService
  imports: [
    TypeOrmModule.forFeature([Client, Entreprise, Demande]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dynamix-dev-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [EntrepriseController],
  providers: [EntrepriseService],
  exports: [EntrepriseService], // Utile si d'autres modules ont besoin de l'AdminService plus tard
})
export class EntrepriseAdminModule { }
