import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'src/entities/client.entity';
import { AccountStatus } from 'src/enum/account-status.enum';
import { Admin } from 'src/entities/admin.entity';
import { Demande, DemandeStatus } from 'src/demande/entities/demande.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { Entreprise } from 'src/entities/entreprise.entity';
import { ServiceInstance } from 'src/entities/serviceInstance.entity';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { ServicePaaS } from 'src/entities/servicePaaS.entity';
import bcrypt from 'bcryptjs';

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(Client)
        private readonly clientRepo: Repository<Client>,
        private readonly mailerService: MailerService,
        @InjectRepository(Admin)
        private readonly adminRepository: Repository<Admin>,
        @InjectRepository(Demande)
        private readonly demandeRepository: Repository<Demande>,
        @InjectRepository(Catalogue)
        private readonly catalogueRepository: Repository<Catalogue>,
        @InjectRepository(Entreprise)
        private readonly entrepriseRepository: Repository<Entreprise>,
        @InjectRepository(ServiceInstance)
        private readonly serviceInstanceRepo: Repository<ServiceInstance>,
        @InjectRepository(MachineVirtuelle)
        private readonly vmRepo: Repository<MachineVirtuelle>,
        @InjectRepository(ServicePaaS)
        private readonly paasRepo: Repository<ServicePaaS>,
    ) { }

    async updateStatus(id: number, status: AccountStatus): Promise<Client> {
        const client = await this.clientRepo.findOne({ where: { id } });

        if (!client) {
            throw new NotFoundException('Client not found');
        }

        client.status = status;
        const updatedClient = await this.clientRepo.save(client);
        if (status === AccountStatus.APPROVED) {
            await this.mailerService.sendMail({
                to: client.email,
                subject: 'Bienvenue chez Dynamix ! Votre compte est activé 🎉',
                html: `
          <h3>Félicitations !</h3>
          <p>Votre compte a été approuvé par notre équipe. Vous pouvez désormais vous connecter.</p>
        `,
            }).catch(err => console.error('Erreur email:', err));
        }
        else if (status === AccountStatus.REJECTED) {
            await this.mailerService.sendMail({
                to: client.email,
                subject: 'Information concernant votre compte Dynamix',
                html: `
          <h3>Bonjour,</h3>
          <p>Malheureusement, votre demande de création de compte a été refusée pour le moment.</p>
        `,
            }).catch(err => console.error('Erreur email:', err));
        }
        else if (status === AccountStatus.SUSPENDED) {
            await this.mailerService.sendMail({
                to: client.email,
                subject: "Suspension de votre compte",
                html: `
                <h3>Bonjour,</h3>
                <p>Malheureusement, votre compte a été suspendu pour le moment.</p>
                `
            }).catch(err => console.error('Erreur email:', err));
        }
        return updatedClient;
    }

    async findAll() {
        return this.clientRepo.find({
            relations: ['entreprise'],
        });
    }

    async getProfile(adminId: number) {
        return this.adminRepository.findOne({ where: { id: adminId } });
    }

    async updateProfile(adminId: number, updateData: Partial<Admin>) {
        const admin = await this.adminRepository.findOne({ where: { id: adminId } });
        if (!admin) throw new NotFoundException('Admin non trouvé');
        if (updateData.nom) admin.nom = updateData.nom;
        if (updateData.prenom) admin.prenom = updateData.prenom;
        if (updateData.email) admin.email = updateData.email;
        return this.adminRepository.save(admin);
    }

    async updatePassword(userId: number, dto: any) {
        const user = await this.adminRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Utilisateur introuvable');

        if (!dto.oldPassword || !user.password) {
            throw new BadRequestException('Données de mot de passe manquantes');
        }

        const isMatch = await bcrypt.compare(dto.oldPassword, user.password);

        if (!isMatch) {
            throw new BadRequestException('L\'ancien mot de passe est incorrect');
        }

        user.password = await bcrypt.hash(dto.newPassword, 10);

        await this.clientRepo.save(user);

        return { message: 'Mot de passe mis à jour' };
    }

    async getGlobalBilling() {
        const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

        // Pre-load all catalogues so we can resolve names for personal VM instances
        const allCatalogues = await this.catalogueRepository.find();
        const catalogueMap = new Map<number, string>(allCatalogues.map(c => [c.id, c.nomService]));

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let revenuMoisActuel = 0;
        let revenuMoisPrecedent = 0;
        let revenuAnnuel = 0;
        const revenusMensuels = new Array(12).fill(0);

        // ─── 1. FACTURES ENTREPRISES via Demande ───────────────────────────────
        const demandes = await this.demandeRepository.find({
            where: { status: DemandeStatus.APPROUVEE },
            relations: ['catalogue', 'client', 'client.entreprise', 'client.wallet'],
        });

        const invoicesMap = new Map<string, any>();

        for (const d of demandes) {
            if (!d.catalogue || !d.client) continue;
            const price = Number(d.catalogue.prix);
            const dDate = new Date(d.dateDemande);

            if (dDate.getFullYear() === currentYear) {
                revenuAnnuel += price;
                revenusMensuels[dDate.getMonth()] += price;
                if (dDate.getMonth() === currentMonth) revenuMoisActuel += price;
                else if (
                    dDate.getMonth() === currentMonth - 1 ||
                    (currentMonth === 0 && dDate.getMonth() === 11)
                ) revenuMoisPrecedent += price;
            }

            const monthStr = dDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
            const period = monthStr.charAt(0).toUpperCase() + monthStr.slice(1);
            const isEnterprise = d.client.role === 'ENTREPRISE_ADMIN' || d.client.role === 'ENTREPRISE_USER';
            const clientId = isEnterprise && d.client.entreprise
                ? `ent-${d.client.entreprise.id}`
                : `pers-${d.client.id}`;
            const key = `${clientId}-${period}`;

            if (!invoicesMap.has(key)) {
                invoicesMap.set(key, {
                    id: key,
                    clientType: 'entreprise',
                    client: isEnterprise && d.client.entreprise
                        ? d.client.entreprise.nomEntreprise
                        : `${d.client.prenom} ${d.client.nom}`,
                    email: isEnterprise ? d.client.email : d.client.email,
                    period,
                    vmCount: 0,
                    serviceCount: 0,
                    amount: 0,
                    paid: true,
                    transactions: [],
                });
            }

            const inv = invoicesMap.get(key);
            const typeService = d.catalogue.typeService ?? 'IAAS';
            if (typeService === 'PAAS') inv.serviceCount += 1;
            else inv.vmCount += 1;
            inv.amount += price;
            inv.transactions.push({
                name: d.nomInstanceSouhaite || d.catalogue.nomService,
                catalogName: d.catalogue.nomService,
                typeService,
                price,
                status: 'active',
                date: dDate.toISOString(),
            });
        }

        const personalInstances = await this.serviceInstanceRepo.find({
            where: { client: { role: 'PERSONNEL' } as any },
            relations: ['client', 'client.wallet'],
        });

        for (const inst of personalInstances) {
            if (!inst.client) continue;
            const price = Number(inst.prixMensuel) || 0;
            const dDate = new Date(inst.dateCreation);

            if (dDate.getFullYear() === currentYear) {
                revenuAnnuel += price;
                revenusMensuels[dDate.getMonth()] += price;
                if (dDate.getMonth() === currentMonth) revenuMoisActuel += price;
                else if (
                    dDate.getMonth() === currentMonth - 1 ||
                    (currentMonth === 0 && dDate.getMonth() === 11)
                ) revenuMoisPrecedent += price;
            }

            const monthStr = dDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
            const period = monthStr.charAt(0).toUpperCase() + monthStr.slice(1);
            const key = `pers-${inst.client.id}-${period}`;

            if (!invoicesMap.has(key)) {
                invoicesMap.set(key, {
                    id: key,
                    clientType: 'personnel',
                    client: `${inst.client.prenom} ${inst.client.nom}`,
                    email: inst.client.email,
                    period,
                    vmCount: 0,
                    serviceCount: 0,
                    amount: 0,
                    paid: inst.client.wallet ? Number(inst.client.wallet.solde) >= 0 : true,
                    transactions: [],
                });
            }

            const inv = invoicesMap.get(key);
            // TypeORM STI: MachineVirtuelle instances have `vCPU` column; PaaS instances do not
            const isVm = (inst as any).vCPU !== undefined;
            if (isVm) inv.vmCount += 1;
            else inv.serviceCount += 1;
            inv.amount += price;
            // Resolve catalogue name via the pre-loaded Map using the FK stored on the instance
            const catalogueId = (inst as any).catalogueId ?? null;
            const catalogName = catalogueId ? (catalogueMap.get(catalogueId) ?? null) : null;
            inv.transactions.push({
                name: inst.nomPersonnalise,
                catalogName,
                typeService: isVm ? 'IAAS' : 'PAAS',
                price,
                status: inst.status,
                date: dDate.toISOString(),
            });
        }

        // ─── 3. BUILD RESPONSE ─────────────────────────────────────────────────
        const growthPct = revenuMoisPrecedent === 0
            ? 100
            : Math.round(((revenuMoisActuel - revenuMoisPrecedent) / revenuMoisPrecedent) * 100);

        const billingInvoices = Array.from(invoicesMap.values()).map(inv => ({
            id: inv.id,
            clientType: inv.clientType,
            client: inv.client,
            email: inv.email,
            period: inv.period,
            vmCount: inv.vmCount,
            serviceCount: inv.serviceCount,
            resources: [
                inv.vmCount > 0 ? `${inv.vmCount} VM${inv.vmCount > 1 ? 's' : ''}` : null,
                inv.serviceCount > 0 ? `${inv.serviceCount} Service${inv.serviceCount > 1 ? 's' : ''}` : null,
            ].filter(Boolean).join(' · ') || '—',
            amount: `${inv.amount.toFixed(2)} DT`,
            paid: inv.paid,
            transactions: inv.transactions,
        }));

        billingInvoices.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

        const facturesEmises = billingInvoices.length;
        const facturesEnAttente = billingInvoices.filter(i => !i.paid).length;
        const facturesPayees = facturesEmises - facturesEnAttente;
        const nbPersonnels = billingInvoices.filter(i => i.clientType === 'personnel').length;
        const nbEntreprises = billingInvoices.filter(i => i.clientType === 'entreprise').length;

        const maxRevenuMensuel = Math.max(...revenusMensuels.slice(0, currentMonth + 1), 1);
        const revenueChart = revenusMensuels.map((val, index) => ({
            label: monthNames[index],
            pct: Math.round((val / maxRevenuMensuel) * 100),
            val,
        })).slice(0, currentMonth + 1);

        const pricingRules = allCatalogues.map(c => ({
            label: `${c.vcpu} vCPU, ${c.ramMB} GB RAM, ${c.stockageGB} GB SSD`,
            price: `${Number(c.prix).toFixed(3)} DT/mois`,
        }));

        const monthNameActuel = monthNames[currentMonth].toLowerCase();

        return {
            billingStats: [
                { label: `Revenus ${monthNameActuel}`, val: `${revenuMoisActuel.toFixed(0)} DT`, sub: `${growthPct >= 0 ? '+' : ''}${growthPct}% vs mois préc.`, bg: 'var(--green-light)', color: 'var(--green)' },
                { label: 'Factures émises', val: `${facturesEmises}`, sub: `${facturesPayees} payées`, bg: 'var(--blue-light)', color: 'var(--blue)' },
                { label: 'Clients entreprise', val: `${nbEntreprises}`, sub: `${nbPersonnels} particuliers`, bg: 'var(--amber-light)', color: 'var(--amber)' },
                { label: 'Revenu annuel', val: `${revenuAnnuel.toFixed(0)} DT`, sub: `Année ${currentYear}`, bg: 'var(--purple-light)', color: 'var(--purple)' },
            ],
            billingInvoices,
            revenueChart,
            pricingRules,
            currentMonthTotal: {
                label: `Total ${monthNameActuel} ${currentYear}`,
                val: `${revenuMoisActuel.toFixed(0)} DT`,
            },
        };
    }

    async getMonitoringData() {
        // 1. Fetch all VMs with client and catalogue info
        const allVms = await this.vmRepo.find({
            relations: ['client', 'client.entreprise', 'catalogue'],
            order: { dateCreation: 'DESC' },
        });

        // Filter out templates and failed VMs
        const deployedVms = allVms.filter(vm =>
            !vm.nomPersonnalise.toLowerCase().startsWith('template') &&
            vm.status !== 'FAILED'
        );

        const vms = deployedVms.map(vm => {
            const client = vm.client;
            let owner = 'Inconnu';
            if (client) {
                if (client.entreprise) {
                    owner = client.entreprise.nomEntreprise;
                } else {
                    owner = `${client.prenom} ${client.nom}`;
                }
            }
            return {
                id: vm.id,
                name: vm.nomPersonnalise,
                owner,
                ownerEmail: client?.email ?? '',
                cpu: vm.vCPU,
                ram: vm.ramGB,
                storage: vm.stockageGB,
                os: vm.os ?? 'N/A',
                ip: vm.ipAddress ?? null,
                status: vm.status,
                dateCreation: vm.dateCreation,
                catalogueName: vm.catalogue?.nomService ?? null,
            };
        });

        // 2. Fetch all PaaS instances with client and catalogue info
        const allPaas = await this.paasRepo.find({
            relations: ['client', 'client.entreprise', 'catalogue'],
            order: { dateCreation: 'DESC' },
        });

        const containers = allPaas.map(p => {
            const client = p.client;
            let owner = 'Inconnu';
            if (client) {
                if (client.entreprise) {
                    owner = client.entreprise.nomEntreprise;
                } else {
                    owner = `${client.prenom} ${client.nom}`;
                }
            }
            return {
                id: p.id,
                name: p.nomPersonnalise,
                containerName: `db_${p.nomPersonnalise.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${p.port}`,
                typeSgbd: p.typeSgbd,
                owner,
                ownerEmail: client?.email ?? '',
                hostIp: p.hostIp,
                port: p.port,
                status: p.status,
                dateCreation: p.dateCreation,
                catalogueName: p.catalogue?.nomService ?? null,
                ramMB: p.catalogue?.ramMB ?? 0,
                stockageGB: p.catalogue?.stockageGB ?? 0,
            };
        });

        // 3. Counts
        const activeVms = vms.filter(v => v.status === 'RUNNING').length;
        const activeContainers = containers.filter(c => c.status === 'RUNNING').length;

        return {
            vms,
            containers,
            summary: {
                totalVms: vms.length,
                activeVms,
                totalContainers: containers.length,
                activeContainers,
            },
        };
    }
}