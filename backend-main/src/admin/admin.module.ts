import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Client } from 'src/entities/client.entity';
import { Admin } from 'src/entities/admin.entity';
import { Demande } from 'src/demande/entities/demande.entity';
import { Entreprise } from 'src/entities/entreprise.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { Wallet } from 'src/entities/wallet.entity';
import { ServiceInstance } from 'src/entities/serviceInstance.entity';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { ServicePaaS } from 'src/entities/servicePaaS.entity';
import { ServiceSaaS } from 'src/entities/serviceSaaS.entity';
import { Transaction } from 'src/entities/transaction.entity';
import { JwtModule } from '@nestjs/jwt';
import { EsxiModule } from 'src/esxi/esxi.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Admin, Demande, Entreprise, Catalogue, Wallet, ServiceInstance, MachineVirtuelle, ServicePaaS, ServiceSaaS, Transaction]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dynamix-dev-secret',
      signOptions: { expiresIn: '24h' },
    }),
    forwardRef(() => EsxiModule),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule { }
