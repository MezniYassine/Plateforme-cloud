import { Controller, Get, Param, Query, Post, Body } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
    constructor(private readonly metricsService: MetricsService) { }

    /**
     * Récupère l'historique chronologique des métriques (IaaS, PaaS, SaaS)
     * supporte: ?range=1h | 24h | yesterday | 7d | custom&startDate=...&endDate=...
     */
    @Get('history/:type/:resourceId')
    async getHistory(
        @Param('type') type: string,
        @Param('resourceId') resourceId: string,
        @Query('range') range?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit') limit?: string,
    ) {
        const take = limit ? Math.min(100, Math.max(5, parseInt(limit, 10))) : 20;
        return await this.metricsService.getHistory(type, resourceId, range || '1h', startDate, endDate, take);
    }

    /**
     * Enregistre manuellement un point de métrique si nécessaire
     */
    @Post('record')
    async recordMetric(
        @Body() body: { type: string; resourceId: string | number; cpu: number; ram: number; disk?: number },
    ) {
        return await this.metricsService.recordMetric(
            body.type,
            body.resourceId,
            body.cpu,
            body.ram,
            body.disk,
        );
    }
}
