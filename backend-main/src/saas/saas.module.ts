import { Module } from '@nestjs/common';
import { SaasService } from './saas.service';
import { SaasController } from './saas.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceSaaS } from '../entities/serviceSaaS.entity';
import { ServicePaaS } from '../entities/servicePaaS.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { Client } from 'src/entities/client.entity';
import { Demande } from 'src/demande/entities/demande.entity';
import { WalletModule } from 'src/wallet/wallet.module';
import { MailModule } from 'src/mail/mail.module';
import { MetricsModule } from 'src/metrics/metrics.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([ServiceSaaS, ServicePaaS, Catalogue, Client, Demande]),
        WalletModule,
        MailModule,
        MetricsModule,
    ],
    controllers: [SaasController],
    providers: [SaasService],
    exports: [SaasService],
})
export class SaasModule { }
