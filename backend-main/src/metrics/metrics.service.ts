import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Metric, MetricResourceType } from 'src/entities/metric.entity';

@Injectable()
export class MetricsService implements OnModuleInit {
    private readonly logger = new Logger(MetricsService.name);
    // Cache de timestamp pour éviter de spammer la base de données (1 enregistrement toutes les 8s max par ressource)
    private readonly lastRecordedMap = new Map<string, number>();

    constructor(
        @InjectRepository(Metric)
        private readonly metricRepo: Repository<Metric>,
    ) { }

    async onModuleInit() {
        // Exécuter un nettoyage des anciennes métriques au démarrage du serveur
        await this.purgeOldMetrics();
    }

    /**
     * Nettoie automatiquement les métriques de plus de 7 jours (politique de rétention 7 jours)
     * Exécuté chaque heure automatiquement via cron
     */
    @Cron(CronExpression.EVERY_HOUR)
    async purgeOldMetrics(): Promise<number> {
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const result = await this.metricRepo.delete({
                timestamp: LessThan(sevenDaysAgo),
            });
            const deletedCount = result.affected || 0;
            if (deletedCount > 0) {
                this.logger.log(`Nettoyage métriques : ${deletedCount} enregistrements de plus de 7 jours supprimés.`);
            }
            return deletedCount;
        } catch (err: any) {
            this.logger.warn(`Erreur lors du nettoyage des métriques anciennes: ${err?.message}`);
            return 0;
        }
    }

    /**
     * Enregistre un point de métrique (CPU, RAM, Disque) avec limitation de fréquence
     */
    async recordMetric(
        resourceType: MetricResourceType | string,
        resourceId: string | number,
        cpuUsage: number,
        ramUsage: number,
        diskUsageMb?: number,
    ): Promise<Metric | null> {
        const typeStr = String(resourceType).toUpperCase();
        const idStr = String(resourceId);
        const key = `${typeStr}:${idStr}`;
        const now = Date.now();

        const lastRecorded = this.lastRecordedMap.get(key);
        if (lastRecorded && now - lastRecorded < 8000) {
            // Moins de 8 secondes depuis le dernier enregistrement -> ignorer pour éviter les doublons
            return null;
        }

        this.lastRecordedMap.set(key, now);

        try {
            const metric = this.metricRepo.create({
                resourceType: typeStr,
                resourceId: idStr,
                cpuUsage: Math.max(0, Math.min(100, Math.round((Number(cpuUsage) || 0) * 100) / 100)),
                ramUsage: Math.max(0, Math.min(100, Math.round((Number(ramUsage) || 0) * 100) / 100)),
                diskUsageMb: diskUsageMb !== undefined ? Math.round(Number(diskUsageMb) * 100) / 100 : undefined,
            });

            return await this.metricRepo.save(metric);
        } catch (err: any) {
            this.logger.warn(`Échec de l'enregistrement de la métrique pour ${key}: ${err?.message}`);
            return null;
        }
    }

    /**
     * Récupère l'historique chronologique des métriques selon une période temporelle
     * ('1h', '24h', 'yesterday', '7d', 'custom')
     */
    async getHistory(
        resourceType: MetricResourceType | string,
        resourceId: string | number,
        range: '1h' | '24h' | 'yesterday' | '7d' | '30d' | 'custom' | string = '1h',
        startDate?: string,
        endDate?: string,
        limit = 20,
    ): Promise<{ cpu: number; ram: number; disk: number; timestamp: string }[]> {
        const typeStr = String(resourceType).toUpperCase();
        const idStr = String(resourceId);

        let startTime: number;
        let endTime: number;
        let bucketCount: number;

        const now = Date.now();

        if (range === 'yesterday') {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const startOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
            const endOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
            startTime = startOfYesterday.getTime();
            endTime = endOfYesterday.getTime();
            bucketCount = 24; // 24 points (1 par heure)
        } else if (range === '24h') {
            startTime = now - 24 * 60 * 60 * 1000;
            endTime = now;
            bucketCount = 24; // 24 points
        } else if (range === '7d') {
            const today = new Date();
            const startOf7DaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 0, 0, 0, 0);
            const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
            startTime = startOf7DaysAgo.getTime();
            endTime = endOfToday.getTime();
            bucketCount = 7; // 7 barres (1 moyenne par jour)
        } else if (range === 'custom' && startDate && endDate) {
            startTime = new Date(startDate).getTime();
            endTime = new Date(endDate).getTime();
            bucketCount = limit || 24;
        } else {
            // '1h' par défaut
            startTime = now - 60 * 60 * 1000;
            endTime = now;
            bucketCount = 20; // 20 points (toutes les 3 min)
        }

        try {
            // Récupérer les enregistrements compris entre startTime et endTime
            const records = await this.metricRepo.find({
                where: {
                    resourceType: typeStr,
                    resourceId: idStr,
                    timestamp: Between(new Date(startTime), new Date(endTime)),
                },
                order: {
                    timestamp: 'ASC',
                },
            });

            // Découper la période en `bucketCount` intervalles
            const totalDuration = endTime - startTime;
            const bucketSize = totalDuration / bucketCount;

            const buckets: { cpu: number; ram: number; disk: number; timestamp: string }[] = [];

            let lastKnownCpu = 0;
            let lastKnownRam = 0;
            let lastKnownDisk = 0;

            for (let i = 0; i < bucketCount; i++) {
                const bStart = startTime + i * bucketSize;
                const bEnd = bStart + bucketSize;
                const bMid = new Date(bStart + bucketSize / 2);

                const inBucket = records.filter(r => {
                    const t = new Date(r.timestamp).getTime();
                    return t >= bStart && t < bEnd;
                });

                if (inBucket.length > 0) {
                    const avgCpu = inBucket.reduce((sum, r) => sum + r.cpuUsage, 0) / inBucket.length;
                    const avgRam = inBucket.reduce((sum, r) => sum + r.ramUsage, 0) / inBucket.length;
                    const avgDisk = inBucket.reduce((sum, r) => sum + (r.diskUsageMb || 0), 0) / inBucket.length;

                    lastKnownCpu = Math.round(avgCpu * 10) / 10;
                    lastKnownRam = Math.round(avgRam * 10) / 10;
                    lastKnownDisk = Math.round(avgDisk * 10) / 10;

                    buckets.push({
                        cpu: lastKnownCpu,
                        ram: lastKnownRam,
                        disk: lastKnownDisk,
                        timestamp: bMid.toISOString(),
                    });
                } else {
                    if (records.length > 0) {
                        const firstRecord = records[0];
                        const cpuVal = lastKnownCpu || firstRecord.cpuUsage || 0;
                        const ramVal = lastKnownRam || firstRecord.ramUsage || 0;
                        const diskVal = lastKnownDisk || firstRecord.diskUsageMb || 0;
                        buckets.push({
                            cpu: cpuVal,
                            ram: ramVal,
                            disk: diskVal,
                            timestamp: bMid.toISOString(),
                        });
                    } else {
                        buckets.push({
                            cpu: 0,
                            ram: 0,
                            disk: 0,
                            timestamp: bMid.toISOString(),
                        });
                    }
                }
            }

            return buckets;
        } catch (err: any) {
            this.logger.error(`Erreur getHistory pour ${typeStr}:${idStr}: ${err?.message}`);
            return this.generateInitialHistory(bucketCount, startTime, endTime);
        }
    }

    /**
     * Génère une série de base stable sur la période demandée
     */
    private generateInitialHistory(count = 20, startTime?: number, endTime?: number): { cpu: number; ram: number; disk: number; timestamp: string }[] {
        const end = endTime || Date.now();
        const start = startTime || (end - 60 * 60 * 1000);
        const totalDurationMs = end - start;
        const stepMs = count > 1 ? totalDurationMs / (count - 1) : 0;

        return Array.from({ length: count }, (_, i) => {
            const time = new Date(start + i * stepMs);
            return {
                cpu: 0,
                ram: 0,
                disk: 0,
                timestamp: time.toISOString(),
            };
        });
    }
}
