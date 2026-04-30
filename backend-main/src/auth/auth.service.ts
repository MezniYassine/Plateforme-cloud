import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

// --- DTOs ---
export interface RegisterEnterpriseDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  taxId: string;
}

export interface RegisterPersonalDto { // Renommé (anciennement Developer)
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  profession?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) { }

  // 1. Inscription d'une Entreprise (et de son premier Admin)
  async registerEnterprise(dto: RegisterEnterpriseDto) {
    if (!dto.email || !dto.password || !dto.companyName || !dto.firstName || !dto.lastName) {
      throw new BadRequestException('Missing required fields');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const existingTaxId = await this.usersService.findByTaxId(dto.taxId);
    if (existingTaxId) {
      throw new ConflictException('An account with this tax ID already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.usersService.createEnterprise({
      nom: dto.lastName,
      prenom: dto.firstName,
      email: dto.email,
      password: hashedPassword,
      companyName: dto.companyName,
      taxId: dto.taxId,
    });
    const adminEmail = this.configService.get<string>('ADMIN_GLOBAL_EMAIL');

    if (adminEmail) {
      await this.mailerService.sendMail({
        to: adminEmail,
        subject: '🔔 Nouvelle inscription d\'entreprise à valider',
        html: `
        <h3>Nouvelle inscription sur Dynamix</h3>
        <p>Une nouvelle entreprise <strong>${dto.companyName}</strong> a été créée et attend votre validation.</p>
        <ul>
          <li><strong>Contact :</strong> ${dto.firstName} ${dto.lastName}</li>
          <li><strong>Email :</strong> ${dto.email}</li>
          <li><strong>SIRET :</strong> ${dto.taxId}</li>
        </ul>
        <p>Veuillez vous connecter à votre console d'administration pour traiter cette demande.</p>
      `,
      }).catch(err => {
        console.error("Erreur lors de l'envoi de l'email à l'admin:", err);
      });
    }

    return { ok: true, message: 'Enterprise account created. Awaiting approval.' };
  }

  // 2. Inscription d'un Particulier
  async registerPersonal(dto: RegisterPersonalDto) {
    if (!dto.email || !dto.password || !dto.firstName || !dto.lastName) {
      throw new BadRequestException('Missing required fields');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.usersService.createPersonal({
      nom: dto.lastName,
      prenom: dto.firstName,
      email: dto.email,
      password: hashedPassword,
      profession: dto.profession ?? '',
    });
    const adminEmail = this.configService.get<string>('ADMIN_GLOBAL_EMAIL');

    if (adminEmail) {
      await this.mailerService.sendMail({
        to: adminEmail,
        subject: '🔔 Nouveau compte Particulier à valider',
        html: `
        <h3>Nouvelle inscription sur Dynamix</h3>
        <p>Un nouveau compte <strong>Particulier</strong> a été créé et attend votre validation.</p>
        <ul>
          <li><strong>Nom :</strong> ${dto.firstName} ${dto.lastName}</li>
          <li><strong>Email :</strong> ${dto.email}</li>
          <li><strong>Profession :</strong> ${dto.profession ?? 'Non renseignée'}</li>
        </ul>
        <p>Veuillez vous connecter à votre console d'administration pour traiter cette demande.</p>
      `,
      }).catch(err => {
        console.error("Erreur lors de l'envoi de l'email à l'admin:", err);
      });
    }

    return { ok: true, message: 'Personal account created successfully.' };
  }

  // 3. Connexion (Login Unifié pour TOUS les utilisateurs)
  async login(dto: LoginDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    let user: any = await this.usersService.findByEmail(dto.email);
    let isGlobalAdmin = false;

    if (!user) {
      user = await this.usersService.findAdminByEmail(dto.email);
      if (user) {
        isGlobalAdmin = true;
      }
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // --- SÉCURITÉ JWT ---
    const role = isGlobalAdmin ? 'GLOBAL_ADMIN' : user.role;
    const status = isGlobalAdmin ? 'APPROVED' : user.status;
    const requiresMFA = isGlobalAdmin ? false : (user.mfaStatus === 'ACTIVE');

    const payload = {
      sub: user.id,
      email: user.email,
      role: role,
      status: status,
      entrepriseId: isGlobalAdmin ? null : (user.entreprise ? user.entreprise.id : null)
    };

    const token = this.jwtService.sign(payload);

    return {
      requiresMFA,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: role,
        status: status
      }
    };
  }

  // 4. Vérification MFA (Inchangé)
  verifyMFA(code: string) {
    if (!code || code.length !== 6) {
      throw new BadRequestException('Invalid MFA code');
    }
    const token = this.jwtService.sign({ mfaVerified: true });
    return { token };
  }
}