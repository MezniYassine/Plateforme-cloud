import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Personal } from '../entities/personal.entity';
import { Entreprise } from '../entities/entreprise.entity';
import { Admin } from '../entities/admin.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Personal, Entreprise, Admin]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }