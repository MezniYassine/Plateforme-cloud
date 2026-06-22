import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'src/entities/client.entity';
import { AccountStatus } from 'src/enum/account-status.enum';
import { RoleClient } from 'src/enum/role-client.enum';
import { Entreprise } from 'src/entities/entreprise.entity';
import { Demande, DemandeStatus } from 'src/demande/entities/demande.entity';

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
        private readonly demandeRepository: Repository<Demande>
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

        // Récupérer les utilisateurs avec leurs services
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
            const vmCount = (u.services || []).filter(s => s['type'] === 'MachineVirtuelle').length;
            const totalServices = (u.services || []).length;

            // Consommation mensuelle = somme des prix des demandes approuvées ce mois
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
                .reduce((sum, d) => sum + (d.catalogue ? Number(d.catalogue.prix) : 0), 0);

            return {
                id: String(u.id),
                name: `${u.prenom} ${u.nom}`,
                email: u.email,
                color: COLORS[index % COLORS.length],
                active: u.status === AccountStatus.APPROVED,
                status: u.status,
                vms: vmCount,
                services: totalServices,
                spend: Math.round(monthlySpend * 100) / 100,
            };
        }));

        return result;
    }

}
