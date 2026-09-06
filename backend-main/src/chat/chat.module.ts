import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { Client } from '../entities/client.entity';
import { Admin } from '../entities/admin.entity';
import { Catalogue } from '../catalogue/entities/catalogue.entity';
import { ServiceInstance } from '../entities/serviceInstance.entity';
import { Wallet } from '../entities/wallet.entity';
import { Entreprise } from '../entities/entreprise.entity';
import { SystemLog } from '../entities/system-log.entity';
import { EsxiModule } from '../esxi/esxi.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Client, Admin, Catalogue, ServiceInstance, Wallet, Entreprise, SystemLog]),
    forwardRef(() => EsxiModule),
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
