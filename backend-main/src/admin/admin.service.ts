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
        const demandes = await this.demandeRepository.find({
            where: { status: DemandeStatus.APPROUVEE },
            relations: ['catalogue', 'client', 'client.entreprise', 'client.wallet']
        });

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let revenuMoisActuel = 0;
        let revenuMoisPrecedent = 0;
        let revenuAnnuel = 0;

        const revenusMensuels = new Array(12).fill(0);

        demandes.forEach(d => {
            if (!d.catalogue) return;
            const price = Number(d.catalogue.prix);
            const dDate = new Date(d.dateDemande);

            if (dDate.getFullYear() === currentYear) {
                revenuAnnuel += price;
                revenusMensuels[dDate.getMonth()] += price;

                if (dDate.getMonth() === currentMonth) {
                    revenuMoisActuel += price;
                } else if (dDate.getMonth() === currentMonth - 1 || (currentMonth === 0 && dDate.getMonth() === 11)) {
                    revenuMoisPrecedent += price;
                }
            }
        });

        const growthPct = revenuMoisPrecedent === 0 ? 100 : Math.round(((revenuMoisActuel - revenuMoisPrecedent) / revenuMoisPrecedent) * 100);

        const invoicesMap = new Map<string, any>();

        demandes.forEach(d => {
            if (!d.catalogue || !d.client) return;
            const price = Number(d.catalogue.prix);
            const dDate = new Date(d.dateDemande);
            
            const monthStr = dDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
            const period = monthStr.charAt(0).toUpperCase() + monthStr.slice(1);

            const isEnterprise = d.client.role === 'ENTREPRISE_ADMIN' || d.client.role === 'ENTREPRISE_USER';
            const clientId = isEnterprise && d.client.entreprise ? `ent-${d.client.entreprise.id}` : `pers-${d.client.id}`;
            const key = `${clientId}-${period}`;

            if (!invoicesMap.has(key)) {
                invoicesMap.set(key, {
                    id: key,
                    client: isEnterprise && d.client.entreprise ? d.client.entreprise.nomEntreprise : `${d.client.prenom} ${d.client.nom}`,
                    email: isEnterprise ? (d.client.entreprise ? 'Admin Entreprise' : d.client.email) : d.client.email,
                    period: period,
                    vmCount: 0,
                    amount: 0,
                    paid: d.client.wallet ? Number(d.client.wallet.solde) >= 0 : true,
                });
            }

            const inv = invoicesMap.get(key);
            inv.vmCount += 1;
            inv.amount += price;
        });

        const billingInvoices = Array.from(invoicesMap.values()).map(inv => ({
            id: inv.id,
            client: inv.client,
            email: inv.email,
            period: inv.period,
            resources: `${inv.vmCount} VMs`,
            amount: `${inv.amount.toFixed(2)} DT`,
            paid: inv.paid
        }));
        
        billingInvoices.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

        const facturesEmises = billingInvoices.length;
        const facturesEnAttente = billingInvoices.filter(i => !i.paid).length;
        const facturesPayees = facturesEmises - facturesEnAttente;
        
        const maxRevenuMensuel = Math.max(...revenusMensuels.slice(0, currentMonth + 1));
        const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
        const revenueChart = revenusMensuels.map((val, index) => {
            return {
                label: monthNames[index],
                pct: maxRevenuMensuel > 0 ? Math.round((val / maxRevenuMensuel) * 100) : 0,
                val: val
            };
        }).slice(0, currentMonth + 1);

        const catalogue = await this.catalogueRepository.find();
        const pricingRules = catalogue.map(c => ({
            label: `${c.vcpu} vCPU, ${c.ramMB} GB RAM, ${c.stockageGB} GB SSD`,
            price: `${Number(c.prix).toFixed(3)} DT/mois`
        }));

        const monthNameActuel = monthNames[currentMonth].toLowerCase();

        return {
            billingStats: [
                { label: `Revenus ${monthNameActuel}`, val: `${revenuMoisActuel.toFixed(0)} DT`, sub: `${growthPct >= 0 ? '+' : ''}${growthPct}% vs mois préc.`, bg: 'var(--green-light)', color: 'var(--green)' },
                { label: 'Factures émises', val: `${facturesEmises}`, sub: `${facturesPayees} payées`, bg: 'var(--blue-light)', color: 'var(--blue)' },
                { label: 'Factures en attente', val: `${facturesEnAttente}`, sub: 'À relancer', bg: 'var(--amber-light)', color: 'var(--amber)' },
                { label: 'Revenu annuel', val: `${revenuAnnuel.toFixed(0)} DT`, sub: `Année ${currentYear}`, bg: 'var(--purple-light)', color: 'var(--purple)' },
            ],
            billingInvoices,
            revenueChart,
            pricingRules,
            currentMonthTotal: {
                label: `Total ${monthNameActuel} ${currentYear}`,
                val: `${revenuMoisActuel.toFixed(0)} DT`
            }
        };
    }
}