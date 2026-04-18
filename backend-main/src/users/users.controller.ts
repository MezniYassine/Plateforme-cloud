import { Controller, Post, Body, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { Client } from './entities/client.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  async create(@Body() userData: Partial<Client>) {
    return this.usersService.create(userData);
  }

  @Get()
  async findAll() {
    return this.usersService.findAll();
  }


}