import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'src/entities/client.entity';
import { AccountStatus } from 'src/enum/account-status.enum';
import { RoleClient } from 'src/enum/role-client.enum';

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

}
