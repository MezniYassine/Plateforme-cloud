import { Controller, Patch, Param, Body, ParseIntPipe, Get, UseGuards, Req, HttpException, HttpStatus, Post } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { EsxiService } from './esxi.service';

@Controller('esxi')
export class EsxiController {
    constructor(private readonly esxiService: EsxiService) { }

    @Get('test-connection')
    async testConnection() {
        try {
            const sessionId = await this.esxiService.getSession();
            return {
                status: 'Success',
                message: 'Connecté à l\'ESXi avec succès !',
                token: sessionId,
            };
        } catch (error) {
            return {
                status: 'Error',
                message: 'Impossible de se connecter à l\'ESXi',
                details: error.message,
            };
        }
    }
    @Get('vms')
    async getAllVms() {
        try {
            const vms = await this.esxiService.getVms();
            return {
                status: 'Success',
                count: vms.length,
                data: vms,
            };
        } catch (error) {
            throw new HttpException({
                status: 'Error',
                message: 'Impossible de récupérer la liste des VMs',
                details: error.message,
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    // Dans esxi.controller.ts
    @Post('power/:id')
    async togglePower(@Param('id') id: string, @Body('action') action: 'start' | 'stop') {
    try {
        await this.esxiService.powerControl(id, action);
        return { status: 'Success', message: `VM ${action}ed successfully` };
    } catch (error) {
        return { status: 'Error', message: error.message };
    }
    }

    @Get('host-stats')
    async getHostStats() {
        try {
            const stats = await this.esxiService.getHostStats();
            return { status: 'Success', data: stats };
        } catch (error) {
            return { status: 'Error', message: error.message };
        }
    }

}