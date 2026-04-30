import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonnelController } from './personnel.controller';
import { PersonnelService } from './personnel.service';
import { Personal } from 'src/entities/personal.entity';



@Module({
  // On importe l'entité pour que TypeORM puisse injecter le "clientRepo" dans ton AdminService
  imports: [TypeOrmModule.forFeature([Personal])],
  controllers: [PersonnelController],
  providers: [PersonnelService],
  exports: [PersonnelService], // Utile si d'autres modules ont besoin de l'AdminService plus tard
})
export class PersonnelModule { }