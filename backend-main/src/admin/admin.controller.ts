import { Controller, Patch, Param, Body, ParseIntPipe, Get } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AccountStatus } from 'src/enum/account-status.enum';
// Import AccountStatus

@Controller('admin')
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
}