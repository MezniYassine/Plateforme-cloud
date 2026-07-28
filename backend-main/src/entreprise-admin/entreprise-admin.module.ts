import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntrepriseController } from './entreprise-admin.controller';
import { EntrepriseService } from './entreprise-admin.service';
import { Client } from 'src/entities/client.entity';
import { Entreprise } from 'src/entities/entreprise.entity';
import { Demande } from 'src/demande/entities/demande.entity';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { Wallet } from 'src/entities/wallet.entity';
import { Transaction } from 'src/entities/transaction.entity';
import { JwtModule } from '@nestjs/jwt';
import { EsxiModule } from 'src/esxi/esxi.module';



import { ServicePaaS } from 'src/entities/servicePaaS.entity';
import { PaasModule } from 'src/paas/paas.module';

@Module({
  // On importe l'entité pour que TypeORM puisse injecter le "clientRepo" dans ton AdminService
  imports: [
    TypeOrmModule.forFeature([Client, Entreprise, Demande, MachineVirtuelle, Wallet, Transaction, ServicePaaS]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dynamix-dev-secret',
      signOptions: { expiresIn: '24h' },
    }),
    EsxiModule,
    PaasModule,
  ],
  controllers: [EntrepriseController],
  providers: [EntrepriseService],
  exports: [EntrepriseService],
})
export class EntrepriseAdminModule { }

