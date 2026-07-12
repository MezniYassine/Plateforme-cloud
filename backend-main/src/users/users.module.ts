import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Personal } from '../entities/personal.entity';
import { Entreprise } from '../entities/entreprise.entity';
import { Admin } from '../entities/admin.entity';
import { ServiceInstance } from '../entities/serviceInstance.entity';
import { MachineVirtuelle } from '../entities/machineVirtuelle.entity';
import { Wallet } from 'src/entities/wallet.entity';
import { Transaction } from 'src/entities/transaction.entity';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Personal, Entreprise, Admin, ServiceInstance, MachineVirtuelle, Wallet, Transaction]),
    WalletModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }