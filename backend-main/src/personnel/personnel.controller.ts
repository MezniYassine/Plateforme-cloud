import { Controller, Patch, Param, Body, ParseIntPipe, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PersonnelService } from './personnel.service';

@Controller('personal')
@UseGuards(JwtAuthGuard)
export class PersonnelController {
    constructor(private readonly personnelService: PersonnelService) { }


    @Get('me')
    async getProfile(@Req() req) {
        const perId = parseInt(req.user.sub, 10);
        return this.personnelService.getProfile(perId);
    }

    @Get('billing')
    async getBilling(@Req() req) {
        const perId = parseInt(req.user.sub, 10);
        return this.personnelService.getBilling(perId);
    }
}