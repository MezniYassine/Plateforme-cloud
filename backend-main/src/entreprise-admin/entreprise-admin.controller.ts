import { Controller, Patch, Param, Body, ParseIntPipe, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { EntrepriseService } from './entreprise-admin.service';

@Controller('entreprise-admin')
@UseGuards(JwtAuthGuard)
export class EntrepriseController {
    constructor(private readonly entService: EntrepriseService) { }


    @Get('me')
    async getProfile(@Req() req) {
        const perId = parseInt(req.user.sub, 10);
        return this.entService.getProfile(perId);
    }

}