import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'src/entities/client.entity';
import { AccountStatus } from 'src/enum/account-status.enum';
import { Admin } from 'src/entities/admin.entity';
import bcrypt from 'bcryptjs';

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(Client)
        private readonly clientRepo: Repository<Client>,
        private readonly mailerService: MailerService,
        @InjectRepository(Admin)
        private readonly adminRepository: Repository<Admin>,
    ) { }

    async updateStatus(id: number, status: AccountStatus): Promise<Client> {
        // 1. Ton ancienne logique (Légèrement améliorée avec NotFoundException)
        const client = await this.clientRepo.findOne({ where: { id } });

        if (!client) {
            throw new NotFoundException('Client not found'); // Plus propre pour NestJS qu'une simple Error
        }

        client.status = status;
        const updatedClient = await this.clientRepo.save(client);

        // 2. La nouvelle logique : Envoi de l'email selon le statut
        // Adapte 'ACTIVE' et 'REJECTED' selon les vraies valeurs de ton enum AccountStatus
        if (status === AccountStatus.APPROVED) {
            await this.mailerService.sendMail({
                to: client.email, // Assure-toi que ton entité Client a bien une propriété email
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

}