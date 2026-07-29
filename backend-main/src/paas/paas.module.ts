import { Module } from '@nestjs/common';
import { PaasService } from './paas.service';
import { PaasController } from './paas.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicePaaS } from 'src/entities/servicePaaS.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { WalletModule } from 'src/wallet/wallet.module';
import { EsxiModule } from 'src/esxi/esxi.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([ServicePaaS, Catalogue]),
        WalletModule,
        EsxiModule
    ],
    providers: [PaasService],
    controllers: [PaasController],
    exports: [PaasService]
})
export class PaasModule { }
