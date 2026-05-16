import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EsxiController } from './esxi.controller';
import { EsxiService } from './esxi.service';
import { Personal } from 'src/entities/personal.entity';
import { HttpModule } from '@nestjs/axios';



@Module({
  imports: [TypeOrmModule.forFeature([Personal]), HttpModule],
  controllers: [EsxiController],
  providers: [EsxiService],
  exports: [EsxiService],
})
export class EsxiModule { }