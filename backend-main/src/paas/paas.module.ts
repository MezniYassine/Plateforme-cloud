import { Module } from '@nestjs/common';
import { PaasService } from './paas.service';
import { PaasController } from './paas.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicePaaS } from 'src/entities/servicePaaS.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { Client } from 'src/entities/client.entity';
import { WalletModule } from 'src/wallet/wallet.module';
import { EsxiModule } from 'src/esxi/esxi.module';
import { MailModule } from 'src/mail/mail.module';

import { Demande } from 'src/demande/entities/demande.entity';
import { MetricsModule } from 'src/metrics/metrics.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([ServicePaaS, Catalogue, Client, Demande]),
        WalletModule,
        EsxiModule,
        MailModule,
        MetricsModule,
    ],
    providers: [PaasService],
    controllers: [PaasController],
    exports: [PaasService]
})
export class PaasModule { }
