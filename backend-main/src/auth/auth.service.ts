import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as path from 'path';
import { UsersService } from '../users/users.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { AccountStatus } from 'src/enum/account-status.enum';
import { MFAStatus } from 'src/enum/mfa-status.enum';
import { Repository } from 'typeorm';
import { Admin } from 'src/entities/admin.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Client } from 'src/entities/client.entity';
import { Personal } from 'src/entities/personal.entity';
import { RoleClient } from 'src/enum/role-client.enum';
import { WalletService } from 'src/wallet/wallet.service';

// --- DTOs ---
export interface RegisterEnterpriseDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  taxId: string;
  companySize?: string;
  phone?: string;
}

export interface RegisterPersonalDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  profession?: string;
  phone?: string;
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
    private readonly walletService: WalletService,
    @InjectRepository(Client) private clientRepo: Repository<Client>,
    @InjectRepository(Personal) private personalRepo: Repository<Personal>,
    @InjectRepository(Admin) private adminRepo: Repository<Admin>,
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
      telephone: dto.phone,
      companySize: dto.companySize,
    });
    const adminEmail = this.configService.get<string>('ADMIN_GLOBAL_EMAIL');

    if (adminEmail) {
      await this.mailerService.sendMail({
        to: adminEmail,
        subject: 'Nouvelle inscription d\'entreprise à valider',
        html: `
        <h3>Nouvelle inscription sur Dynamix</h3>
        <p>Une nouvelle entreprise <strong>${dto.companyName}</strong> a été créée et attend votre validation.</p>
        <ul>
          <li><strong>Contact :</strong> ${dto.firstName} ${dto.lastName}</li>
          <li><strong>Email :</strong> ${dto.email}</li>
          <li><strong>Téléphone :</strong> ${dto.phone || 'Non renseigné'}</li>
          <li><strong>Taille :</strong> ${dto.companySize || 'Non renseigné'}</li>
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
      telephone: dto.phone,
    });
    const adminEmail = this.configService.get<string>('ADMIN_GLOBAL_EMAIL');

    if (adminEmail) {
      await this.mailerService.sendMail({
        to: adminEmail,
        subject: 'Nouveau compte Particulier à valider',
        html: `
        <h3>Nouvelle inscription sur Dynamix</h3>
        <p>Un nouveau compte <strong>Particulier</strong> a été créé et attend votre validation.</p>
        <ul>
          <li><strong>Nom :</strong> ${dto.firstName} ${dto.lastName}</li>
          <li><strong>Email :</strong> ${dto.email}</li>
          <li><strong>Téléphone :</strong> ${dto.phone || 'Non renseigné'}</li>
          <li><strong>Profession :</strong> ${dto.profession || 'Non renseignée'}</li>
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
      throw new UnauthorizedException("Cet email n'existe pas");
    }

    if (!user.password) {
      throw new UnauthorizedException("Activation du compte requise");
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException("Mot de passe incorrect");
    }

    // --- SÉCURITÉ JWT ---
    const role = isGlobalAdmin ? 'GLOBAL_ADMIN' : user.role;
    const status = isGlobalAdmin ? 'APPROVED' : user.status;
    // Le MFA est requis pour TOUS les comptes (admin global inclus)
    const requiresMFA = isGlobalAdmin ? true : (user.mfaStatus === 'ACTIVE');

    const payload = {
      sub: user.id,
      email: user.email,
      role: role,
      status: status,
      entrepriseId: isGlobalAdmin ? null : (user.entreprise ? user.entreprise.id : null)
    };

    const token = this.jwtService.sign(payload);

    // Envoi automatique de l'OTP si MFA requis
    if (requiresMFA) {
      const otp = require('crypto').randomInt(100000, 999999).toString();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      if (isGlobalAdmin) {
        user.otpCode = otp;
        user.otpExpiry = expiry;
        await this.adminRepo.save(user);
      } else {
        user.otpCode = otp;
        user.otpExpiry = expiry;
        await this.clientRepo.save(user);
      }
      console.log(`🔑 [MFA OTP CODE] Code OTP généré pour ${user.email} : ${otp}`);
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Code de connexion sécurisé — Dynamix',
        html: this.buildOtpEmail(user.prenom, otp),
        attachments: [this.getLogoAttachment()],
      }).catch(err => console.error('[Login MFA] Erreur envoi OTP Mailtrap:', err.message || err));
    }

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

  // ─── OTP MFA ──────────────────────────────────────────────────────────────

  /** Génère et envoie un code OTP à l'email de l'utilisateur pour activer le MFA */
  async sendMfaOtp(userId: number): Promise<{ ok: boolean; message: string }> {
    const user = await this.clientRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // expire dans 10 min

    user.otpCode = otp;
    user.otpExpiry = expiry;
    await this.clientRepo.save(user);

    console.log(`🔑 [PROFILE MFA OTP] Code OTP généré pour ${user.email} : ${otp}`);
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Votre code de vérification MFA — Dynamix',
      html: this.buildOtpEmail(user.prenom, otp),
      attachments: [this.getLogoAttachment()],
    }).catch(err => console.error('[MFA] Erreur envoi OTP Mailtrap:', err.message || err));

    return { ok: true, message: 'Code OTP envoyé par email.' };
  }

  /** Vérifie le code OTP et active le MFA si correct */
  async verifyAndActivateMfa(userId: number, code: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.clientRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    if (!user.otpCode || !user.otpExpiry) {
      throw new BadRequestException('Aucun code OTP en attente. Veuillez en demander un nouveau.');
    }
    if (new Date() > user.otpExpiry) {
      throw new BadRequestException('Code OTP expiré. Veuillez en demander un nouveau.');
    }
    if (user.otpCode !== code.trim()) {
      throw new UnauthorizedException('Code OTP incorrect.');
    }

    user.mfaStatus = MFAStatus.ACTIVE;
    user.otpCode = null;
    user.otpExpiry = null;
    await this.clientRepo.save(user);

    return { ok: true, message: 'MFA activé avec succès.' };
  }

  /** Envoie un OTP de connexion (renvoyer) - gère admin global ET clients */
  async sendLoginMfaOtp(email: string): Promise<{ ok: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Cherche d'abord dans les admins globaux
    const admin = await this.adminRepo.findOne({ where: { email: normalizedEmail } });
    if (admin) {
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      admin.otpCode = otp;
      admin.otpExpiry = expiry;
      await this.adminRepo.save(admin);
      console.log(`🔑 [RESEND ADMIN OTP] Code OTP pour ${admin.email} : ${otp}`);
      await this.mailerService.sendMail({
        to: admin.email,
        subject: 'Code de connexion sécurisé — Dynamix',
        html: this.buildOtpEmail(admin.prenom, otp),
        attachments: [this.getLogoAttachment()],
      }).catch(err => console.error('[MFA Admin] Erreur envoi OTP Mailtrap:', err.message || err));
      return { ok: true, message: 'Code OTP envoyé.' };
    }

    // Sinon cherche dans les clients
    const user = await this.clientRepo.findOne({ where: { email: normalizedEmail } });
    if (!user) return { ok: true, message: 'Code envoyé si le compte existe.' };

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    user.otpCode = otp;
    user.otpExpiry = expiry;
    await this.clientRepo.save(user);

    console.log(`🔑 [RESEND LOGIN OTP] Code OTP pour ${user.email} : ${otp}`);
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Code de connexion sécurisé — Dynamix',
      html: this.buildOtpEmail(user.prenom, otp),
      attachments: [this.getLogoAttachment()],
    }).catch(err => console.error('[MFA Login] Erreur envoi OTP Mailtrap:', err.message || err));

    return { ok: true, message: 'Code OTP de connexion envoyé.' };
  }


  /** Vérifie le code OTP lors du login MFA et retourne le vrai JWT */
  async verifyMFA(code: string, email?: string): Promise<{ token: string }> {
    if (!email) throw new BadRequestException('Email requis.');
    if (!code || code.length !== 6) throw new BadRequestException('Code OTP invalide.');

    const normalizedEmail = email.toLowerCase().trim();

    // Cherche d'abord dans les admins globaux
    const admin = await this.adminRepo.findOne({ where: { email: normalizedEmail } });
    if (admin) {
      if (!admin.otpCode || !admin.otpExpiry) {
        throw new BadRequestException('Aucun code OTP en attente.');
      }
      if (new Date() > admin.otpExpiry) {
        throw new BadRequestException('Code OTP expiré.');
      }
      if (admin.otpCode !== code.trim()) {
        throw new UnauthorizedException('Code OTP incorrect.');
      }
      admin.otpCode = null;
      admin.otpExpiry = null;
      await this.adminRepo.save(admin);

      const payload = { sub: admin.id, email: admin.email, role: 'GLOBAL_ADMIN', status: 'APPROVED' };
      return { token: this.jwtService.sign(payload) };
    }

    // Sinon cherche dans les clients
    const user = await this.clientRepo.findOne({
      where: { email: normalizedEmail },
      relations: ['entreprise'],
    });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable.');

    if (!user.otpCode || !user.otpExpiry) {
      throw new BadRequestException('Aucun code OTP en attente.');
    }
    if (new Date() > user.otpExpiry) {
      throw new BadRequestException('Code OTP expiré.');
    }
    if (user.otpCode !== code.trim()) {
      throw new UnauthorizedException('Code OTP incorrect.');
    }

    user.otpCode = null;
    user.otpExpiry = null;
    await this.clientRepo.save(user);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      entrepriseId: user.entreprise ? user.entreprise.id : null,
    };
    const token = this.jwtService.sign(payload);
    return { token };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private getLogoAttachment() {
    return {
      filename: 'logo.png',
      path: path.join(__dirname, '..', 'assets', 'logo.png'),
      cid: 'logo_dynamix',
    };
  }

  private buildOtpEmail(prenom: string, otp: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code OTP</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Vérification en deux étapes</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Dynamix Cloud · Sécurité</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Bonjour <strong>${prenom}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Voici votre code de vérification à usage unique. Il expire dans <strong>10 minutes</strong>.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <div style="display:inline-block;background:#eff6ff;border:2px dashed #2563eb;border-radius:14px;padding:18px 36px;">
                <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#1d4ed8;font-family:monospace;">${otp}</span>
              </div>
            </div>
            <p style="margin:0 0 16px;font-size:13px;color:#64748b;text-align:center;">
              N'entrez ce code que sur le site officiel de Dynamix. Ne le partagez jamais.
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">© 2026 Dynamix Cloud · Email automatique</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

    await this.clientRepo.save(user);

    return { ok: true, message: 'Mot de passe configuré avec succès. Vous pouvez maintenant vous connecter.' };
  }
  // Fonction générique pour gérer Google et Microsoft
  async oauthLogin(oauthUser: any) {
    if (!oauthUser) {
      throw new InternalServerErrorException(`Erreur d'authentification ${oauthUser.provider}`);
    }

    const email = oauthUser.email.toLowerCase().trim();

    // --- ÉTAPE 1 : RECHERCHE ADMIN ---
    let admin = await this.adminRepo.findOne({ where: { email } });
    if (admin) {
      // Initialisation si les tableaux sont null
      admin.providers = admin.providers || [];
      admin.providerIds = admin.providerIds || [];

      // Ajout à la liste si c'est un nouveau provider pour cet admin
      if (!admin.providers.includes(oauthUser.provider)) {
        admin.providers.push(oauthUser.provider);
        admin.providerIds.push(oauthUser.providerId);
        await this.adminRepo.save(admin);
      }

      const payload = { sub: admin.id, email: admin.email, role: 'GLOBAL_ADMIN' };
      return { access_token: this.jwtService.sign(payload) };
    }

    // --- ÉTAPE 2 : RECHERCHE CLIENT ---
    let user = await this.clientRepo.findOne({ where: { email } });

    if (!user) {
      // CRÉATION NOUVEAU COMPTE
      const newUser = this.clientRepo.create({
        email,
        nom: oauthUser.lastName ?? 'Inconnu',
        prenom: oauthUser.firstName ?? 'Inconnu',
        password: null,
        providers: [oauthUser.provider], // On crée le premier élément du tableau
        providerIds: [oauthUser.providerId],
        status: AccountStatus.APPROVED,
        role: RoleClient.PERSONNEL,
      });
      user = await this.clientRepo.save(newUser);

      await this.personalRepo.save(this.personalRepo.create({ id: user.id, profession: 'Non renseignée' }));
      // Créer le wallet à 0 DT pour le nouveau compte OAuth
      await this.walletService.createWalletForClient(user);
    } else {
      // MISE À JOUR COMPTE EXISTANT (LINKING)
      user.providers = user.providers || [];
      user.providerIds = user.providerIds || [];

      if (!user.providers.includes(oauthUser.provider)) {
        user.providers.push(oauthUser.provider);
        user.providerIds.push(oauthUser.providerId);
        await this.clientRepo.save(user);
      }

      // Vérification profil personnel
      if (user.role === RoleClient.PERSONNEL) {
        const existing = await this.personalRepo.findOne({ where: { id: user.id } });
        if (!existing) {
          await this.personalRepo.save(this.personalRepo.create({ id: user.id, profession: 'Non renseignée' }));
        }
      }
    }

    const payload = { sub: user.id, email: user.email, role: user.role, status: user.status };
    return { access_token: this.jwtService.sign(payload) };
  }

  async googleLogin(googleUser: any) {
    return this.oauthLogin({ ...googleUser, provider: 'google' });
  }

  async microsoftLogin(microsoftUser: any) {
    return this.oauthLogin({ ...microsoftUser, provider: 'microsoft' });
  }
}
