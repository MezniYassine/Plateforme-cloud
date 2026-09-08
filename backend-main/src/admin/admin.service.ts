import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef, Optional } from '@nestjs/common';
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
import { ServiceSaaS } from 'src/entities/serviceSaaS.entity';
import { ServiceStatus } from 'src/enum/service-status.enum';
import { EsxiService } from 'src/esxi/esxi.service';
import bcrypt from 'bcryptjs';
import { computePrediction } from 'src/common/prediction.util';

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
        @InjectRepository(ServiceSaaS)
        private readonly saasRepo: Repository<ServiceSaaS>,
        @Optional()
        @Inject(forwardRef(() => EsxiService))
        private readonly esxiService?: EsxiService,
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
                subject: 'Bienvenue sur Dyna-Cloud ! Votre compte est activé',
                html: `
          <h3>Félicitations !</h3>
          <p>Votre compte a été approuvé par notre équipe. Vous pouvez désormais vous connecter.</p>
        `,
            }).catch(err => console.error('Erreur email:', err));
        }
        else if (status === AccountStatus.REJECTED) {
            await this.mailerService.sendMail({
                to: client.email,
                subject: 'Information concernant votre compte Dyna-Cloud',
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

        const billingInvoices: any[] = [];

        // ─── 1. FACTURES ENTREPRISES via Demande ───────────────────────────────
        const demandes = await this.demandeRepository.find({
            where: { status: DemandeStatus.APPROUVEE },
            relations: ['catalogue', 'client', 'client.entreprise', 'client.wallet'],
            order: { dateDemande: 'DESC' },
        });

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
            const clientName = isEnterprise && d.client.entreprise
                ? d.client.entreprise.nomEntreprise
                : `${d.client.prenom} ${d.client.nom}`;
            const typeService = (d.catalogue.typeService ?? 'IAAS') as 'IAAS' | 'PAAS' | 'SAAS';
            const resourceName = d.nomInstanceSouhaite || d.catalogue.nomService;
            const refFacture = d.referenceFacture || `FAC-${dDate.getFullYear()}-${String(d.id).padStart(5, '0')}`;

            billingInvoices.push({
                id: `demande-${d.id}`,
                ref: refFacture,
                clientType: isEnterprise ? 'entreprise' : 'personnel',
                client: clientName,
                email: d.client.email,
                date: dDate.toISOString(),
                period,
                resourceName,
                catalogName: d.catalogue.nomService,
                typeService,
                amount: `${price.toFixed(2)} DT`,
                price,
                paid: true,
                status: 'active',
                transactions: [{
                    ref: refFacture,
                    name: resourceName,
                    catalogName: d.catalogue.nomService,
                    typeService,
                    price,
                    status: 'active',
                    date: dDate.toISOString(),
                }],
            });
        }

        // ─── 2. FACTURES VIA SERVICE INSTANCES ─────────────────────────────────
        const personalInstances = await this.serviceInstanceRepo.find({
            where: { status: ServiceStatus.RUNNING } as any,
            relations: ['client', 'client.entreprise', 'client.wallet', 'catalogue'],
            order: { dateCreation: 'DESC' },
        });

        // Also fetch all deployed instances regardless of role to compute total active consumption
        const allActiveInstances = await this.serviceInstanceRepo.find({
            relations: ['client', 'client.entreprise', 'client.wallet', 'catalogue'],
        });

        let totalActiveWorkloadMonthly = 0;
        for (const inst of allActiveInstances) {
            const p = Number(inst.prixMensuel) || (inst.catalogue ? Number(inst.catalogue.prix) : 0) || 0;
            if (inst.status !== ServiceStatus.FAILED && (inst.status as any) !== 'TERMINATED') {
                totalActiveWorkloadMonthly += p;
            }
        }

        for (const inst of personalInstances) {
            if (!inst.client) continue;
            const price = Number(inst.prixMensuel) || (inst.catalogue ? Number(inst.catalogue.prix) : 0) || 0;
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
            const isEnterprise = inst.client.role === 'ENTREPRISE_ADMIN' || inst.client.role === 'ENTREPRISE_USER';
            const clientName = isEnterprise && inst.client.entreprise
                ? inst.client.entreprise.nomEntreprise
                : `${inst.client.prenom} ${inst.client.nom}`;
            const isVm = (inst as any).vCPU !== undefined;
            const catalogueId = (inst as any).catalogueId ?? (inst.catalogue ? inst.catalogue.id : null);
            const catalogName = inst.catalogue?.nomService || (catalogueId ? (catalogueMap.get(catalogueId) ?? null) : null);
            const resourceName = inst.nomPersonnalise || catalogName || (isVm ? 'Machine Virtuelle' : 'Service PaaS');
            const refFacture = (inst as any).referenceFacture || `FAC-${dDate.getFullYear()}-${String(inst.id).padStart(5, '0')}`;
            const isPaid = inst.client.wallet ? Number(inst.client.wallet.solde) >= 0 : true;

            billingInvoices.push({
                id: `inst-${inst.id}`,
                ref: refFacture,
                clientType: isEnterprise ? 'entreprise' : 'personnel',
                client: clientName,
                email: inst.client.email,
                date: dDate.toISOString(),
                period,
                resourceName,
                catalogName,
                typeService: isVm ? 'IAAS' : 'PAAS',
                amount: `${price.toFixed(2)} DT`,
                price,
                paid: isPaid,
                status: inst.status,
                transactions: [{
                    ref: refFacture,
                    name: resourceName,
                    catalogName,
                    typeService: isVm ? 'IAAS' : 'PAAS',
                    price,
                    status: inst.status,
                    date: dDate.toISOString(),
                }],
            });
        }

        // ─── 3. BUILD RESPONSE ─────────────────────────────────────────────────
        const effectiveMonthRevenue = revenuMoisActuel > 0 ? revenuMoisActuel : totalActiveWorkloadMonthly;
        const effectiveYearRevenue = revenuAnnuel > 0 ? revenuAnnuel : (effectiveMonthRevenue * (currentMonth + 1));
        const growthPct = revenuMoisPrecedent === 0
            ? (effectiveMonthRevenue > 0 ? 100 : 0)
            : Math.round(((effectiveMonthRevenue - revenuMoisPrecedent) / revenuMoisPrecedent) * 100);

        // Sort all invoices chronologically (most recent first)
        billingInvoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const facturesEmises = billingInvoices.length;
        const facturesEnAttente = billingInvoices.filter(i => !i.paid).length;
        const facturesPayees = facturesEmises - facturesEnAttente;
        const uniqueEntreprises = new Set(billingInvoices.filter(i => i.clientType === 'entreprise').map(i => i.email || i.client));
        const uniquePersonnels = new Set(billingInvoices.filter(i => i.clientType === 'personnel').map(i => i.email || i.client));
        const nbPersonnels = uniquePersonnels.size;
        const nbEntreprises = uniqueEntreprises.size;

        const maxRevenuMensuel = Math.max(...revenusMensuels.slice(0, currentMonth + 1), effectiveMonthRevenue, 1);
        const revenueChart = revenusMensuels.map((val, index) => ({
            label: monthNames[index],
            pct: Math.round(((index === currentMonth ? effectiveMonthRevenue : val) / maxRevenuMensuel) * 100),
            val: index === currentMonth ? effectiveMonthRevenue : val,
        })).slice(0, currentMonth + 1);

        const pricingRules = allCatalogues.map(c => ({
            label: `${c.vcpu} vCPU, ${c.ramMB} GB RAM, ${c.stockageGB} GB SSD`,
            price: `${Number(c.prix).toFixed(3)} DT/mois`,
        }));

        const monthNameActuel = monthNames[currentMonth].toLowerCase();

        return {
            billingStats: [
                { label: `Revenus ${monthNameActuel}`, val: `${effectiveMonthRevenue.toFixed(2)} DT`, sub: `${growthPct >= 0 ? '+' : ''}${growthPct}% vs mois préc.`, bg: 'var(--green-light)', color: 'var(--green)' },
                { label: 'Factures émises', val: `${facturesEmises}`, sub: `${facturesPayees} payées`, bg: 'var(--blue-light)', color: 'var(--blue)' },
                { label: 'Clients entreprise', val: `${nbEntreprises}`, sub: `${nbPersonnels} particuliers`, bg: 'var(--amber-light)', color: 'var(--amber)' },
                { label: 'Revenu annuel', val: `${effectiveYearRevenue.toFixed(2)} DT`, sub: `Année ${currentYear}`, bg: 'var(--purple-light)', color: 'var(--purple)' },
            ],
            billingInvoices,
            revenueChart,
            pricingRules,
            currentMonthTotal: {
                label: `Total ${monthNameActuel} ${currentYear}`,
                val: `${effectiveMonthRevenue.toFixed(2)} DT`,
            },
            monthlyActiveConsumption: totalActiveWorkloadMonthly,
            revenuMoisActuel: effectiveMonthRevenue,
            revenuMoisPrecedent,
            revenuAnnuel: effectiveYearRevenue,
            growthPct,
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

        let esxiVms: any[] = [];
        try {
            if (this.esxiService) {
                esxiVms = await this.esxiService.getVms();
            }
        } catch (e) {
            // fallback gracefully
        }

        const vms = await Promise.all(deployedVms.map(async vm => {
            const client = vm.client;
            let owner = 'Inconnu';
            if (client) {
                if (client.entreprise) {
                    owner = client.entreprise.nomEntreprise;
                } else {
                    owner = `${client.prenom} ${client.nom}`;
                }
            }

            // Match with ESXi VM
            const matchedEsxi = esxiVms.find(ev =>
                ev.name === `${vm.nomPersonnalise}-${vm.id}` ||
                ev.name === vm.nomPersonnalise ||
                (ev.id && ev.id === vm.vmReference)
            );

            let status = vm.status;
            let ip = vm.ipAddress ?? null;
            if (matchedEsxi) {
                if (matchedEsxi.state === 'poweredOn') {
                    status = ServiceStatus.RUNNING;
                } else if (matchedEsxi.state === 'poweredOff') {
                    status = ServiceStatus.STOPPED;
                }
                if (matchedEsxi.ip && !ip) {
                    ip = matchedEsxi.ip;
                }
            }

            let cpuUse = (vm as any).cpuUse ?? null;
            let ramUse = (vm as any).ramUse ?? null;
            let cpuUsageMhz = (vm as any).cpuUsageMhz ?? null;
            let ramUsageMb = (vm as any).ramUsageMb ?? null;

            // If VM is running and we have ESXi service, get live summary metrics
            if (status === ServiceStatus.RUNNING && this.esxiService && (matchedEsxi?.id || vm.vmReference)) {
                try {
                    const metrics = await this.esxiService.getVmSummaryMetricsBySsh(matchedEsxi?.id || vm.vmReference);
                    if (metrics) {
                        cpuUse = metrics.cpuUse ?? cpuUse;
                        ramUse = metrics.ramUse ?? ramUse;
                        cpuUsageMhz = metrics.cpuUsageMhz ?? cpuUsageMhz;
                        ramUsageMb = metrics.ramUsageMb ?? ramUsageMb;
                    }
                } catch (err) {
                    // ignore
                }
            }

            // Fallback base values for active running VMs if no live probe yet
            if (status === ServiceStatus.RUNNING && cpuUse === null) {
                cpuUse = 5.2;
                ramUse = Math.round((256 / ((vm.ramGB || 1) * 1024)) * 100);
                ramUsageMb = 256;
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
                ip,
                status,
                dateCreation: vm.dateCreation,
                catalogueName: vm.catalogue?.nomService ?? null,
                runtimeState: matchedEsxi?.state ?? (status === ServiceStatus.RUNNING ? 'poweredOn' : 'poweredOff'),
                cpuUse,
                ramUse,
                cpuUsageMhz,
                ramUsageMb,
            };
        }));

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

        // 3. Fetch all SaaS instances with client and catalogue info
        const allSaas = await this.saasRepo.find({
            relations: ['client', 'client.entreprise', 'catalogue'],
            order: { dateCreation: 'DESC' },
        });

        const saasApps = allSaas.map(s => {
            const client = s.client;
            let owner = 'Inconnu';
            if (client) {
                if (client.entreprise) {
                    owner = client.entreprise.nomEntreprise;
                } else {
                    owner = `${client.prenom} ${client.nom}`;
                }
            }
            return {
                id: s.id,
                name: s.nomPersonnalise,
                appName: s.catalogue?.nomService ?? 'Application SaaS',
                owner,
                ownerEmail: client?.email ?? '',
                url: s.connectionString || '—',
                status: s.status,
                dateCreation: s.dateCreation,
                catalogueName: s.catalogue?.nomService ?? null,
            };
        });

        // 4. Counts
        const activeVms = vms.filter(v => v.status === 'RUNNING').length;
        const activeContainers = containers.filter(c => c.status === 'RUNNING').length;
        const activeSaas = saasApps.filter(s => s.status === 'RUNNING').length;

        return {
            vms,
            containers,
            saasApps,
            summary: {
                totalVms: vms.length,
                activeVms,
                totalContainers: containers.length,
                activeContainers,
                totalSaas: saasApps.length,
                activeSaas,
            },
        };
    }

    // ─── PREDICTION IA ────────────────────────────────────────────────────
    async getPrediction() {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const revenusMensuels = new Array(12).fill(0);

        // Agréger les demandes approuvées par mois
        const demandes = await this.demandeRepository.find({
            where: { status: DemandeStatus.APPROUVEE },
            relations: ['catalogue'],
        });
        for (const d of demandes) {
            const dDate = new Date(d.dateDemande);
            if (dDate.getFullYear() === currentYear && d.catalogue) {
                revenusMensuels[dDate.getMonth()] += Number(d.catalogue.prix) || 0;
            }
        }

        // Agréger les instances personnelles actives par mois
        const instances = await this.serviceInstanceRepo.find({
            relations: ['catalogue'],
        });
        for (const inst of instances) {
            const dDate = new Date(inst.dateCreation);
            if (dDate.getFullYear() === currentYear) {
                const price = Number(inst.prixMensuel) || (inst.catalogue ? Number(inst.catalogue.prix) : 0) || 0;
                revenusMensuels[dDate.getMonth()] += price;
            }
        }

        return computePrediction(revenusMensuels, currentMonth);
    }
}