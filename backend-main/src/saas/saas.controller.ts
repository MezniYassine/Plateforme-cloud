import {
    Controller,
    Post,
    Get,
    Delete,
    Body,
    Param,
    ParseIntPipe,
    UseGuards,
    Request,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { SaasService } from './saas.service';
import { CreateSaasDto } from './dto/create-saas.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'src/entities/client.entity';
import { MailService } from 'src/mail/mail.service';

@Controller('saas')
export class SaasController {
    constructor(
        private readonly saasService: SaasService,
        @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
        private readonly mailService: MailService,
    ) { }

    /**
     * Créer un nouveau service SaaS
     */
    @Post('create')
    async create(@Body() dto: CreateSaasDto) {
        return await this.saasService.create(dto);
    }

    /**
     * Récupérer les applications SaaS du client authentifié (JWT)
     */
    @UseGuards(JwtAuthGuard)
    @Get('mes-applications')
    async getMySaasAppsJwt(@Request() req: any) {
        const clientId: number = req.user.sub;
        return await this.saasService.findAllByClient(clientId);
    }

    /**
     * Récupérer les applications SaaS d'un client par son ID
     */
    @Get('client/:clientId')
    async getMySaasApps(@Param('clientId', ParseIntPipe) clientId: number) {
        return await this.saasService.findAllByClient(clientId);
    }

    /**
     * Récupérer toutes les instances SaaS (admin)
     */
    @Get()
    async findAll() {
        return await this.saasService.findAll();
    }

    /**
     * Récupérer un service SaaS par son ID
     */
    @Get(':id')
    async findOne(@Param('id', ParseIntPipe) id: number) {
        return await this.saasService.findOne(id);
    }

    /**
     * Supprimer un service SaaS
     */
    @Delete(':id')
    async remove(@Param('id', ParseIntPipe) id: number) {
        return await this.saasService.remove(id);
    }

    /**
     * Mise à niveau d'un service SaaS (scale-up)
     */
    @UseGuards(JwtAuthGuard)
    @Post('my-applications/:id/upgrade')
    async upgradeMyApp(
        @Param('id', ParseIntPipe) id: number,
        @Body('catalogueId', ParseIntPipe) catalogueId: number,
        @Request() req: any,
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

        const upgradeInfo = await this.saasService.upgradeContainer(id, catalogueId, clientId, debitClientId);

        // Si ENTREPRISE_USER, envoyer une notification email à l'admin
        if (isEntUser && adminClient && upgradeInfo) {
            this.mailService.sendUpgradeNotificationAdmin({
                adminEmail: adminClient.email,
                adminPrenom: adminClient.prenom,
                userPrenom: upgradeInfo.userPrenom,
                userNom: upgradeInfo.userNom,
                resourceName: upgradeInfo.resourceName,
                resourceType: 'SaaS',
                oldPlan: upgradeInfo.oldPlan,
                newPlan: upgradeInfo.newPlan,
                diffPrice: upgradeInfo.diffPrice,
            }).catch(() => { });
        }

        return {
            status: 'Success',
            message: `Application SaaS mise à niveau avec succès.`,
            id: id,
        };
    }

    /**
     * Récupérer les métriques du conteneur SaaS
     */
    @UseGuards(JwtAuthGuard)
    @Get(':id/metrics')
    async getContainerMetrics(@Param('id', ParseIntPipe) id: number) {
        return await this.saasService.getContainerMetrics(id);
    }
}
