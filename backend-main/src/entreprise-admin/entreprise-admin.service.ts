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
            subject: 'Bienvenue chez Dynamix - Activez votre compte',
            html: `
                <h3>Bienvenue chez Dynamix</h3>
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
                take: 100,
            })
            : [];

        const approvedDemandes = await this.demandeRepository
            .createQueryBuilder('demande')
            .leftJoinAndSelect('demande.client', 'client')
            .leftJoinAndSelect('demande.catalogue', 'catalogue')
            .leftJoin('client.entreprise', 'entreprise')
            .where('entreprise.id = :entrepriseId', { entrepriseId: admin.entreprise.id })
            .andWhere('demande.status = :status', { status: DemandeStatus.APPROUVEE })
            .orderBy('demande.dateDemande', 'DESC')
            .getMany();

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        let debitThisMonth = approvedDemandes
            .filter((demande) => new Date(demande.dateDemande) >= startOfMonth)
            .reduce((sum, demande) => sum + Number(demande.prixMensuel || 0), 0);
        const creditTotal = walletTransactions
            .filter((transaction) => transaction.type === 'CREDIT')
            .reduce((sum, transaction) => sum + Number(transaction.montant), 0);

        const spendByMember = new Map<number, number>();
        approvedDemandes
            .filter((demande) => new Date(demande.dateDemande) >= startOfMonth)
            .forEach((demande) => {
                const userId = demande.client?.id;
                if (!userId) return;
                spendByMember.set(userId, (spendByMember.get(userId) ?? 0) + Number(demande.prixMensuel || 0));
            });

        const COLORS = ['#1a56e8', '#7c3aed', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#9333ea'];

        const demandeTransactions = approvedDemandes.map((demande) => {
            const dDate = new Date(demande.dateDemande || Date.now());
            const refFacture = demande.referenceFacture || `FAC-${dDate.getFullYear()}-${String(demande.id).padStart(5, '0')}`;
            
            // Sauvegarder la référence de facture en BD si manquante
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

        const otherTransactions = walletTransactions
            .filter((transaction) => transaction.type === 'CREDIT' || transaction.description.includes('Mise à niveau'))
            .map((transaction) => {
                let memberName = transaction.wallet?.user ? `${transaction.wallet.user.prenom} ${transaction.wallet.user.nom}` : 'Entreprise';
                let desc = transaction.description;

                if (transaction.type === 'DEBIT' && desc.includes(' par ')) {
                    const parts = desc.split(' par ');
                    memberName = parts.pop() || memberName;
                    desc = parts.join(' par ');
                }

                if (transaction.type === 'CREDIT') {
                    desc = `Recharge du portefeuille`;
                }

                const tDate = new Date(transaction.dateTransaction || Date.now());
                const refFacture = transaction.reference || `FAC-${tDate.getFullYear()}-TR${String(transaction.id).padStart(4, '0')}`;

                return {
                    id: `wallet-${transaction.id}`,
                    refFacture: refFacture,
                    desc: desc,
                    catalogName: transaction.type === 'CREDIT' ? 'Recharge Solde' : 'Mise à niveau',
                    typeService: transaction.type === 'CREDIT' ? 'WALLET' : 'UPGRADE',
                    catalogue: null,
                    memberName: memberName,
                    date: tDate.toISOString(),
                    type: transaction.type.toLowerCase() as 'credit' | 'debit',
                    amount: Number(transaction.montant),
                };
            });

        otherTransactions.forEach(t => {
            if (t.type === 'debit' && new Date(t.date) >= startOfMonth) {
                debitThisMonth += t.amount;
            }
        });

        const transactions = [...demandeTransactions, ...otherTransactions]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 100);

        // EXCLURE L'ADMIN ENTREPRISE de la liste de consommation par membre
        const enterpriseUsersOnly = orgMembers.filter((m) => m.role === RoleClient.ENTREPRISE_USER);

        return {
            solde: Number(adminWallet.solde),
            devise: adminWallet.devise,
            depenseMois: Math.round(debitThisMonth * 1000) / 1000,
            totalRecharge: Math.round(creditTotal * 1000) / 1000,
            teamSpend: enterpriseUsersOnly.map((member, index) => {
                const memberName = `${member.prenom} ${member.nom}`;
                let spend = Number(spendByMember.get(member.id) ?? 0);
                
                otherTransactions.forEach(t => {
                    if (t.type === 'debit' && t.memberName === memberName && new Date(t.date) >= startOfMonth) {
                        spend += t.amount;
                    }
                });

                return {
                    name: memberName,
                    spend: Math.round(spend * 1000) / 1000,
                    color: COLORS[index % COLORS.length],
                };
            }),
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

        // SÃ©parer les VMs actives des VMs en Ã©chec
        const activeVms = allVms.filter(vm => vm.status !== ServiceStatus.FAILED);
        const failedVms = allVms.filter(vm => vm.status === ServiceStatus.FAILED);

        // Nettoyer les VMs en Ã©chec (comme fait dans esxi.controller pour /my-vms)
        for (const f of failedVms) {
            try {
                await this.vmRepo.delete(f.id);
            } catch (err) {
                console.error(`Impossible de nettoyer la VM en échec #${f.id} :`, err.message);
            }
        }

        // Couleurs pour les propriÃ©taires
        const COLORS = ['#1a56e8', '#7c3aed', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#9333ea'];
        const memberColorMap = new Map<number, string>();
        orgMembers.forEach((m, i) => memberColorMap.set(m.id, COLORS[i % COLORS.length]));

        // Synchroniser chaque VM avec l'ESXi pour obtenir le statut temps réel + métriques
        const results = await Promise.all(activeVms.map(async (vm) => {
            const synced = await this.syncVmRuntimeStatus(vm);
            const owner = vm.client
                ? `${vm.client.prenom} ${vm.client.nom}`
                : 'Inconnu';

            const statusLabel = this.getStatusLabel(synced.status);
            const isRunning = synced.status === ServiceStatus.RUNNING;

            return {
                id: String(vm.id),
                name: vm.nomPersonnalise,
                type: 'vm' as const,
                owner,
                ownerColor: vm.client ? (memberColorMap.get(vm.client.id) ?? '#94a3b8') : '#94a3b8',
                specs: vm.catalogue
                    ? `${vm.catalogue.vcpu ?? vm.vCPU} vCPU - ${vm.catalogue.ramMB ?? vm.ramGB} GB RAM - ${vm.catalogue.stockageGB ?? vm.stockageGB} GB SSD`
                    : `${vm.vCPU} vCPU - ${vm.ramGB} GB RAM - ${vm.stockageGB} GB SSD`,
                cost: Number(vm.prixMensuel || 0),
                status: synced.status,
                statusLabel,
                ip: vm.ipAddress || null,
                cpu: isRunning ? ((synced as any).cpuUse ?? 0) : 0,
                ram: isRunning ? ((synced as any).ramUse ?? 0) : 0,
                storage: vm.stockageGB ?? (vm.catalogue?.stockageGB ?? null),
            };
        }));

        const paasServices = await this.paasRepo.find({
            where: { client: { id: In(memberIds) } },
            relations: ['catalogue', 'client'],
            order: { dateCreation: 'DESC' },
        });

        const activePaas = paasServices.filter(p => p.status !== ServiceStatus.FAILED);
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
                name: paas.nomPersonnalise,
                type: 'db' as const,
                owner,
                ownerColor: paas.client ? (memberColorMap.get(paas.client.id) ?? '#94a3b8') : '#94a3b8',
                specs: paas.catalogue
                    ? `${paas.typeSgbd || 'DB'} · ${paas.catalogue.vcpu} vCPU - ${paas.catalogue.ramMB} GB RAM - ${paas.catalogue.stockageGB} GB SSD`
                    : (paas.typeSgbd || 'POSTGRESQL'),
                cost: Number(paas.prixMensuel || 0),
                status: paas.status,
                statusLabel: this.getStatusLabel(paas.status),
                ip: paas.hostIp ? `${paas.hostIp}:${paas.port}` : null,
                cpu: isPaasRunning ? (cpuUse ?? 0) : 0,
                ram: isPaasRunning ? (ramUse ?? 0) : 0,
                storage: storage || (paas.catalogue?.stockageGB ? (paas.catalogue.stockageGB * 1024) : null),
            };
        }));

        const saasServices = await this.saasRepo.find({
            where: { client: { id: In(memberIds) } },
            relations: ['catalogue', 'client'],
            order: { dateCreation: 'DESC' },
        });

        const activeSaas = saasServices.filter(s => s.status !== ServiceStatus.FAILED);
        const saasResults = activeSaas.map(saas => {
            const owner = saas.client ? `${saas.client.prenom} ${saas.client.nom}` : 'Inconnu';
            return {
                id: `saas-${saas.id}`,
                name: saas.nomPersonnalise,
                type: 'saas' as const,
                owner,
                ownerColor: saas.client ? (memberColorMap.get(saas.client.id) ?? '#94a3b8') : '#94a3b8',
                specs: saas.catalogue
                    ? `${saas.catalogue.nomService || 'SaaS'} · Managée`
                    : 'Application SaaS Managée',
                cost: Number(saas.prixMensuel || 0),
                status: saas.status,
                statusLabel: this.getStatusLabel(saas.status),
                ip: saas.connectionString || (saas.port ? `Port ${saas.port}` : null),
                cpu: null,
                ram: null,
                storage: null,
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
}





