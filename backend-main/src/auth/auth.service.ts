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
import { AccountStatus } from 'src/enum/account-status.enum';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Client } from 'src/entities/client.entity';

// --- DTOs ---
export interface RegisterEnterpriseDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  taxId: string;
}

export interface RegisterPersonalDto {
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
    @InjectRepository(Client) private usersRepo: Repository<Client>,
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

    if (!user.password) {
      throw new UnauthorizedException('Account activation required');
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

  async forgotPassword(email: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email requis');
    }

    const user = await this.usersService.findByEmail(normalizedEmail);

    if (user) {
      const resetToken = this.jwtService.sign(
        { sub: user.id, email: user.email, type: 'FORGOT_PASSWORD' },
        { expiresIn: '30m' },
      );
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
      const resetUrl = `${frontendUrl.replace(/\/$/, '')}/auth/setup-password?token=${encodeURIComponent(resetToken)}`;

      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Reinitialisation de votre mot de passe Dynamix',
        html: `
          <h3>Reinitialisation du mot de passe</h3>
          <p>Bonjour ${user.prenom} ${user.nom},</p>
          <p>Vous avez demande la reinitialisation de votre mot de passe.</p>
          <p><a href="${resetUrl}">Choisir un nouveau mot de passe</a></p>
          <p>Ce lien expire dans 30 minutes.</p>
          <p>Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p>
        `,
      }).catch(err => {
        console.error("Erreur lors de l'envoi de l'email de reinitialisation:", err);
      });
    }

    return {
      ok: true,
      message: 'Si un compte existe avec cet email, un lien de reinitialisation a ete envoye.',
    };
  }

  async setupPassword(token: string, password: string) {
    if (!token || !password) {
      throw new BadRequestException('Token et mot de passe requis');
    }

    // 1. Vérifier le token
    let decoded: any;
    try {
      decoded = this.jwtService.verify(token);
    } catch {
      throw new BadRequestException('Token invalide ou expiré');
    }

    // S'assurer que c'est bien un token d'invitation
    if (decoded.type !== 'INVITATION' && decoded.type !== 'FORGOT_PASSWORD') {
      throw new BadRequestException('Token invalide');
    }

    const userId = Number(decoded.sub ?? decoded.userId ?? decoded.id);
    if (!userId) {
      throw new BadRequestException('Token invalide');
    }

    // 2. Récupérer l'utilisateur
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('Utilisateur non trouvé');
    }

    // 3. Vérification supplémentaire : L'email du token doit correspondre
    // (Sauf si c'est un reset mot de passe où on peut vouloir changer l'email, mais pour l'invitation il faut que ce soit le même)
    if (decoded.email && user.email !== decoded.email) {
      throw new BadRequestException('Incohérence entre le token et l\'utilisateur');
    }

    // 4. Hash du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Mise à jour
    user.password = hashedPassword;

    if (user.status === AccountStatus.PENDING_VALIDATION) {
      user.status = AccountStatus.APPROVED;
    }
    user.isEmailVerified = true;

    await this.usersRepo.save(user);

    return { ok: true, message: 'Mot de passe configuré avec succès. Vous pouvez maintenant vous connecter.' };
  }
}
