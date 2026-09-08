import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Client } from 'src/entities/client.entity';
import { AccountStatus } from 'src/enum/account-status.enum';
import { RoleClient } from 'src/enum/role-client.enum';
import { Entreprise } from 'src/entities/entreprise.entity';
import { Demande, DemandeStatus } from 'src/demande/entities/demande.entity';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { EsxiService } from 'src/esxi/esxi.service';
import { ServiceStatus } from 'src/enum/service-status.enum';
import { Wallet } from 'src/entities/wallet.entity';
import { Transaction } from 'src/entities/transaction.entity';
import { ServicePaaS } from 'src/entities/servicePaaS.entity';
import { PaasService } from 'src/paas/paas.service';
import { ServiceSaaS } from 'src/entities/serviceSaaS.entity';
import { computePrediction } from 'src/common/prediction.util';

export interface InviteDto {
    nom: string;
    prenom: string;
    email: string;
}

@Injectable()
export class EntrepriseService {
    constructor(
        @InjectRepository(Client)
        private readonly clientRepository: Repository<Client>,
        private readonly mailerService: MailerService,
        private readonly jwtService: JwtService,
        @InjectRepository(Entreprise)
        private readonly entrepriseRepository: Repository<Entreprise>,
        @InjectRepository(Demande)
        private readonly demandeRepository: Repository<Demande>,
        @InjectRepository(MachineVirtuelle)
        private readonly vmRepo: Repository<MachineVirtuelle>,
        @InjectRepository(Wallet)
        private readonly walletRepo: Repository<Wallet>,
        @InjectRepository(Transaction)
        private readonly transactionRepo: Repository<Transaction>,
        @InjectRepository(ServicePaaS)
        private readonly paasRepo: Repository<ServicePaaS>,
        @InjectRepository(ServiceSaaS)
        private readonly saasRepo: Repository<ServiceSaaS>,
        private readonly esxiService: EsxiService,
        private readonly paasService: PaasService,
    ) { }



    async getProfile(clientId: number) {
        return this.clientRepository.findOne({ where: { id: clientId }, relations: ['entreprise'] });
    }

    async inviterCollaborateur(dto: InviteDto, adminLogged: Client) {
        const email = dto.email?.trim().toLowerCase();
        if (!dto.nom?.trim() || !dto.prenom?.trim() || !email) {
            throw new BadRequestException('Prenom, nom et email sont obligatoires');
        }

        const adminWithEntreprise = await this.clientRepository.findOne({
            where: { id: adminLogged.id },
            relations: ['entreprise'],
        });

        if (!adminWithEntreprise?.entreprise) {
            throw new BadRequestException('Administrateur entreprise invalide');
        }

        if (adminWithEntreprise.role !== RoleClient.ENTREPRISE_ADMIN) {
            throw new BadRequestException('Seul un admin entreprise peut inviter un collaborateur');
        }

        const existing = await this.clientRepository.findOne({ where: { email } });
        if (existing) {
            throw new ConflictException('Cet email est deja utilise');
        }

        const nouveauUser = this.clientRepository.create({
            nom: dto.nom.trim(),
            prenom: dto.prenom.trim(),
            email,
            password: null,
            entreprise: adminWithEntreprise.entreprise,
            status: AccountStatus.PENDING_VALIDATION,
            role: RoleClient.ENTREPRISE_USER,
            isEmailVerified: false,
        });

        const userSauvegarde = await this.clientRepository.save(nouveauUser);

        const invitationToken = this.jwtService.sign(
            { sub: userSauvegarde.id, email: userSauvegarde.email, type: 'INVITATION' },
            { expiresIn: '48h' },
        );

        const urlInvitation = `http://localhost:4200/auth/setup-password?token=${invitationToken}`;

        await this.mailerService.sendMail({
            to: userSauvegarde.email,
            subject: 'Bienvenue chez Dyna-Cloud - Activez votre compte',
            html: `
                <h3>Bienvenue chez Dyna-Cloud</h3>
                <p>Bonjour ${userSauvegarde.prenom} ${userSauvegarde.nom},</p>
                <p>${adminWithEntreprise.prenom} ${adminWithEntreprise.nom} vous invite a rejoindre l'espace ${adminWithEntreprise.entreprise.nomEntreprise}.</p>
                <p><a href="${urlInvitation}">Activer mon compte</a></p>
                <p>Ce lien expire dans 48h.</p>
            `,
        });

        return { message: 'Invitation envoyee avec succes' };
    }
    async getUserByEntreprise(adminId: number) {
        const admin = await this.clientRepository.findOne({
            where: { id: adminId },
            relations: ['entreprise']
        });

        if (!admin || !admin.entreprise) {
            throw new NotFoundException("Cet administrateur n'est rattaché à aucune entreprise.");
        }

        const entrepriseId = admin.entreprise.id;

        // RÃ©cupÃ©rer les utilisateurs avec leurs services
        const users = await this.clientRepository.find({
            where: {
                entreprise: { id: entrepriseId },
                role: RoleClient.ENTREPRISE_USER
            },
            relations: ['services']
        });

        // Couleurs pour les avatars
        const COLORS = ['#1a56e8', '#7c3aed', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#9333ea'];

        // Pour chaque user, calculer les stats
        const result = await Promise.all(users.map(async (u, index) => {
            // Nombre de VMs = services de type MachineVirtuelle
            const vmCount = (u.services || []).filter(s => s instanceof MachineVirtuelle || s['type'] === 'MachineVirtuelle' || s.constructor.name === 'MachineVirtuelle').length;
            const otherServicesCount = (u.services || []).length - vmCount;

            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            const approvedDemandes = await this.demandeRepository.find({
                where: {
                    client: { id: u.id },
                    status: DemandeStatus.APPROUVEE,
                },
                relations: ['catalogue']
            });

            const monthlySpend = approvedDemandes
                .filter(d => new Date(d.dateDemande) >= startOfMonth)
                .reduce((sum, d) => sum + Number(d.prixMensuel || 0), 0);

            return {
                id: String(u.id),
                name: `${u.prenom} ${u.nom}`,
                prenom: u.prenom,
                nom: u.nom,
                email: u.email,
                telephone: u.telephone || null,
                mfaStatus: u.mfaStatus || 'DESACTIVE',
                isEmailVerified: u.isEmailVerified,
                dateInscrit: u.dateInscrit,
                color: COLORS[index % COLORS.length],
                active: u.status === AccountStatus.APPROVED,
                status: u.status,
                vms: vmCount,
                services: otherServicesCount,
                spend: Math.round(monthlySpend * 100) / 100,
            };
        }));

        return result;
    }


    async getBilling(adminId: number) {
        const admin = await this.clientRepository.findOne({
            where: { id: adminId },
            relations: ['entreprise'],
        });

        if (!admin || !admin.entreprise) {
            throw new NotFoundException("Cet administrateur n'est rattache a aucune entreprise.");
        }

        const orgMembers = await this.clientRepository.find({
            where: {
                entreprise: { id: admin.entreprise.id },
                role: In([RoleClient.ENTREPRISE_USER, RoleClient.ENTREPRISE_ADMIN]),
            },
            relations: ['entreprise'],
        });

        const memberIds = orgMembers.map((m) => m.id);
        let wallets = memberIds.length
            ? await this.walletRepo.find({
                where: { user: { id: In(memberIds) } },
                relations: ['user'],
            })
            : [];

        let adminWallet = wallets.find((wallet) => wallet.user?.id === admin.id);
        if (!adminWallet) {
            adminWallet = await this.walletRepo.save(this.walletRepo.create({
                solde: 0,
                devise: 'DT',
                user: admin,
            }));
            wallets = [adminWallet, ...wallets];
        }

        const walletIds = wallets.map((wallet) => wallet.id);
        const walletTransactions = walletIds.length
            ? await this.transactionRepo.find({
                where: { wallet: { id: In(walletIds) } },
                relations: ['wallet', 'wallet.user'],
                order: { dateTransaction: 'DESC' },
                take: 200,
            })
            : [];

        // Récupérer toutes les ressources actives de l'organisation pour enrichir les débits directs
        const [orgVms, orgPaas, orgSaas, approvedDemandes] = await Promise.all([
            this.vmRepo.find({
                where: { client: { id: In(memberIds) } },
                relations: ['catalogue'],
            }),
            this.paasRepo.find({
                where: { client: { id: In(memberIds) } },
                relations: ['catalogue'],
            }),
            this.saasRepo.find({
                where: { client: { id: In(memberIds) } },
                relations: ['catalogue'],
            }),
            this.demandeRepository
                .createQueryBuilder('demande')
                .leftJoinAndSelect('demande.client', 'client')
                .leftJoinAndSelect('demande.catalogue', 'catalogue')
                .leftJoin('client.entreprise', 'entreprise')
                .where('entreprise.id = :entrepriseId', { entrepriseId: admin.entreprise.id })
                .andWhere('demande.status = :status', { status: DemandeStatus.APPROUVEE })
                .orderBy('demande.dateDemande', 'DESC')
                .getMany(),
        ]);

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const COLORS = ['#1a56e8', '#7c3aed', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#9333ea'];

        // 1. Transactions issues des demandes approuvées (collaborateurs)
        const approvedDemandeNames = new Set(
            approvedDemandes.map((d) => (d.nomInstanceSouhaite || '').toLowerCase().trim()).filter(Boolean)
        );

        const demandeTransactions = approvedDemandes.map((demande) => {
            const dDate = new Date(demande.dateDemande || Date.now());
            const refFacture = demande.referenceFacture || `FAC-${dDate.getFullYear()}-${String(demande.id).padStart(5, '0')}`;

            if (!demande.referenceFacture) {
                demande.referenceFacture = refFacture;
                this.demandeRepository.update(demande.id, { referenceFacture: refFacture }).catch(() => {});
            }

            return {
                id: `demande-${demande.id}`,
                refFacture: refFacture,
                desc: demande.nomInstanceSouhaite,
                catalogName: demande.catalogue?.nomService || 'Plan Standard',
                typeService: demande.catalogue?.typeService || 'IAAS',
                catalogue: demande.catalogue ? {
                    id: demande.catalogue.id,
                    nomService: demande.catalogue.nomService,
                    typeService: demande.catalogue.typeService,
                    vcpu: demande.catalogue.vcpu,
                    ramMB: demande.catalogue.ramMB,
                    stockageGB: demande.catalogue.stockageGB,
                    prix: Number(demande.catalogue.prix),
                } : null,
                memberName: demande.client ? `${demande.client.prenom} ${demande.client.nom}` : 'Membre inconnu',
                date: dDate.toISOString(),
                type: 'debit' as const,
                amount: Number(demande.prixMensuel || 0),
            };
        });

        // 2. Transactions directes du Wallet (Recharges, Déploiements directs Admin, Mises à niveau, Renouvellements)
        const directTransactions: any[] = [];

        for (const transaction of walletTransactions) {
            const desc = transaction.description || '';
            const parenMatch = desc.match(/\(([^)]+)\)/);
            const extractedName = parenMatch ? parenMatch[1].trim() : null;

            // Si c'est un débit déjà représenté par une demande approuvée (ex: saas-prod), éviter le doublon
            if (transaction.type === 'DEBIT') {
                if (extractedName && approvedDemandeNames.has(extractedName.toLowerCase())) {
                    continue;
                }
            }

            let memberName = transaction.wallet?.user
                ? `${transaction.wallet.user.prenom} ${transaction.wallet.user.nom}`
                : 'Administrateur';
            let itemDesc = desc;

            if (transaction.type === 'DEBIT' && itemDesc.includes(' par ')) {
                const parts = itemDesc.split(' par ');
                memberName = parts.pop() || memberName;
                itemDesc = parts.join(' par ');
            }

            let catalogName = 'Service Cloud';
            let typeService = 'SERVICE';
            let catalogue: any = null;

            if (transaction.type === 'CREDIT') {
                itemDesc = 'Recharge du portefeuille';
                catalogName = 'Recharge Solde';
                typeService = 'WALLET';
            } else {
                // Recherche de la ressource correspondante dans l'organisation
                const matchedPaas = extractedName ? orgPaas.find(p => p.nomPersonnalise?.toLowerCase() === extractedName.toLowerCase()) : null;
                const matchedSaas = extractedName ? orgSaas.find(s => s.nomPersonnalise?.toLowerCase() === extractedName.toLowerCase()) : null;
                const matchedVm = (transaction.vmId ? orgVms.find(v => v.id === transaction.vmId) : null)
                    || (extractedName ? orgVms.find(v => v.nomPersonnalise?.toLowerCase() === extractedName.toLowerCase()) : null);

                if (matchedPaas) {
                    itemDesc = matchedPaas.nomPersonnalise;
                    typeService = 'PAAS';
                    catalogName = matchedPaas.catalogue?.nomService || `${matchedPaas.typeSgbd || 'DB'} · PaaS`;
                    catalogue = matchedPaas.catalogue ? {
                        id: matchedPaas.catalogue.id,
                        nomService: matchedPaas.catalogue.nomService,
                        typeService: matchedPaas.catalogue.typeService,
                        vcpu: matchedPaas.catalogue.vcpu,
                        ramMB: matchedPaas.catalogue.ramMB,
                        stockageGB: matchedPaas.catalogue.stockageGB,
                        prix: Number(matchedPaas.catalogue.prix),
                    } : null;
                } else if (matchedSaas) {
                    itemDesc = matchedSaas.nomPersonnalise;
                    typeService = 'SAAS';
                    catalogName = matchedSaas.catalogue?.nomService || 'Application SaaS';
                    catalogue = matchedSaas.catalogue ? {
                        id: matchedSaas.catalogue.id,
                        nomService: matchedSaas.catalogue.nomService,
                        typeService: matchedSaas.catalogue.typeService,
                        vcpu: matchedSaas.catalogue.vcpu,
                        ramMB: matchedSaas.catalogue.ramMB,
                        stockageGB: matchedSaas.catalogue.stockageGB,
                        prix: Number(matchedSaas.catalogue.prix),
                    } : null;
                } else if (matchedVm) {
                    itemDesc = matchedVm.nomPersonnalise;
                    typeService = 'IAAS';
                    catalogName = matchedVm.catalogue?.nomService || `${matchedVm.vCPU || 1} vCPU - ${matchedVm.ramGB || 1} GB RAM`;
                    catalogue = matchedVm.catalogue ? {
                        id: matchedVm.catalogue.id,
                        nomService: matchedVm.catalogue.nomService,
                        typeService: matchedVm.catalogue.typeService,
                        vcpu: matchedVm.catalogue.vcpu,
                        ramMB: matchedVm.catalogue.ramMB,
                        stockageGB: matchedVm.catalogue.stockageGB,
                        prix: Number(matchedVm.catalogue.prix),
                    } : null;
                } else if (desc.includes('Mise à niveau') || desc.includes('Scale-up')) {
                    typeService = 'UPGRADE';
                    catalogName = 'Mise à niveau';
                } else if (desc.includes('PaaS')) {
                    typeService = 'PAAS';
                    catalogName = 'Base de données PaaS';
                    if (extractedName) itemDesc = extractedName;
                } else if (desc.includes('IaaS') || desc.includes('Machine Virtuelle')) {
                    typeService = 'IAAS';
                    catalogName = 'Machine Virtuelle';
                    if (extractedName) itemDesc = extractedName;
                } else if (desc.includes('SaaS')) {
                    typeService = 'SAAS';
                    catalogName = 'Application SaaS';
                    if (extractedName) itemDesc = extractedName;
                } else if (desc.includes('Renouvellement')) {
                    typeService = 'RENEWAL';
                    catalogName = 'Renouvellement Mensuel';
                }
            }

            const tDate = new Date(transaction.dateTransaction || Date.now());
            const refFacture = transaction.reference || `FAC-${tDate.getFullYear()}-TR${String(transaction.id).padStart(4, '0')}`;

            directTransactions.push({
                id: `wallet-${transaction.id}`,
                refFacture: refFacture,
                desc: itemDesc,
                catalogName: catalogName,
                typeService: typeService,
                catalogue: catalogue,
                memberName: memberName,
                date: tDate.toISOString(),
                type: transaction.type.toLowerCase() as 'credit' | 'debit',
                amount: Number(transaction.montant),
            });
        }

        // 3. Calcul de la dépense du mois (demandes approuvées ce mois + débits directs ce mois)
        let debitThisMonth = 0;

        demandeTransactions.forEach((t) => {
            if (new Date(t.date) >= startOfMonth) {
                debitThisMonth += t.amount;
            }
        });

        directTransactions.forEach((t) => {
            if (t.type === 'debit' && new Date(t.date) >= startOfMonth) {
                debitThisMonth += t.amount;
            }
        });

        const creditTotal = walletTransactions
            .filter((transaction) => transaction.type === 'CREDIT')
            .reduce((sum, transaction) => sum + Number(transaction.montant), 0);

        // 4. Liste consolidée des transactions (triée par date antéchronologique)
        const transactions = [...demandeTransactions, ...directTransactions]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 100);

        // 5. Consommation par membre (inclut aussi l'administrateur s'il a déployé directement)
        const teamSpend = orgMembers.map((member, index) => {
            const memberFullName = `${member.prenom} ${member.nom}`;
            const isAdmin = member.role === RoleClient.ENTREPRISE_ADMIN;
            const displayName = isAdmin ? `${memberFullName} (Admin)` : memberFullName;

            let spend = 0;

            // Débits des demandes approuvées de ce membre ce mois
            approvedDemandes
                .filter((d) => d.client?.id === member.id && new Date(d.dateDemande) >= startOfMonth)
                .forEach((d) => {
                    spend += Number(d.prixMensuel || 0);
                });

            // Débits directs où ce membre est l'initiateur ce mois
            directTransactions
                .filter((t) => t.type === 'debit' && t.memberName === memberFullName && new Date(t.date) >= startOfMonth)
                .forEach((t) => {
                    spend += t.amount;
                });

            return {
                id: member.id,
                name: displayName,
                spend: Math.round(spend * 1000) / 1000,
                color: COLORS[index % COLORS.length],
            };
        });

        return {
            solde: Number(adminWallet.solde),
            devise: adminWallet.devise,
            depenseMois: Math.round(debitThisMonth * 1000) / 1000,
            totalRecharge: Math.round(creditTotal * 1000) / 1000,
            teamSpend,
            transactions,
        };
    }
    /**
     * RÃ©cupÃ©rer toutes les VMs rÃ©elles de l'organisation depuis la table MachineVirtuelle.
     * Synchronise le statut avec l'ESXi (CPU, RAM, IP) et nettoie les VMs en Ã©chec.
     */
    async getOrgVms(adminId: number) {
        const admin = await this.clientRepository.findOne({
            where: { id: adminId },
            relations: ['entreprise'],
        });

        if (!admin || !admin.entreprise) {
            throw new NotFoundException("Cet administrateur n'est rattaché à aucune entreprise.");
        }

        const entrepriseId = admin.entreprise.id;

        // RÃ©cupÃ©rer tous les membres de l'organisation (admin + users)
        const orgMembers = await this.clientRepository.find({
            where: {
                entreprise: { id: entrepriseId },
                role: In([RoleClient.ENTREPRISE_USER, RoleClient.ENTREPRISE_ADMIN]),
            },
        });

        if (!orgMembers.length) return [];

        const memberIds = orgMembers.map(m => m.id);

        // RÃ©cupÃ©rer toutes les VMs de ces membres
        const allVms = await this.vmRepo.find({
            where: { client: { id: In(memberIds) } },
            relations: ['catalogue', 'client'],
            order: { dateCreation: 'DESC' },
        });

        // Séparer les VMs actives des VMs en échec et des VMs en cours de provisionnement
        const activeVms = allVms.filter(vm => vm.status !== ServiceStatus.FAILED && vm.status !== ServiceStatus.PROVISIONING);
        const failedVms = allVms.filter(vm => vm.status === ServiceStatus.FAILED);

        // Nettoyer les VMs en échec (comme fait dans esxi.controller pour /my-vms)
        for (const f of failedVms) {
            try {
                await this.vmRepo.delete(f.id);
            } catch (err) {
                console.error(`Impossible de nettoyer la VM en échec #${f.id} :`, err.message);
            }
        }

        // Couleurs pour les propriétaires
        const COLORS = ['#1a56e8', '#7c3aed', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#9333ea'];
        const memberColorMap = new Map<number, string>();
        orgMembers.forEach((m, i) => memberColorMap.set(m.id, COLORS[i % COLORS.length]));

        // Synchroniser chaque VM avec l'ESXi pour obtenir le statut temps réel + métriques
        const results = (await Promise.all(activeVms.map(async (vm) => {
            const synced = await this.syncVmRuntimeStatus(vm);
            if (synced.status === ServiceStatus.PROVISIONING || synced.status === ServiceStatus.FAILED) {
                return null;
            }

            const owner = vm.client
                ? `${vm.client.prenom} ${vm.client.nom}`
                : 'Inconnu';

            const statusLabel = this.getStatusLabel(synced.status);
            const isRunning = synced.status === ServiceStatus.RUNNING;

            return {
                id: String(vm.id),
                realId: vm.id,
                name: vm.nomPersonnalise,
                type: 'vm' as const,
                owner,
                ownerId: vm.client?.id,
                ownerColor: vm.client ? (memberColorMap.get(vm.client.id) ?? '#94a3b8') : '#94a3b8',
                specs: vm.catalogue
                    ? `${vm.catalogue.vcpu ?? vm.vCPU} vCPU - ${vm.catalogue.ramMB ?? vm.ramGB} GB RAM - ${vm.catalogue.stockageGB ?? vm.stockageGB} GB SSD`
                    : `${vm.vCPU} vCPU - ${vm.ramGB} GB RAM - ${vm.stockageGB} GB SSD`,
                cost: Number(vm.prixMensuel || 0),
                status: synced.status,
                statusLabel,
                ip: vm.ipAddress || null,
                os: vm.os || 'Linux',
                cpu: isRunning ? ((synced as any).cpuUse ?? 0) : 0,
                ram: isRunning ? ((synced as any).ramUse ?? 0) : 0,
                storage: vm.stockageGB ?? (vm.catalogue?.stockageGB ?? null),
                dateCreation: vm.dateCreation ? new Date(vm.dateCreation).toISOString() : null,
            };
        }))).filter((r): r is NonNullable<typeof r> => r !== null);

        const paasServices = await this.paasRepo.find({
            where: { client: { id: In(memberIds) } },
            relations: ['catalogue', 'client'],
            order: { dateCreation: 'DESC' },
        });

        const activePaas = paasServices.filter(p => p.status !== ServiceStatus.FAILED && p.status !== ServiceStatus.PROVISIONING);
        const paasResults = await Promise.all(activePaas.map(async paas => {
            const owner = paas.client ? `${paas.client.prenom} ${paas.client.nom}` : 'Inconnu';
            let cpuUse: number | null = null;
            let ramUse: number | null = null;
            let storage: number | null = null;
            const isPaasRunning = paas.status === ServiceStatus.RUNNING;

            if (isPaasRunning) {
                try {
                    const metrics = await this.paasService.getContainerMetrics(paas.id);
                    if (metrics) {
                        cpuUse = parseFloat(metrics.cpuUsage) || 0;
                        ramUse = parseFloat(metrics.ramPercentage) || 0;
                        storage = metrics.usedStorageMb || 0;
                    }
                } catch (e) {
                    console.error('Erreur recup metrics pour paas', paas.id, e);
                }
            }

            return {
                id: `paas-${paas.id}`,
                realId: paas.id,
                name: paas.nomPersonnalise,
                type: 'db' as const,
                owner,
                ownerId: paas.client?.id,
                ownerColor: paas.client ? (memberColorMap.get(paas.client.id) ?? '#94a3b8') : '#94a3b8',
                specs: paas.catalogue
                    ? `${paas.typeSgbd || 'DB'} · ${paas.catalogue.vcpu} vCPU - ${paas.catalogue.ramMB} GB RAM - ${paas.catalogue.stockageGB} GB SSD`
                    : (paas.typeSgbd || 'POSTGRESQL'),
                cost: Number(paas.prixMensuel || 0),
                status: paas.status,
                statusLabel: this.getStatusLabel(paas.status),
                ip: paas.hostIp ? `${paas.hostIp}:${paas.port}` : null,
                connectionString: paas.connectionString,
                dbUser: paas.dbUser || 'root',
                dbPassword: paas.dbPassword,
                typeSgbd: paas.typeSgbd,
                hostIp: paas.hostIp,
                port: paas.port,
                cpu: isPaasRunning ? (cpuUse ?? 0) : 0,
                ram: isPaasRunning ? (ramUse ?? 0) : 0,
                storage: storage || (paas.catalogue?.stockageGB ? (paas.catalogue.stockageGB * 1024) : null),
                dateCreation: paas.dateCreation ? new Date(paas.dateCreation).toISOString() : null,
            };
        }));

        const saasServices = await this.saasRepo.find({
            where: { client: { id: In(memberIds) } },
            relations: ['catalogue', 'client'],
            order: { dateCreation: 'DESC' },
        });

        const activeSaas = saasServices.filter(s => s.status !== ServiceStatus.FAILED && s.status !== ServiceStatus.PROVISIONING);
        const saasResults = activeSaas.map(saas => {
            const owner = saas.client ? `${saas.client.prenom} ${saas.client.nom}` : 'Inconnu';
            return {
                id: `saas-${saas.id}`,
                realId: saas.id,
                name: saas.nomPersonnalise,
                type: 'saas' as const,
                owner,
                ownerId: saas.client?.id,
                ownerColor: saas.client ? (memberColorMap.get(saas.client.id) ?? '#94a3b8') : '#94a3b8',
                specs: saas.catalogue
                    ? `${saas.catalogue.nomService || 'SaaS'} · Managée`
                    : 'Application SaaS Managée',
                cost: Number(saas.prixMensuel || 0),
                status: saas.status,
                statusLabel: this.getStatusLabel(saas.status),
                ip: saas.connectionString || (saas.port ? `Port ${saas.port}` : null),
                url: saas.connectionString,
                connectionString: saas.connectionString,
                adminEmail: saas.ownerEmail,
                adminPassword: saas.ownerPassword,
                port: saas.port,
                cpu: null,
                ram: null,
                storage: null,
                dateCreation: saas.dateCreation ? new Date(saas.dateCreation).toISOString() : null,
            };
        });

        return [...results, ...paasResults, ...saasResults];
    }

    /**
     * Synchronise le statut d'une VM avec l'ESXi (rÃ©plique la logique de EsxiController.syncVmRuntimeStatus)
     */
    private async syncVmRuntimeStatus(vm: MachineVirtuelle): Promise<MachineVirtuelle> {
        if (vm.status === ServiceStatus.FAILED) {
            return vm;
        }

        try {
            const esxiName = `${vm.nomPersonnalise}-${vm.id}`;
            let runtime = await this.esxiService.getVmRuntime(
                vm.vmReference || vm.nomPersonnalise,
                esxiName,
            );

            if (!runtime) {
                // Fallback pour les anciennes VMs
                runtime = await this.esxiService.getVmRuntime(
                    vm.vmReference || vm.nomPersonnalise,
                    vm.nomPersonnalise,
                );
                if (!runtime) return vm;
            }

            return this.applyRuntimeUpdates(vm, runtime);
        } catch (err) {
            return vm;
        }
    }

    private async applyRuntimeUpdates(vm: MachineVirtuelle, runtime: any): Promise<MachineVirtuelle> {
        if (vm.status === ServiceStatus.AWAITING_PAYMENT) {
            return vm;
        }

        const runtimeStatus = this.mapPowerStateToStatus(runtime.state);
        const updates: Partial<MachineVirtuelle> = {};

        if (runtimeStatus && vm.status !== runtimeStatus) {
            updates.status = runtimeStatus;
            vm.status = runtimeStatus;
        }

        if ((!vm.vmReference || vm.vmReference.startsWith('task-')) && runtime.id) {
            updates.vmReference = runtime.id;
            vm.vmReference = runtime.id;
        }

        if (runtime.ipAddress && vm.ipAddress !== runtime.ipAddress) {
            updates.ipAddress = runtime.ipAddress;
            vm.ipAddress = runtime.ipAddress;
        }

        if (Object.keys(updates).length > 0) {
            await this.vmRepo.update(vm.id, updates);
        }

        const metrics = runtimeStatus === ServiceStatus.RUNNING
            ? await this.esxiService.getVmSummaryMetricsBySsh(runtime.id || vm.vmReference)
            : null;

        (vm as any).cpuUse = runtimeStatus === ServiceStatus.RUNNING ? (metrics?.cpuUse ?? null) : null;
        (vm as any).ramUse = runtimeStatus === ServiceStatus.RUNNING ? (metrics?.ramUse ?? null) : null;

        return vm;
    }

    private mapPowerStateToStatus(powerState: string): ServiceStatus | null {
        switch (powerState) {
            case 'poweredOn': return ServiceStatus.RUNNING;
            case 'poweredOff':
            case 'suspended': return ServiceStatus.STOPPED;
            default: return null;
        }
    }

    private getStatusLabel(status: ServiceStatus): string {
        const labels: Record<string, string> = {
            RUNNING: 'Running',
            STOPPED: 'Arrêtée',
            PROVISIONING: 'Provisionnement...',
            FAILED: 'Échec',
            AWAITING_PAYMENT: 'En attente paiement',
        };
        return labels[status] ?? status;
    }

    // ─── PREDICTION IA ────────────────────────────────────────────────────
    async getEntreprisePrediction(clientId: number) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear  = now.getFullYear();

        const revenusMensuels = new Array(12).fill(0);

        // Trouver le wallet de l'entreprise via le client (admin)
        const wallet = await this.walletRepo.findOne({
            where: { user: { id: clientId } },
        });

        if (!wallet) {
            return computePrediction(revenusMensuels, currentMonth);
        }

        // Agréger les transactions DEBIT par mois
        const transactions = await this.transactionRepo.find({
            where: { wallet: { id: wallet.id }, type: 'DEBIT' },
            order: { dateTransaction: 'ASC' },
        });

        for (const t of transactions) {
            const d = new Date(t.dateTransaction);
            if (d.getFullYear() === currentYear) {
                revenusMensuels[d.getMonth()] += Number(t.montant) || 0;
            }
        }

        return computePrediction(revenusMensuels, currentMonth);
    }
}






