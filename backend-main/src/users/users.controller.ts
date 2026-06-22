import { Controller, Post, Body, Get, Patch, Req, UseGuards, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { Client } from '../entities/client.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountStatus } from '../enum/account-status.enum';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  async create(@Body() userData: Partial<Client>) {
    return this.usersService.create(userData);
  }

  @Get('me')
  async getMe(@Req() req: any) {
    const userId = req.user.sub;
    return this.usersService.findByIdwithoutPassword(userId);
  }
  @Patch('update-profile')
  async updateProfile(@Req() req: any, @Body() updateData: Partial<Client>) {
    return this.usersService.updateProfile(req.user.sub, updateData);
  }
  @Patch('update-password')
  async updatePassword(@Req() req: any, @Body() updateData: Partial<Client>) {
    return this.usersService.updatePassword(req.user.sub, updateData);
  }
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: AccountStatus) {
    return this.usersService.updateStatus(Number(id), status);
  }
}