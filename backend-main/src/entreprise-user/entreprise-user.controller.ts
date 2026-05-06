import { Controller, Patch, Param, Body, ParseIntPipe, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { EntrepriseUserService } from './entreprise-user.service';

@Controller('entreprise-user')
@UseGuards(JwtAuthGuard)
export class EntrepriseUserController {
    constructor(private readonly entUserService: EntrepriseUserService) { }

    @Get('me')
    async getProfile(@Req() req) {
        const perId = parseInt(req.user.sub, 10);
        return this.entUserService.getProfile(perId);
    }

}