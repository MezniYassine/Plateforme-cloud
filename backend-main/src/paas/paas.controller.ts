import { Controller, Post, Get, Delete, Body, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PaasService } from './paas.service';
import { CreatePaasDto } from './dto/create-paas.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'src/entities/client.entity';
import { MailService } from 'src/mail/mail.service';

@Controller('paas')
export class PaasController {
    constructor(
        private readonly paasService: PaasService,
        @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
        private readonly mailService: MailService,
    ) { }

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
    @Post('my-databases/:id/upgrade')
    async upgradeMyDatabase(
        @Param('id', ParseIntPipe) id: number,
        @Body('catalogueId', ParseIntPipe) catalogueId: number,
        @Request() req: any
    ) {
        const clientId: number = req.user.sub;
        const isEntUser = req.user.role === 'ENTREPRISE_USER';

        // Si ENTREPRISE_USER, trouver l'admin et passer son ID pour le débit
        let debitClientId = clientId;
        let adminClient: Client | null = null;

        if (isEntUser) {
            const user = await this.clientRepo.findOne({
                where: { id: clientId },
                relations: ['entreprise'],
            });
            if (user?.entreprise) {
                adminClient = await this.clientRepo.findOne({
                    where: { entreprise: { id: user.entreprise.id }, role: 'ENTREPRISE_ADMIN' as any },
                });
                if (adminClient) {
                    debitClientId = adminClient.id;
                }
            }
        }

        const upgradeInfo = await this.paasService.upgradeContainer(id, catalogueId, clientId, debitClientId);

        // Si ENTREPRISE_USER, envoyer une notification email à l'admin
        if (isEntUser && adminClient && upgradeInfo) {
            this.mailService.sendUpgradeNotificationAdmin({
                adminEmail: adminClient.email,
                adminPrenom: adminClient.prenom,
                userPrenom: upgradeInfo.userPrenom,
                userNom: upgradeInfo.userNom,
                resourceName: upgradeInfo.resourceName,
                resourceType: 'PaaS',
                oldPlan: upgradeInfo.oldPlan,
                newPlan: upgradeInfo.newPlan,
                diffPrice: upgradeInfo.diffPrice,
            }).catch(() => {});
        }

        return {
            status: 'Success',
            message: `Base de données mise à niveau avec succès.`,
            id: id,
        };
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id/metrics')
    async getContainerMetrics(@Param('id', ParseIntPipe) id: number) {
        return await this.paasService.getContainerMetrics(id);
    }
}