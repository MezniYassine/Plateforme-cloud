import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EsxiController } from './esxi.controller';
import { EsxiService } from './esxi.service';
import { Personal } from 'src/entities/personal.entity';
import { HttpModule } from '@nestjs/axios';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { Client } from 'src/entities/client.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';



@Module({
  imports: [TypeOrmModule.forFeature([Personal, MachineVirtuelle, Client, Catalogue]), HttpModule],
  controllers: [EsxiController],
  providers: [EsxiService],
  exports: [EsxiService],
})
export class EsxiModule { }
