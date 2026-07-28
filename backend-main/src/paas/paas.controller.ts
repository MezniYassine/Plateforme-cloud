import { Controller, Post, Get, Delete, Body, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PaasService } from './paas.service';
import { CreatePaasDto } from './dto/create-paas.dto';

@Controller('paas')
export class PaasController {
    constructor(private readonly paasService: PaasService) { }

    @Post('create')
    async createDatabase(@Body() dto: CreatePaasDto) {
        return await this.paasService.createDatabase(dto);
    }

    @UseGuards(JwtAuthGuard)
    @Get('mes-databases')
    async getMyDatabasesJwt(@Request() req: any) {
        const clientId: number = req.user.sub;
        return await this.paasService.getMyDatabases(clientId);
    }

    @Get('client/:clientId')
    async getMyDatabases(@Param('clientId', ParseIntPipe) clientId: number) {
        return await this.paasService.getMyDatabases(clientId);
    }

    @Delete(':id')
    async deleteDatabase(@Param('id', ParseIntPipe) id: number) {
        return await this.paasService.deleteDatabase(id);
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id/metrics')
    async getContainerMetrics(@Param('id', ParseIntPipe) id: number) {
        return await this.paasService.getContainerMetrics(id);
    }
}