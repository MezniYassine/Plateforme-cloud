import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NodeSSH } from 'node-ssh';
import { ServiceSaaS } from 'src/entities/serviceSaaS.entity';
import { ServicePaaS } from 'src/entities/servicePaaS.entity';
import { ServiceStatus } from 'src/enum/service-status.enum';
import { SaasAppType } from 'src/enum/saas-app-type.enum';
import { CreateSaasDto } from './dto/create-saas.dto';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { WalletService } from 'src/wallet/wallet.service';
import { Demande, DemandeStatus } from 'src/demande/entities/demande.entity';
import { Client } from 'src/entities/client.entity';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class SaasService {
    private readonly logger = new Logger(SaasService.name);

    private get hostIp(): string {
        return (process.env.PAAS_HOST_IP || '192.168.8.183').replace(/^"(.*)"$/, '$1').trim();
    }
    private get sshUser(): string {
        return (process.env.PAAS_SSH_USER || 'dbaas').replace(/^"(.*)"$/, '$1').trim();
    }
    private get sshPass(): string {
        return (process.env.PAAS_SSH_PASS || '').replace(/^"(.*)"$/, '$1').trim();
    }

    constructor(
        @InjectRepository(ServiceSaaS)
        private readonly saasRepo: Repository<ServiceSaaS>,
        @InjectRepository(ServicePaaS)
        private readonly paasRepo: Repository<ServicePaaS>,
        @InjectRepository(Catalogue)
        private readonly catalogueRepo: Repository<Catalogue>,
        @InjectRepository(Demande)
        private readonly demandeRepo: Repository<Demande>,
        @InjectRepository(Client)
        private readonly clientRepo: Repository<Client>,
        private readonly walletService: WalletService,
        private readonly mailService: MailService,
    ) { }

    /**
     * Déploie une application SaaS dans un conteneur Docker.
     * Certaines apps (phpMyAdmin, pgAdmin) sont liées à un service PaaS existant.
     */
    async create(dto: CreateSaasDto, adminPayerId?: number): Promise<ServiceSaaS> {
        if (!dto?.nomPersonnalise) {
            throw new BadRequestException('Le champ nomPersonnalise est requis.');
        }

        if (!dto.catalogueId) {
            throw new BadRequestException('Veuillez sélectionner un plan valide dans le catalogue pour cette application SaaS.');
        }

        // --- Vérification du catalogue ---
        const catalogue = await this.catalogueRepo.findOne({ where: { id: dto.catalogueId, isActive: true } });
        if (!catalogue) {
            throw new NotFoundException(`Offre catalogue #${dto.catalogueId} introuvable ou inactive.`);
        }
        const prixMensuel = Number(catalogue.prix) || 0;
        const payerId = adminPayerId ?? dto.clientId;

        // --- Vérification du solde ---
        if (prixMensuel > 0) {
            const soldeOk = await this.walletService.checkSolde(payerId, prixMensuel);
            if (!soldeOk) {
                const wallet = await this.walletService.getOrCreateWallet(payerId);
                throw new BadRequestException(
                    `Solde insuffisant. Votre solde actuel est de ${Number(wallet.solde).toFixed(3)} DT. Ce service SaaS coûte ${prixMensuel.toFixed(3)} DT/mois.`,
                );
            }
        }

        // --- Résolution du service PaaS lié (si applicable) ---
        let linkedPaas: ServicePaaS | null = null;
        if (dto.linkedPaasServiceId) {
            linkedPaas = await this.paasRepo.findOne({ where: { id: dto.linkedPaasServiceId } });
            if (!linkedPaas) {
                throw new NotFoundException(`Service PaaS #${dto.linkedPaasServiceId} introuvable.`);
            }
        }

        // --- Génération du port et du nom de conteneur ---
        const externalPort = await this.generateUniquePort();
        const cleanName = dto.nomPersonnalise.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const containerName = `saas_${cleanName}_${externalPort}`;

        // --- Mot de passe admin par défaut ---
        const adminPassword = dto.adminPassword || Math.random().toString(36).slice(-8) + 'A1!';
        const adminEmail = dto.adminEmail || 'admin@cloud.local';

        // --- Les limites CPU et RAM du catalogue sont ignorées pour le SaaS ---
        // Les conteneurs SaaS n'auront aucune restriction de ressources
        const limitsStr = '';

        // --- Construction de la commande Docker ---
        let dockerCmd = '';
        let connectionString = '';

        switch (dto.appType) {
            case SaasAppType.PHPMYADMIN:
                if (!linkedPaas) {
                    throw new BadRequestException('phpMyAdmin nécessite un service PaaS MySQL lié (linkedPaasServiceId).');
                }
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} ` +
                    `-e PMA_HOST=${linkedPaas.hostIp} ` +
                    `-e PMA_PORT=${linkedPaas.port} ` +
                    `-e PMA_USER=${linkedPaas.dbUser} ` +
                    `-e PMA_PASSWORD=${linkedPaas.dbPassword} ` +
                    `-p ${externalPort}:80 --restart always ${SaasAppType.PHPMYADMIN}`;
                connectionString = `http://${this.hostIp}:${externalPort}`;
                break;

            case SaasAppType.PGADMIN:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} ` +
                    `-e PGADMIN_DEFAULT_EMAIL=${adminEmail} ` +
                    `-e PGADMIN_DEFAULT_PASSWORD=${adminPassword} ` +
                    `-p ${externalPort}:80 --restart always ${SaasAppType.PGADMIN}`;
                connectionString = `http://${this.hostIp}:${externalPort}`;
                break;

            case SaasAppType.WORDPRESS:
                if (linkedPaas) {
                    // WordPress lié à une base MySQL existante
                    dockerCmd = `docker run -d ${limitsStr}--name ${containerName} ` +
                        `-e WORDPRESS_DB_HOST=${linkedPaas.hostIp}:${linkedPaas.port} ` +
                        `-e WORDPRESS_DB_USER=${linkedPaas.dbUser} ` +
                        `-e WORDPRESS_DB_PASSWORD=${linkedPaas.dbPassword} ` +
                        `-e WORDPRESS_DB_NAME=${linkedPaas.nomPersonnalise} ` +
                        `-v /var/lib/saas/data/${containerName}:/var/www/html ` +
                        `-p ${externalPort}:80 --restart always ${SaasAppType.WORDPRESS}`;
                } else {
                    // WordPress standalone avec sa propre base de données intégrée via Docker network
                    const dbContainerName = `${containerName}_db`;
                    const dbPass = Math.random().toString(36).slice(-8) + 'Db1!';
                    const networkName = `net_${containerName}`;

                    // On crée un réseau + un conteneur MySQL + WordPress
                    dockerCmd =
                        `docker network create ${networkName} && ` +
                        `docker run -d --name ${dbContainerName} --network ${networkName} ` +
                        `-e MYSQL_ROOT_PASSWORD=${dbPass} ` +
                        `-e MYSQL_DATABASE=wordpress ` +
                        `-e MYSQL_USER=wp_user ` +
                        `-e MYSQL_PASSWORD=${dbPass} ` +
                        `-v /var/lib/saas/data/${dbContainerName}:/var/lib/mysql ` +
                        `--restart always mysql:8.0 && ` +
                        `docker run -d ${limitsStr}--name ${containerName} --network ${networkName} ` +
                        `-e WORDPRESS_DB_HOST=${dbContainerName}:3306 ` +
                        `-e WORDPRESS_DB_USER=wp_user ` +
                        `-e WORDPRESS_DB_PASSWORD=${dbPass} ` +
                        `-e WORDPRESS_DB_NAME=wordpress ` +
                        `-v /var/lib/saas/data/${containerName}:/var/www/html ` +
                        `-p ${externalPort}:80 --restart always ${SaasAppType.WORDPRESS}`;
                }
                connectionString = `http://${this.hostIp}:${externalPort}`;
                break;

            case SaasAppType.N8N:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} -u root ` +
                    `-e N8N_LISTEN_ADDRESS=0.0.0.0 ` +
                    `-e N8N_SECURE_COOKIE=false ` +
                    `-e N8N_BASIC_AUTH_ACTIVE=true ` +
                    `-e N8N_BASIC_AUTH_USER=${adminEmail} ` +
                    `-e N8N_BASIC_AUTH_PASSWORD=${adminPassword} ` +
                    `-v /var/lib/saas/data/${containerName}:/home/node/.n8n ` +
                    `-p ${externalPort}:5678 --restart always ${SaasAppType.N8N}`;
                connectionString = `http://${this.hostIp}:${externalPort}`;
                break;

            case SaasAppType.MONGO_EXPRESS:
                if (!linkedPaas) {
                    throw new BadRequestException('Mongo Express nécessite un service PaaS MongoDB lié (linkedPaasServiceId).');
                }
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} ` +
                    `-e ME_CONFIG_MONGODB_URL="mongodb://${linkedPaas.dbUser}:${linkedPaas.dbPassword}@${linkedPaas.hostIp}:${linkedPaas.port}/?authSource=admin" ` +
                    `-e ME_CONFIG_BASICAUTH_USERNAME=${adminEmail} ` +
                    `-e ME_CONFIG_BASICAUTH_PASSWORD=${adminPassword} ` +
                    `-p ${externalPort}:8081 --restart always ${SaasAppType.MONGO_EXPRESS}`;
                connectionString = `http://${this.hostIp}:${externalPort}`;
                break;

            case SaasAppType.REDIS_INSIGHT:
                if (!linkedPaas) {
                    throw new BadRequestException('Redis Commander nécessite un service PaaS Redis lié (linkedPaasServiceId).');
                }
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} ` +
                    `-e REDIS_HOSTS=my-redis:${linkedPaas.hostIp}:${linkedPaas.port}:0:${linkedPaas.dbPassword} ` +
                    `-e HTTP_USER=${adminEmail} ` +
                    `-e HTTP_PASSWORD=${adminPassword} ` +
                    `-p ${externalPort}:8081 --restart always ${SaasAppType.REDIS_INSIGHT}`;
                connectionString = `http://${this.hostIp}:${externalPort}`;
                break;

            default:
                throw new InternalServerErrorException(`Type d'application SaaS non pris en charge : ${dto.appType}`);
        }

        const ssh = new NodeSSH();
        try {
            // --- Connexion SSH et déploiement ---
            await ssh.connect({
                host: this.hostIp,
                username: this.sshUser,
                password: this.sshPass,
                readyTimeout: 30000,
            });

            const result = await ssh.execCommand(dockerCmd);
            ssh.dispose();

            if (result.code !== 0) {
                throw new Error(`Erreur lors du lancement Docker : ${result.stderr}`);
            }

            // --- DÉBIT DU WALLET APRÈS DÉPLOIEMENT RÉUSSI ---
            if (prixMensuel > 0) {
                await this.walletService.debiter(
                    payerId,
                    prixMensuel,
                    `Déploiement d'un service SaaS (${dto.nomPersonnalise})`,
                    undefined,
                );
            }

            // --- Sauvegarde en base de données ---
            const now = new Date();
            const nextMonth = new Date(now);
            nextMonth.setMonth(now.getMonth() + 1);

            const newSaas = this.saasRepo.create({
                nomPersonnalise: dto.nomPersonnalise,
                prixMensuel: prixMensuel,
                status: ServiceStatus.RUNNING,
                port: externalPort,
                connectionString,
                client: { id: dto.clientId } as any,
                catalogue: catalogue,
                dateProchaineFacturation: nextMonth,
                linkedPaasService: linkedPaas ?? undefined,
                ownerEmail: adminEmail,
                ownerPassword: adminPassword,
            });

            // Attendre quelques secondes pour s'assurer que le conteneur est prêt à écouter les requêtes
            // (n8n et WordPress nécessitent plus de temps car ils initialisent leurs bases de données)
            const delayMs = (dto.appType === SaasAppType.N8N || dto.appType === SaasAppType.WORDPRESS) ? 15000 : 5000;
            await new Promise(resolve => setTimeout(resolve, delayMs));

            const savedSaas = await this.saasRepo.save(newSaas);

            // Fetch client for email notification
            const client = await this.clientRepo.findOne({ where: { id: dto.clientId } });
            if (client) {
                this.mailService.sendProvisionningSuccesSaas({
                    userEmail: client.email,
                    userPrenom: client.prenom,
                    userNom: client.nom,
                    nomInstance: dto.nomPersonnalise,
                    urlAcces: connectionString,
                });
            }

            return savedSaas;

        } catch (error) {
            ssh.dispose();

            throw new InternalServerErrorException(`Échec du déploiement SaaS : ${error.message}`);
        }
    }

    /**
     * Récupère la liste des applications SaaS d'un client
     */
    async findAllByClient(clientId: number): Promise<ServiceSaaS[]> {
        return await this.saasRepo.find({
            where: { client: { id: clientId } },
            relations: ['catalogue', 'linkedPaasService'],
            order: { dateCreation: 'DESC' },
        });
    }

    /**
     * Récupère toutes les instances SaaS (admin)
     */
    async findAll(): Promise<ServiceSaaS[]> {
        return await this.saasRepo.find({
            relations: ['catalogue', 'linkedPaasService', 'client'],
            order: { dateCreation: 'DESC' },
        });
    }

    /**
     * Récupère un service SaaS par son ID
     */
    async findOne(id: number): Promise<ServiceSaaS> {
        const saas = await this.saasRepo.findOne({
            where: { id },
            relations: ['catalogue', 'linkedPaasService', 'client'],
        });
        if (!saas) {
            throw new NotFoundException(`Service SaaS avec l'ID ${id} introuvable.`);
        }
        return saas;
    }

    /**
     * Supprime le conteneur Docker SaaS et nettoie la base de données
     */
    async remove(id: number): Promise<{ message: string }> {
        const saasService = await this.saasRepo.findOne({ where: { id } });
        if (!saasService) {
            throw new NotFoundException(`Service SaaS avec l'ID ${id} introuvable.`);
        }

        const cleanName = saasService.nomPersonnalise.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const containerName = `saas_${cleanName}_${saasService.port}`;

        const ssh = new NodeSSH();
        try {
            await ssh.connect({
                host: this.hostIp,
                username: this.sshUser,
                password: this.sshPass,
                readyTimeout: 30000,
            });

            // Arrête et supprime le conteneur Docker + données
            // On tente aussi de supprimer un éventuel conteneur DB standalone (WordPress)
            const dbContainerName = `${containerName}_db`;
            const networkName = `net_${containerName}`;
            await ssh.execCommand(
                `docker stop ${containerName} 2>/dev/null; docker rm ${containerName} 2>/dev/null; ` +
                `docker stop ${dbContainerName} 2>/dev/null; docker rm ${dbContainerName} 2>/dev/null; ` +
                `docker network rm ${networkName} 2>/dev/null; ` +
                `echo ${this.sshPass} | sudo -S rm -rf /var/lib/saas/data/${containerName} /var/lib/saas/data/${dbContainerName}`,
            );
            ssh.dispose();

            await this.saasRepo.remove(saasService);

            return { message: `Application SaaS ${saasService.nomPersonnalise} supprimée avec succès.` };
        } catch (error) {
            ssh.dispose();
            throw new InternalServerErrorException(`Erreur lors de la suppression SaaS : ${error.message}`);
        }
    }

    /**
     * Mise à niveau d'un service SaaS (changement d'offre catalogue)
     */
    async upgradeContainer(
        id: number,
        catalogueId: number,
        clientId: number,
        debitClientId?: number,
    ): Promise<{ userPrenom: string; userNom: string; resourceName: string; oldPlan: string; newPlan: string; diffPrice: number }> {
        const saasService = await this.saasRepo.findOne({
            where: { id, client: { id: clientId } },
            relations: ['client', 'catalogue'],
        });
        if (!saasService) {
            throw new NotFoundException(`Service SaaS introuvable pour ce client.`);
        }

        const newCatalogue = await this.catalogueRepo.findOne({ where: { id: catalogueId, isActive: true } });
        if (!newCatalogue) {
            throw new NotFoundException(`Nouvelle offre introuvable ou inactive.`);
        }

        const oldPrice = Number(saasService.prixMensuel) || 0;
        const newPrice = Number(newCatalogue.prix) || 0;

        if (newPrice <= oldPrice) {
            throw new BadRequestException('La nouvelle offre doit avoir un prix supérieur à l\'offre actuelle.');
        }

        const diffPrice = newPrice - oldPrice;
        const oldPlanName = saasService.catalogue?.nomService ?? 'SaaS';
        const walletClientId = debitClientId ?? clientId;

        try {
            await this.walletService.debiter(
                walletClientId,
                diffPrice,
                `Mise à niveau (Scale-up) de l'application SaaS ${saasService.nomPersonnalise}`,
                undefined,
            );
        } catch (walletErr) {
            throw new BadRequestException(
                `Solde insuffisant pour la mise à niveau. Différence à payer: ${diffPrice.toFixed(3)} DT.`,
            );
        }

        // --- Mise à jour des limites de ressources via docker update ---
        const cleanName = saasService.nomPersonnalise.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const containerName = `saas_${cleanName}_${saasService.port}`;

        const cpuOpt = newCatalogue.vcpu > 0 ? `--cpus="${newCatalogue.vcpu}"` : '';
        const memoryInMb = Math.round(newCatalogue.ramMB * 1024);
        const memOpt = newCatalogue.ramMB > 0 ? `--memory="${memoryInMb}m"` : '';
        const updateOpts = [cpuOpt, memOpt].filter(Boolean).join(' ');

        if (updateOpts) {
            const ssh = new NodeSSH();
            try {
                await ssh.connect({
                    host: this.hostIp,
                    username: this.sshUser,
                    password: this.sshPass,
                    readyTimeout: 30000,
                });

                const result = await ssh.execCommand(`docker update ${updateOpts} ${containerName}`);
                ssh.dispose();

                if (result.code !== 0) {
                    this.logger.warn(`Avertissement docker update: ${result.stderr}`);
                }
            } catch (error) {
                ssh.dispose();
                throw new InternalServerErrorException(`Erreur lors de la mise à niveau Docker : ${error.message}`);
            }
        }

        saasService.catalogue = newCatalogue;
        saasService.prixMensuel = newPrice;
        await this.saasRepo.save(saasService);

        // Mise à jour de la demande associée
        const demande = await this.demandeRepo.findOne({
            where: {
                nomInstanceSouhaite: saasService.nomPersonnalise,
                client: { id: saasService.client.id },
                status: DemandeStatus.APPROUVEE,
            },
        });
        if (demande) {
            demande.catalogue = newCatalogue;
            demande.prixMensuel = newPrice;
            await this.demandeRepo.save(demande);
        }

        return {
            userPrenom: saasService.client.prenom,
            userNom: saasService.client.nom,
            resourceName: saasService.nomPersonnalise,
            oldPlan: oldPlanName,
            newPlan: newCatalogue.nomService,
            diffPrice,
        };
    }

    /**
     * Récupère les métriques du conteneur SaaS (CPU, RAM, stockage)
     */
    async getContainerMetrics(id: number) {
        const saasService = await this.saasRepo.findOne({ where: { id } });
        if (!saasService) {
            throw new NotFoundException(`Service SaaS avec l'ID ${id} introuvable.`);
        }

        const cleanName = saasService.nomPersonnalise.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const containerName = `saas_${cleanName}_${saasService.port}`;

        const ssh = new NodeSSH();
        try {
            await ssh.connect({
                host: this.hostIp,
                username: this.sshUser,
                password: this.sshPass,
                readyTimeout: 30000,
            });

            const statsCmd = `docker stats ${containerName} --no-stream --format '{"cpu":"{{.CPUPerc}}","ramUsage":"{{.MemUsage}}","ramPerc":"{{.MemPerc}}"}'`;
            const statsResult = await ssh.execCommand(statsCmd);

            const diskCmd = `du -sm /var/lib/saas/data/${containerName} | awk '{print $1}'`;
            const diskResult = await ssh.execCommand(diskCmd);

            ssh.dispose();

            let stats: any = {};
            try {
                stats = JSON.parse(statsResult.stdout.trim() || '{}');
            } catch (e) { }

            const storageMb = parseInt(diskResult.stdout.trim(), 10) || 0;

            return {
                containerName,
                cpuUsage: stats.cpu || '0.00%',
                ramUsage: stats.ramUsage || '0B / 0B',
                ramPercentage: stats.ramPerc || '0.00%',
                usedStorageMb: storageMb,
            };
        } catch (error) {
            ssh.dispose();
            this.logger.error(`Erreur getContainerMetrics SaaS: ${error.message}`);
            return {
                containerName,
                cpuUsage: '0.00%',
                ramUsage: '0B / 0B',
                ramPercentage: '0.00%',
                usedStorageMb: 0,
            };
        }
    }

    /**
     * Helper : Génère un port réseau unique entre 20000 et 30000
     * (plage différente du PaaS pour éviter les conflits)
     */
    private async generateUniquePort(): Promise<number> {
        let port: number;
        let attempts = 0;
        do {
            port = Math.floor(20000 + Math.random() * 10000);
            const existing = await this.saasRepo.findOne({ where: { port } });
            if (!existing) return port;
            attempts++;
        } while (attempts < 100);
        return port;
    }
}
