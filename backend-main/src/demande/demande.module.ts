import { Module } from '@nestjs/common';
import { DemandeService } from './demande.service';
import { DemandeController } from './demande.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Demande } from './entities/demande.entity';
import { Client } from 'src/entities/client.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { EsxiService } from 'src/esxi/esxi.service';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    TypeOrmModule.forFeature([Demande, Client, Catalogue, MachineVirtuelle]), HttpModule
  ],
  controllers: [DemandeController],
  providers: [DemandeService, EsxiService],
  exports: [DemandeService],
})
export class DemandeModule { }
