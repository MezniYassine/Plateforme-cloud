import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Developpeur } from './entities/developpeur.entity';
import { Entreprise } from './entities/entreprise.entity';
import { Admin } from './entities/admin.entity';
import { UserC } from './entities/userC.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Developpeur, Entreprise, Admin, UserC]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],   // <-- export UsersService so AuthModule can inject it
})
export class UsersModule { }