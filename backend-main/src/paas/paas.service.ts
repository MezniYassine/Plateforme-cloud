import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { withSsh } from '../common/ssh.util';
import { ServicePaaS } from 'src/entities/servicePaaS.entity';
import { ServiceStatus } from 'src/enum/service-status.enum';
import { TypeSgbd } from 'src/enum/type-sgbd.enum';
import { CreatePaasDto } from './dto/create-paas.dto';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { WalletService } from 'src/wallet/wallet.service';
import { EsxiService } from 'src/esxi/esxi.service';
import { Demande, DemandeStatus } from 'src/demande/entities/demande.entity';

@Injectable()
export class PaasService implements OnModuleInit {
    private readonly logger = new Logger(PaasService.name);

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
        @InjectRepository(ServicePaaS)
        private readonly paasRepo: Repository<ServicePaaS>,
        @InjectRepository(Catalogue)
        private readonly catalogueRepo: Repository<Catalogue>,
        @InjectRepository(Demande)
        private readonly demandeRepo: Repository<Demande>,
        private readonly walletService: WalletService,
        private readonly esxiService: EsxiService,
    ) { }

    async onModuleInit() {
        this.logger.log('Vérification de l\'état de la machine DBaaS sur l\'ESXi...');
        try {
            const vms = await this.esxiService.getVms();
            const paasVm = vms.find(vm =>
                vm.name === 'DBaaS'
            );

            if (paasVm) {
                if (paasVm.state !== 'poweredOn') {
                    this.logger.warn('⚠️ La machine DBaaS est éteinte. Tentative de démarrage...');
                    await this.esxiService.powerControl(paasVm.id, 'start');
                    this.logger.log('✅ Ordre de démarrage envoyé pour la machine DBaaS.');
                } else {
                    this.logger.log('✅ La machine DBaaS (DBaaS) est déjà en cours d\'exécution.');
                }
            } else {
                this.logger.warn('⚠️ Attention : Aucune machine nommée "DBaaS" n\'a été trouvée sur l\'ESXi.');
            }
        } catch (error) {
            this.logger.error(`Erreur lors de la vérification de la machine DBaaS : ${error.message}`);
        }
    }

    async createDatabase(dto: CreatePaasDto, adminPayerId?: number): Promise<ServicePaaS> {
        if (!dto?.nomPersonnalise) {
            throw new BadRequestException('Le champ nomPersonnalise est requis.');
        }

        const catalogue = await this.catalogueRepo.findOne({ where: { id: dto.catalogueId, isActive: true } });
        if (!catalogue) {
            throw new NotFoundException(`Offre catalogue #${dto.catalogueId} introuvable ou inactive.`);
        }
        const prixMensuel = Number(catalogue.prix) || 0;
        const payerId = adminPayerId ?? dto.clientId;

        if (prixMensuel > 0) {
            const soldeOk = await this.walletService.checkSolde(payerId, prixMensuel);
            if (!soldeOk) {
                const wallet = await this.walletService.getOrCreateWallet(payerId);
                throw new BadRequestException(`Solde insuffisant. Votre solde actuel est de ${Number(wallet.solde).toFixed(3)} DT. Ce service PaaS coûte ${prixMensuel.toFixed(3)} DT/mois.`);
            }
        }

        // 1. Génération des accès et du port distant
        const dbUser = `user_${Math.floor(1000 + Math.random() * 9000)}`;
        const dbPass = Math.random().toString(36).slice(-8) + 'A1!'; // Mot de passe fort
        const externalPort = await this.generateUniquePort();

        // Normalisation du nom pour éviter les espaces dans le nom du conteneur Docker
        const cleanDbName = dto.nomPersonnalise.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const containerName = `db_${cleanDbName}_${externalPort}`;

        let dockerCmd = '';
        let connectionString = '';

        const cpuOpt = catalogue.vcpu > 0 ? `--cpus="${catalogue.vcpu}"` : '';
        const memoryInMb = Math.round(catalogue.ramMB * 1024);
        const memOpt = catalogue.ramMB > 0 ? `--memory="${memoryInMb}m"` : '';
        const storageOpt = catalogue.stockageGB > 0 ? `--storage-opt size=${catalogue.stockageGB}G` : '';
        // Only include options that are not empty
        const resourceLimits = [cpuOpt, memOpt, storageOpt].filter(Boolean).join(' ');
        // Ensure there is a trailing space if limits were added, else empty string
        const limitsStr = resourceLimits ? `${resourceLimits} ` : '';

        // 2. Configuration des commandes selon le SGBD sélectionné
        switch (dto.typeSgbd) {
            case TypeSgbd.POSTGRESQL:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} -e POSTGRES_DB=${dto.nomPersonnalise} -e POSTGRES_USER=${dbUser} -e POSTGRES_PASSWORD=${dbPass} -v /var/lib/dbaas/data/${containerName}:/var/lib/postgresql/data -p ${externalPort}:5432 --restart always postgres:15-alpine`;
                connectionString = `postgresql://${dbUser}:${dbPass}@${this.hostIp}:${externalPort}/${dto.nomPersonnalise}`;
                break;

            case TypeSgbd.MYSQL:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} -e MYSQL_DATABASE=${dto.nomPersonnalise} -e MYSQL_USER=${dbUser} -e MYSQL_PASSWORD=${dbPass} -e MYSQL_ROOT_PASSWORD=${dbPass}_root -v /var/lib/dbaas/data/${containerName}:/var/lib/mysql -p ${externalPort}:3306 --restart always mysql:8.0`;
                connectionString = `mysql://${dbUser}:${dbPass}@${this.hostIp}:${externalPort}/${dto.nomPersonnalise}`;
                break;

            case TypeSgbd.REDIS:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} -v /var/lib/dbaas/data/${containerName}:/data -p ${externalPort}:6379 --restart always redis:alpine redis-server --requirepass ${dbPass} --appendonly yes`;
                connectionString = `redis://:${dbPass}@${this.hostIp}:${externalPort}`;
                break;

            case TypeSgbd.MONGODB:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} -e MONGO_INITDB_ROOT_USERNAME=${dbUser} -e MONGO_INITDB_ROOT_PASSWORD=${dbPass} -e MONGO_INITDB_DATABASE=${dto.nomPersonnalise} -v /var/lib/dbaas/data/${containerName}:/data/db -p ${externalPort}:27017 --restart always mongo:4.4`;
                connectionString = `mongodb://${dbUser}:${dbPass}@${this.hostIp}:${externalPort}/${dto.nomPersonnalise}?authSource=admin`;
                break;

            default:
                throw new InternalServerErrorException(`SGBD non pris en charge : ${dto.typeSgbd}`);
        }

        const sshOptions = {
            host: this.hostIp,
            username: this.sshUser,
            password: this.sshPass,
            readyTimeout: 30000,
        };

        try {
            await withSsh(sshOptions, async (ssh) => {
                // 3. Connexion SSH à la VM DBaaS
                // 4. Lancement du conteneur Docker
                const result = await ssh.execCommand(dockerCmd);

                if (result.code !== 0) {
                    throw new Error(`Erreur lors du lancement Docker : ${result.stderr}`);
                }
            });

            // --- DÉBIT DU WALLET APRÈS DÉPLOIEMENT RÉUSSI ---
            if (prixMensuel > 0) {
                await this.walletService.debiter(
                    payerId,
                    prixMensuel,
                    `Déploiement d'un service PaaS (${dto.nomPersonnalise})`,
                    undefined,
                );
            }

            // 5. Sauvegarde de l'instance dans la base de données (avec les champs de ServiceInstance)
            const now = new Date();
            const nextMonth = new Date(now);
            nextMonth.setMonth(now.getMonth() + 1);

            const newPaas = this.paasRepo.create({
                nomPersonnalise: dto.nomPersonnalise,
                prixMensuel: prixMensuel,
                status: ServiceStatus.RUNNING,
                typeSgbd: dto.typeSgbd,
                dbUser,
                dbPassword: dbPass,
                hostIp: this.hostIp,
                port: externalPort,
                connectionString,
                client: { id: dto.clientId } as any,
                catalogue: catalogue,
                dateProchaineFacturation: nextMonth,
            });

            return await this.paasRepo.save(newPaas);

        } catch (error) {
            throw new InternalServerErrorException(`Échec du déploiement DBaaS : ${error.message}`);
        }
    }

    /**
     * Récupère la liste des bases de données d'un client spécifique
     */
    async getMyDatabases(clientId: number): Promise<ServicePaaS[]> {
        return await this.paasRepo.find({
            where: { client: { id: clientId } },
            relations: ['catalogue'],
            order: { dateCreation: 'DESC' },
        });
    }

    /**
     * Supprime le conteneur Docker sur la VM et nettoie la base de données
     */
    async deleteDatabase(id: number): Promise<{ message: string }> {
        const paasService = await this.paasRepo.findOne({ where: { id } });
        if (!paasService) {
            throw new NotFoundException(`Service PaaS avec l'ID ${id} introuvable.`);
        }

        const cleanDbName = paasService.nomPersonnalise.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const containerName = `db_${cleanDbName}_${paasService.port}`;

        const sshOptions = {
            host: this.hostIp,
            username: this.sshUser,
            password: this.sshPass,
            readyTimeout: 30000,
        };

        try {
            await withSsh(sshOptions, async (ssh) => {
                // Arrête et supprime le conteneur Docker ET supprime le dossier de données localement
                await ssh.execCommand(`docker stop ${containerName} && docker rm ${containerName} && echo ${this.sshPass} | sudo -S rm -rf /var/lib/dbaas/data/${containerName}`);
            });

            // Supprime la ligne en base de données
            await this.paasRepo.remove(paasService);

            return { message: `Base de données ${paasService.nomPersonnalise} supprimée avec succès.` };
        } catch (error) {
            throw new InternalServerErrorException(`Erreur lors de la suppression de la BDD : ${error.message}`);
        }
    }

    async upgradeContainer(id: number, catalogueId: number, clientId: number, debitClientId?: number): Promise<{ userPrenom: string; userNom: string; resourceName: string; oldPlan: string; newPlan: string; diffPrice: number }> {
        const paasService = await this.paasRepo.findOne({ where: { id, client: { id: clientId } }, relations: ['client', 'catalogue'] });
        if (!paasService) {
            throw new NotFoundException(`Service PaaS introuvable pour ce client.`);
        }

        const newCatalogue = await this.catalogueRepo.findOne({ where: { id: catalogueId, isActive: true } });
        if (!newCatalogue) {
            throw new NotFoundException(`Nouvelle offre introuvable ou inactive.`);
        }

        const oldPrice = Number(paasService.prixMensuel) || 0;
        const newPrice = Number(newCatalogue.prix) || 0;

        if (newPrice <= oldPrice) {
            throw new BadRequestException('La nouvelle offre doit avoir un prix supérieur à l\'offre actuelle.');
        }

        const diffPrice = newPrice - oldPrice;
        const oldPlanName = paasService.catalogue?.nomService ?? `${paasService.typeSgbd}`;
        const walletClientId = debitClientId ?? clientId;

        try {
            await this.walletService.debiter(
                walletClientId,
                diffPrice,
                `Mise à niveau (Scale-up) de la base de données ${paasService.nomPersonnalise}${debitClientId && debitClientId !== clientId ? ` par ${paasService.client.prenom} ${paasService.client.nom}` : ''}`,
                undefined,
            );
        } catch (walletErr) {
            throw new BadRequestException(`Solde insuffisant pour la mise à niveau. Différence à payer: ${diffPrice.toFixed(3)} DT.`);
        }

        const cleanDbName = paasService.nomPersonnalise.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const containerName = `db_${cleanDbName}_${paasService.port}`;

        const cpuOpt = newCatalogue.vcpu > 0 ? `--cpus="${newCatalogue.vcpu}"` : '';
        const memoryInMb = Math.round(newCatalogue.ramMB * 1024);
        const memOpt = newCatalogue.ramMB > 0 ? `--memory="${memoryInMb}m"` : '';
        const storageOpt = newCatalogue.stockageGB > 0 ? `--storage-opt size=${newCatalogue.stockageGB}G` : '';
        const resourceLimits = [cpuOpt, memOpt, storageOpt].filter(Boolean).join(' ');
        const limitsStr = resourceLimits ? `${resourceLimits} ` : '';

        let dockerCmd = '';
        switch (paasService.typeSgbd) {
            case TypeSgbd.POSTGRESQL:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} -e POSTGRES_DB=${paasService.nomPersonnalise} -e POSTGRES_USER=${paasService.dbUser} -e POSTGRES_PASSWORD=${paasService.dbPassword} -v /var/lib/dbaas/data/${containerName}:/var/lib/postgresql/data -p ${paasService.port}:5432 --restart always postgres:15-alpine`;
                break;
            case TypeSgbd.MYSQL:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} -e MYSQL_DATABASE=${paasService.nomPersonnalise} -e MYSQL_USER=${paasService.dbUser} -e MYSQL_PASSWORD=${paasService.dbPassword} -e MYSQL_ROOT_PASSWORD=${paasService.dbPassword}_root -v /var/lib/dbaas/data/${containerName}:/var/lib/mysql -p ${paasService.port}:3306 --restart always mysql:8.0`;
                break;
            case TypeSgbd.REDIS:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} -v /var/lib/dbaas/data/${containerName}:/data -p ${paasService.port}:6379 --restart always redis:alpine redis-server --requirepass ${paasService.dbPassword} --appendonly yes`;
                break;
            case TypeSgbd.MONGODB:
                dockerCmd = `docker run -d ${limitsStr}--name ${containerName} -e MONGO_INITDB_ROOT_USERNAME=${paasService.dbUser} -e MONGO_INITDB_ROOT_PASSWORD=${paasService.dbPassword} -e MONGO_INITDB_DATABASE=${paasService.nomPersonnalise} -v /var/lib/dbaas/data/${containerName}:/data/db -p ${paasService.port}:27017 --restart always mongo:4.4`;
                break;
            default:
                throw new InternalServerErrorException(`SGBD non pris en charge : ${paasService.typeSgbd}`);
        }

        const sshOptions = {
            host: this.hostIp,
            username: this.sshUser,
            password: this.sshPass,
            readyTimeout: 30000,
        };

        try {
            await withSsh(sshOptions, async (ssh) => {
                await ssh.execCommand(`docker stop ${containerName} && docker rm ${containerName}`);
                const result = await ssh.execCommand(dockerCmd);

                if (result.code !== 0) {
                    throw new Error(`Erreur lors du relancement Docker pour upgrade : ${result.stderr}`);
                }
            });
        } catch (error) {
            throw new InternalServerErrorException(`Erreur lors de la mise à niveau Docker : ${error.message}`);
        }

        paasService.catalogue = newCatalogue;
        paasService.prixMensuel = newPrice;
        await this.paasRepo.save(paasService);

        const demande = await this.demandeRepo.findOne({
            where: {
                nomInstanceSouhaite: paasService.nomPersonnalise,
                client: { id: paasService.client.id },
                status: DemandeStatus.APPROUVEE
            }
        });
        if (demande) {
            demande.catalogue = newCatalogue;
            demande.prixMensuel = newPrice;
            await this.demandeRepo.save(demande);
        }

        return {
            userPrenom: paasService.client.prenom,
            userNom: paasService.client.nom,
            resourceName: paasService.nomPersonnalise,
            oldPlan: oldPlanName,
            newPlan: newCatalogue.nomService,
            diffPrice,
        };
    }

    async getContainerMetrics(id: number) {
        const paasService = await this.paasRepo.findOne({ where: { id } });
        if (!paasService) {
            throw new NotFoundException(`Service PaaS avec l'ID ${id} introuvable.`);
        }
        const cleanDbName = paasService.nomPersonnalise.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const containerName = `db_${cleanDbName}_${paasService.port}`;

        const sshOptions = {
            host: this.hostIp,
            username: this.sshUser,
            password: this.sshPass,
            readyTimeout: 30000,
        };

        try {
            return await withSsh(sshOptions, async (ssh) => {
                // 1. Commande pour le CPU/RAM
                const statsCmd = `docker stats ${containerName} --no-stream --format '{"cpu":"{{.CPUPerc}}","ramUsage":"{{.MemUsage}}","ramPerc":"{{.MemPerc}}"}'`;
                const statsResult = await ssh.execCommand(statsCmd);

                // 2. Commande pour le Stockage sur disque
                const diskCmd = `du -sm /var/lib/dbaas/data/${containerName} | awk '{print $1}'`;
                const diskResult = await ssh.execCommand(diskCmd);

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
            });
        } catch (error) {
            console.error(`Erreur getContainerMetrics: ${error.message}`);
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
     * Helper : Génère un port réseau unique entre 10000 et 20000
     */
    private async generateUniquePort(): Promise<number> {
        return Math.floor(10000 + Math.random() * 10000);
    }
}