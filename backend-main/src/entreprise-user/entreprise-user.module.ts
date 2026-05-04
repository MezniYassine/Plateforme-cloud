import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntrepriseUserController } from './entreprise-user.controller';
import { EntrepriseUserService } from './entreprise-user.service';
import { Client } from 'src/entities/client.entity';
import { Entreprise } from 'src/entities/entreprise.entity';



@Module({
  imports: [TypeOrmModule.forFeature([Client, Entreprise])],
  controllers: [EntrepriseUserController],
  providers: [EntrepriseUserService],
  exports: [EntrepriseUserService],
})
export class EntrepriseUserModule { }