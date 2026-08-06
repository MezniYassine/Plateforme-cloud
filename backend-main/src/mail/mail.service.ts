import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from 'src/entities/admin.entity';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly SITE_WEB = 'https://www.dynamix-services.com';

  constructor(
    private readonly mailer: MailerService,
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
  ) { }

  private getLogoAttachment() {
    return {
      filename: 'logo.png',
      path: path.join(__dirname, '..', 'assets', 'logo.png'),
      cid: 'logo_dynamix',
    };
  }

  private async buildSignature(): Promise<string> {
    const admin = await this.adminRepo.findOne({ where: {} }).catch(() => null);
    const nom = admin ? `${admin.prenom} ${admin.nom}` : 'Equipe Dynamix';
    const email = admin?.email ?? 'contact@dynamix-services.com';
    return `
<table cellpadding="0" cellspacing="0" style="width:100%;border-top:2px solid #e2e8f0;margin-top:28px;padding-top:20px;">
  <tr>
    <td style="padding-right:20px;vertical-align:middle;width:110px;">
      <img src="cid:logo_dynamix" width="100" alt="Dynamix Services" style="display:block;" />
    </td>
    <td style="vertical-align:middle;border-left:2px solid #e2e8f0;padding-left:20px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f172a;">${nom}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Pôle Industriel EL Azib, Bizerte-Tunisie</p>
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Email: <a href="mailto:${email}" style="color:#2563eb;text-decoration:none;">${email}</a></p>
      <p style="margin:0;font-size:12px;"><a href="${this.SITE_WEB}" style="color:#2563eb;text-decoration:none;">${this.SITE_WEB.replace('https://', '')}</a></p>
    </td>
  </tr>
</table>`;
  }

  /**
   * Email envoyé à l'admin entreprise lorsqu'un utilisateur soumet une demande.
   */
  async sendNouvelleDemandeAdmin(params: {
    adminEmail: string;
    adminPrenom: string;
    userPrenom: string;
    userNom: string;
    nomInstance: string;
    justification: string;
    specs: string;
    demandeId: number;
  }): Promise<void> {
    try {
      const sig = await this.buildSignature();
      await this.mailer.sendMail({
        to: params.adminEmail,
        subject: `📋 Nouvelle demande de ressource — ${params.nomInstance}`,
        html: this.buildNouvelleDemandeHtml(params, sig),
        attachments: [this.getLogoAttachment()],
      });
      this.logger.log(`[Mail] Nouvelle demande → admin ${params.adminEmail}`);
    } catch (err) {
      this.logger.error(`[Mail] Échec envoi nouvelle demande admin: ${err.message}`);
    }
  }

  /**
   * Email envoyé à l'utilisateur (ENTREPRISE_USER) lorsque le provisionnement réussit.
   */
  async sendProvisionningSucces(params: {
    userEmail: string;
    userPrenom: string;
    userNom: string;
    nomInstance: string;
    specs: string;
    commentaireAdmin: string;
  }): Promise<void> {
    try {
      const sig = await this.buildSignature();
      await this.mailer.sendMail({
        to: params.userEmail,
        subject: `✅ Votre machine virtuelle « ${params.nomInstance} » est prête !`,
        html: this.buildSuccesHtml(params, sig),
        attachments: [this.getLogoAttachment()],
      });
      this.logger.log(`[Mail] Provisionement succès → utilisateur ${params.userEmail}`);
    } catch (err) {
      this.logger.error(`[Mail] Échec envoi succès utilisateur: ${err.message}`);
    }
  }

  /**
   * Email envoyé à l'utilisateur (ENTREPRISE_USER) lorsque le provisionnement échoue.
   */
  async sendProvisionningEchec(params: {
    userEmail: string;
    userPrenom: string;
    userNom: string;
    nomInstance: string;
    raison: string;
  }): Promise<void> {
    try {
      const sig = await this.buildSignature();
      await this.mailer.sendMail({
        to: params.userEmail,
        subject: `❌ Échec du déploiement de « ${params.nomInstance} »`,
        html: this.buildEchecHtml(params, sig),
        attachments: [this.getLogoAttachment()],
      });
      this.logger.log(`[Mail] Provisionnement échoué → utilisateur ${params.userEmail}`);
    } catch (err) {
      this.logger.error(`[Mail] Échec envoi échec utilisateur: ${err.message}`);
    }
  }

  /**
   * Email envoyé à l'utilisateur (ENTREPRISE_USER) lorsque sa demande est rejetée manuellement par l'admin.
   */
  async sendDemandeRejetee(params: {
    userEmail: string;
    userPrenom: string;
    nomInstance: string;
    motif: string;
  }): Promise<void> {
    try {
      const sig = await this.buildSignature();
      await this.mailer.sendMail({
        to: params.userEmail,
        subject: `🚫 Demande refusée — ${params.nomInstance}`,
        html: this.buildRejetHtml(params, sig),
        attachments: [this.getLogoAttachment()],
      });
      this.logger.log(`[Mail] Demande rejetée → utilisateur ${params.userEmail}`);
    } catch (err) {
      this.logger.error(`[Mail] Échec envoi rejet utilisateur: ${err.message}`);
    }
  }

  /**
   * Email envoyé au PERSONNEL (compte individuel) lorsque
   * son provisionnement VMware est terminé avec succès.
   */
  async sendProvisionningSuccesPersonnel(params: {
    userEmail: string;
    userPrenom: string;
    userNom: string;
    nomInstance: string;
    specs: string;
    esxiRef: string;
  }): Promise<void> {
    try {
      const sig = await this.buildSignature();
      await this.mailer.sendMail({
        to: params.userEmail,
        subject: `🚀 Votre machine virtuelle « ${params.nomInstance} » est opérationnelle !`,
        html: this.buildSuccesPersonnelHtml(params, sig),
        attachments: [this.getLogoAttachment()],
      });
      this.logger.log(`[Mail] Provisionnement terminé → personnel ${params.userEmail}`);
    } catch (err) {
      this.logger.error(`[Mail] Échec envoi succès personnel: ${err.message}`);
    }
  }

  /**
   * Email envoyé à l'admin entreprise lorsqu'un utilisateur effectue un scale-up.
   */
  async sendUpgradeNotificationAdmin(params: {
    adminEmail: string;
    adminPrenom: string;
    userPrenom: string;
    userNom: string;
    resourceName: string;
    resourceType: 'VM' | 'PaaS';
    oldPlan: string;
    newPlan: string;
    diffPrice: number;
  }): Promise<void> {
    try {
      const sig = await this.buildSignature();
      await this.mailer.sendMail({
        to: params.adminEmail,
        subject: `⬆️ Scale-up effectué par ${params.userPrenom} ${params.userNom} — ${params.resourceName}`,
        html: this.buildUpgradeNotificationHtml(params, sig),
        attachments: [this.getLogoAttachment()],
      });
      this.logger.log(`[Mail] Notification upgrade → admin ${params.adminEmail}`);
    } catch (err) {
      this.logger.error(`[Mail] Échec envoi notification upgrade: ${err.message}`);
    }
  }

  // ── Templates HTML ──────────────────────────────────────────────────────────


  private buildNouvelleDemandeHtml(p: {
    adminPrenom: string;
    userPrenom: string;
    userNom: string;
    nomInstance: string;
    justification: string;
    specs: string;
    demandeId: number;
  }, signature: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nouvelle demande</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">🖥️ Dynamix Cloud</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Plateforme de gestion des ressources cloud</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;">Bonjour <strong>${p.adminPrenom}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Un membre de votre équipe vient de soumettre une nouvelle demande de ressource en attente de votre validation.
            </p>
            <!-- Info card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#2563eb;text-transform:uppercase;letter-spacing:0.8px;">Détails de la demande #${p.demandeId}</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;width:160px;">Demandeur</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${p.userPrenom} ${p.userNom}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Nom de l'instance</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${p.nomInstance}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Configuration</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${p.specs}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;vertical-align:top;">Justification</td>
                    <td style="padding:6px 0;font-size:13px;color:#475569;font-style:italic;">"${p.justification}"</td>
                  </tr>
                </table>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;">
              Connectez-vous à votre tableau de bord pour approuver ou rejeter cette demande.
            </p>
            ${signature}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">© 2026 Dynamix Cloud · Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildSuccesHtml(p: {
    userPrenom: string;
    userNom: string;
    nomInstance: string;
    specs: string;
    commentaireAdmin: string;
  }, signature: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VM déployée</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);padding:32px 40px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">✅</div>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Machine virtuelle déployée !</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Votre infrastructure est prête à l'emploi</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;">Bonjour <strong>${p.userPrenom} ${p.userNom}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Bonne nouvelle ! Votre demande de ressource a été approuvée et votre machine virtuelle est maintenant opérationnelle.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.8px;">Récapitulatif</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;width:160px;">Nom de l'instance</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${p.nomInstance}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Configuration</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${p.specs}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;vertical-align:top;">Note de l'admin</td>
                    <td style="padding:6px 0;font-size:13px;color:#475569;font-style:italic;">"${p.commentaireAdmin}"</td>
                  </tr>
                </table>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;">
              Connectez-vous à votre tableau de bord pour accéder à votre machine virtuelle et commencer à travailler.
            </p>
            ${signature}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">© 2026 Dynamix Cloud · Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildEchecHtml(p: {
    userPrenom: string;
    userNom: string;
    nomInstance: string;
    raison: string;
  }, signature: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Échec déploiement</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);padding:32px 40px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">❌</div>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Échec du déploiement</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Une erreur est survenue lors du provisionnement</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;">Bonjour <strong>${p.userPrenom} ${p.userNom}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Nous sommes désolés de vous informer qu'une erreur technique est survenue lors du déploiement de votre machine virtuelle. Notre équipe a été notifiée et travaille à résoudre le problème.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.8px;">Détails de l'erreur</p>
                <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Instance concernée : <strong style="color:#0f172a;">${p.nomInstance}</strong></p>
                <p style="margin:0;font-size:13px;color:#475569;font-style:italic;">${p.raison}</p>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Vous pouvez soumettre une nouvelle demande depuis votre tableau de bord ou contacter votre administrateur entreprise pour plus d'informations.
            </p>
            ${signature}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">© 2026 Dynamix Cloud · Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildRejetHtml(p: {
    userPrenom: string;
    nomInstance: string;
    motif: string;
  }, signature: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demande refusée</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);padding:32px 40px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">🚫</div>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Demande non approuvée</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Votre administrateur a examiné votre demande</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;">Bonjour <strong>${p.userPrenom}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Après examen de votre demande, votre administrateur a décidé de ne pas l'approuver pour le moment.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#7c3aed;text-transform:uppercase;letter-spacing:0.8px;">Détails du refus</p>
                <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Instance demandée : <strong style="color:#0f172a;">${p.nomInstance}</strong></p>
                <p style="margin:0;font-size:13px;color:#475569;">Motif : <em>"${p.motif}"</em></p>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Si vous pensez que cette décision est incorrecte ou si vous souhaitez renouveler votre demande avec des informations supplémentaires, n'hésitez pas à contacter votre administrateur directement.
            </p>
            ${signature}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">© 2026 Dynamix Cloud · Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildSuccesPersonnelHtml(p: {
    userPrenom: string;
    userNom: string;
    nomInstance: string;
    specs: string;
    esxiRef: string;
  }, signature: string): string {
    const now = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VM opérationnelle</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0891b2 0%,#0e7490 100%);padding:32px 40px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">🚀</div>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Machine virtuelle opérationnelle !</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Votre infrastructure personnelle est prête à l'emploi</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;">Bonjour <strong>${p.userPrenom} ${p.userNom}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Excellente nouvelle ! Votre machine virtuelle a été provisionnée avec succès sur l'infrastructure VMware.
              Elle est maintenant <strong>active et accessible</strong> depuis votre tableau de bord.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:12px;margin-bottom:20px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#0891b2;text-transform:uppercase;letter-spacing:0.8px;">⚙️ Détails de votre machine</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:7px 0;font-size:13px;color:#64748b;width:160px;border-bottom:1px solid #cffafe;">Nom de la VM</td>
                    <td style="padding:7px 0;font-size:13px;color:#0f172a;font-weight:700;border-bottom:1px solid #cffafe;">${p.nomInstance}</td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;font-size:13px;color:#64748b;border-bottom:1px solid #cffafe;">Configuration</td>
                    <td style="padding:7px 0;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #cffafe;">${p.specs}</td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;font-size:13px;color:#64748b;border-bottom:1px solid #cffafe;">Référence ESXi</td>
                    <td style="padding:7px 0;font-size:12px;color:#475569;font-family:monospace;border-bottom:1px solid #cffafe;">${p.esxiRef}</td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;font-size:13px;color:#64748b;">Déployée le</td>
                    <td style="padding:7px 0;font-size:13px;color:#0f172a;font-weight:600;">${now}</td>
                  </tr>
                </table>
              </td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:24px;">
              <tr><td style="padding:14px 20px;text-align:center;">
                <span style="display:inline-block;background:#16a34a;color:#fff;font-size:12px;font-weight:700;padding:4px 14px;border-radius:100px;letter-spacing:0.5px;">● RUNNING</span>
                <span style="margin-left:10px;font-size:13px;color:#15803d;font-weight:500;">VM active et opérationnelle</span>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Accédez à votre tableau de bord pour gérer votre machine, accéder à la console, démarrer ou arrêter la VM, et consulter vos métriques en temps réel.
            </p>
            ${signature}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">© 2026 Dynamix Cloud · Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildUpgradeNotificationHtml(p: {
    adminPrenom: string;
    userPrenom: string;
    userNom: string;
    resourceName: string;
    resourceType: 'VM' | 'PaaS';
    oldPlan: string;
    newPlan: string;
    diffPrice: number;
  }, signature: string): string {
    const typeLabel = p.resourceType === 'VM' ? 'Machine Virtuelle (IaaS)' : 'Base de données (PaaS)';
    return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scale-up</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">⬆️ Dynamix Cloud</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Notification de mise à niveau</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;">Bonjour <strong>${p.adminPrenom}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Un membre de votre équipe vient d'effectuer une mise à niveau (scale-up) d'une ressource. Le montant correspondant a été débité de votre portefeuille entreprise.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#7c3aed;text-transform:uppercase;letter-spacing:0.8px;">Détails du Scale-up</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;width:160px;">Utilisateur</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${p.userPrenom} ${p.userNom}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Type de ressource</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${typeLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Nom de la ressource</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${p.resourceName}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Ancien plan</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;">${p.oldPlan}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Nouveau plan</td>
                    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${p.newPlan}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Montant débité</td>
                    <td style="padding:6px 0;font-size:14px;color:#dc2626;font-weight:700;">${p.diffPrice.toFixed(3)} DT</td>
                  </tr>
                </table>
              </td></tr>
            </table>
            <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6;">
              Ce montant correspond à la différence de prix entre l'ancien et le nouveau plan, débité automatiquement de votre portefeuille entreprise.
            </p>
            ${signature}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">© 2026 Dynamix Cloud · Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}
