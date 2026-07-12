import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { BillingScheduler } from './billing.scheduler';
import { Wallet } from 'src/entities/wallet.entity';
import { Transaction } from 'src/entities/transaction.entity';
import { Client } from 'src/entities/client.entity';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { EsxiModule } from 'src/esxi/esxi.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction, Client, MachineVirtuelle]),
    ScheduleModule.forRoot(),
    forwardRef(() => EsxiModule),
  ],
  controllers: [WalletController],
  providers: [WalletService, BillingScheduler],
  exports: [WalletService],
})
export class WalletModule {}
