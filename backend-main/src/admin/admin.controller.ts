import { Controller, Patch, Param, Body, ParseIntPipe, Get, UseGuards, Req } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AccountStatus } from 'src/enum/account-status.enum';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Patch('clients/:id/status')
    async changeClientStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body('status') status: AccountStatus,
    ) {
        return this.adminService.updateStatus(id, status);
    }

    @Get('clients')
    async findAll() {
        return this.adminService.findAll();
    }
    @Get('me')
    async getProfile(@Req() req) {
        const adminId = parseInt(req.user.sub, 10);
        return this.adminService.getProfile(adminId);
    }
}