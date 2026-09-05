import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { EntrepriseService } from './entreprise-admin.service';
import type { InviteDto } from './entreprise-admin.service';

@Controller('entreprise-admin')
@UseGuards(JwtAuthGuard)
export class EntrepriseController {
    constructor(private readonly entService: EntrepriseService) { }


    @Get('me')
    async getProfile(@Req() req) {
        const perId = parseInt(req.user.sub, 10);
        return this.entService.getProfile(perId);
    }

    @Post('inviter-collaborateur')
    async inviterCollaborateur(@Body() dto: InviteDto, @Req() req) {
        return this.entService.inviterCollaborateur(dto, req.user);
    }

    @Get('users')
    async getUserByEntreprise(@Req() req) {
        return this.entService.getUserByEntreprise(req.user.sub);
    }

    @Get('org-vms')
    async getOrgVms(@Req() req) {
        return this.entService.getOrgVms(req.user.sub);
    }
    @Get('billing')
    async getBilling(@Req() req) {
        return this.entService.getBilling(req.user.sub);
    }

    @Get('billing/prediction')
    async getBillingPrediction(@Req() req) {
        const clientId = parseInt(req.user.sub, 10);
        return this.entService.getEntreprisePrediction(clientId);
    }
}
