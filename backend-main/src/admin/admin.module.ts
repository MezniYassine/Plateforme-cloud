import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Client } from 'src/entities/client.entity';
import { Admin } from 'src/entities/admin.entity';



@Module({
  // On importe l'entité pour que TypeORM puisse injecter le "clientRepo" dans ton AdminService
  imports: [TypeOrmModule.forFeature([Client, Admin])],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService], // Utile si d'autres modules ont besoin de l'AdminService plus tard
})
export class AdminModule { }