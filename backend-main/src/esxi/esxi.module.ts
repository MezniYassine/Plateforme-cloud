import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EsxiController } from './esxi.controller';
import { EsxiService } from './esxi.service';
import { Personal } from 'src/entities/personal.entity';
import { HttpModule } from '@nestjs/axios';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { Client } from 'src/entities/client.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { Wallet } from 'src/entities/wallet.entity';
import { Transaction } from 'src/entities/transaction.entity';
import { WalletModule } from 'src/wallet/wallet.module';



@Module({
  imports: [TypeOrmModule.forFeature([Personal, MachineVirtuelle, Client, Catalogue, Wallet, Transaction]), HttpModule, forwardRef(() => WalletModule)],
  controllers: [EsxiController],
  providers: [EsxiService],
  exports: [EsxiService],
})
export class EsxiModule { }
