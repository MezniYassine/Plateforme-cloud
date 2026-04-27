import { Controller, Post, Body, Get, Patch, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { Client } from '../entities/client.entity';
import { AccountStatus } from 'src/enum/account-status.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  async create(@Body() userData: Partial<Client>) {
    return this.usersService.create(userData);
  }
}