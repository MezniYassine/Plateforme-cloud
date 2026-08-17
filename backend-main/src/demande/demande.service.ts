import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Demande, DemandeStatus } from './entities/demande.entity';
import { Client } from 'src/entities/client.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { CreateDemandeDto } from './dto/create-demande.dto';
import { ReviewDemandeDto } from './dto/review-demande.dto';
import { RoleClient } from 'src/enum/role-client.enum';
import { ServiceStatus } from 'src/enum/service-status.enum';
import { EsxiService } from 'src/esxi/esxi.service';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { Wallet } from 'src/entities/wallet.entity';
import { MailService } from 'src/mail/mail.service';
import { PaasService } from 'src/paas/paas.service';
import { WalletService } from 'src/wallet/wallet.service';
import { TypeSgbd } from 'src/enum/type-sgbd.enum';
import { SaasService } from 'src/saas/saas.service';
import { SaasAppType } from 'src/enum/saas-app-type.enum';

@Injectable()
export class DemandeService {
  constructor(
    @InjectRepository(Demande)
    private readonly demandeRepository: Repository<Demande>,

    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,

    @InjectRepository(Catalogue)
    private readonly catalogueRepository: Repository<Catalogue>,

    private readonly esxiService: EsxiService,

    @InjectRepository(MachineVirtuelle) private readonly vmRepo: Repository<MachineVirtuelle>,

    private readonly mailService: MailService,
    private readonly paasService: PaasService,
    private readonly walletService: WalletService,
    private readonly saasService: SaasService,
  ) { }

  /**
   * Soumission d'une demande par un utilisateur entreprise (ENTREPRISE_USER)
   * → Envoi email à l'admin entreprise
   */
  async create(clientId: number, dto: CreateDemandeDto): Promise<Demande> {
    // Vérifier que le client existe et est un ENTREPRISE_USER
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
      relations: ['entreprise'],
    });

    if (!client) {
      throw new NotFoundException('Client introuvable.');
    }

    if (client.role !== RoleClient.ENTREPRISE_USER) {
      throw new ForbiddenException(
        'Seuls les utilisateurs entreprise peuvent soumettre une demande.',
      );
    }

    // Vérifier que le catalogue existe et est actif
    const catalogue = await this.catalogueRepository.findOne({
      where: { id: dto.catalogueId, isActive: true },
    });

    if (!catalogue) {
      throw new NotFoundException(
        `Service de catalogue #${dto.catalogueId} introuvable ou inactif.`,
      );
    }

    // Créer la demande
    const demande = this.demandeRepository.create({
      nomInstanceSouhaite: dto.nomInstanceSouhaite,
      justification: dto.justification,
      templateName: dto.templateName,
      versionPaas: dto.versionPaas,
      typeSgbd: dto.typeSgbd,
      appType: dto.appType,
      adminEmail: dto.adminEmail,
      adminPassword: dto.adminPassword,
      linkedPaasId: dto.linkedPaasId,
      status: DemandeStatus.EN_ATTENTE,
      catalogue,
      prixMensuel: Number(catalogue.prix),
      client,
    });

    const saved = await this.demandeRepository.save(demande);

    // ── EMAIL : Notifier l'admin entreprise de la nouvelle demande ──────────
    if (client.entreprise) {
      const admin = await this.clientRepository.findOne({
        where: {
          entreprise: { id: client.entreprise.id },
          role: RoleClient.ENTREPRISE_ADMIN,
        },
      });

      if (admin) {
        let specs = `${catalogue.vcpu} vCPU · ${catalogue.ramMB} GB RAM · ${catalogue.stockageGB} GB SSD`;
        if (catalogue.typeService === 'PAAS' && dto.typeSgbd) {
          specs = `Base de données : ${dto.typeSgbd} · ` + specs;
        }

        this.mailService.sendNouvelleDemandeAdmin({
          adminEmail: admin.email,
          adminPrenom: admin.prenom,
          userPrenom: client.prenom,
          userNom: client.nom,
          nomInstance: dto.nomInstanceSouhaite,
          justification: dto.justification,
          specs,
          demandeId: saved.id,
        });
      }
    }

    return saved;
  }

  /**
   * Récupérer toutes les demandes de l'entreprise de l'admin connecté
   */
  async findAllForAdmin(adminId: number): Promise<Demande[]> {
    const admin = await this.clientRepository.findOne({
      where: { id: adminId },
      relations: ['entreprise'],
    });

    if (!admin || !admin.entreprise) {
      throw new NotFoundException('Admin ou entreprise introuvable.');
    }

    return this.demandeRepository
      .createQueryBuilder('demande')
      .leftJoin('demande.client', 'client')
      .addSelect(['client.id', 'client.nom', 'client.prenom', 'client.email'])
      .leftJoinAndSelect('demande.catalogue', 'catalogue')
      .leftJoin('client.entreprise', 'entreprise')
      .addSelect(['entreprise.id', 'entreprise.nomEntreprise', 'entreprise.identifiantFiscal'])
      .where('entreprise.id = :entrepriseId', {
        entrepriseId: admin.entreprise.id,
      })
      .orderBy('demande.dateDemande', 'DESC')
      .getMany();
  }

  /**
   * Récupérer les demandes soumises par l'utilisateur connecté
   */
  async findMyDemandes(clientId: number): Promise<Demande[]> {
    return this.demandeRepository.find({
      where: { client: { id: clientId } },
      relations: ['catalogue'],
      order: { dateDemande: 'DESC' },
    });
  }

  /**
   * Récupérer le détail d'une demande (accessible à l'utilisateur propriétaire ou à l'admin)
   */
  async findOne(demandeId: number, requesterId: number): Promise<Demande> {
    const demande = await this.demandeRepository.findOne({
      where: { id: demandeId },
      relations: ['client', 'client.entreprise', 'catalogue'],
    });

    if (!demande) {
      throw new NotFoundException(`Demande #${demandeId} introuvable.`);
    }

    const requester = await this.clientRepository.findOne({
      where: { id: requesterId },
      relations: ['entreprise'],
    });

    if (!requester) throw new NotFoundException('Utilisateur introuvable.');

    const isOwner = demande.client.id === requesterId;
    const isAdminOfSameEntreprise =
      requester.role === RoleClient.ENTREPRISE_ADMIN &&
      requester.entreprise?.id === demande.client.entreprise?.id;

    if (!isOwner && !isAdminOfSameEntreprise) {
      throw new ForbiddenException(
        "Vous n'êtes pas autorisé à consulter cette demande.",
      );
    }

    return demande;
  }

  /**
   * Approuver ou refuser une demande — réservé à l'ENTREPRISE_ADMIN
   */
  async review(
    demandeId: number,
    adminId: number,
    dto: ReviewDemandeDto,
  ): Promise<Demande> {
    if (
      dto.status !== DemandeStatus.APPROUVEE &&
      dto.status !== DemandeStatus.REJETEE
    ) {
      throw new BadRequestException(
        'Le statut doit être APPROUVEE ou REJETEE.',
      );
    }

    const admin = await this.clientRepository.findOne({
      where: { id: adminId },
      relations: ['entreprise'],
    });

    if (!admin || admin.role !== RoleClient.ENTREPRISE_ADMIN) {
      throw new ForbiddenException(
        'Seul un admin entreprise peut approuver ou refuser une demande.',
      );
    }

    const demande = await this.demandeRepository.findOne({
      where: { id: demandeId },
      relations: ['client', 'client.entreprise'],
    });

    if (!demande) {
      throw new NotFoundException(`Demande #${demandeId} introuvable.`);
    }

    // Vérifier que la demande appartient bien à l'entreprise de l'admin
    if (demande.client.entreprise?.id !== admin.entreprise?.id) {
      throw new ForbiddenException(
        "Cette demande n'appartient pas à votre entreprise.",
      );
    }

    // Vérifier que la demande est encore en attente
    if (demande.status !== DemandeStatus.EN_ATTENTE) {
      throw new BadRequestException(
        'Cette demande a déjà été traitée.',
      );
    }

    demande.status = dto.status;
    demande.commentaireAdmin = dto.commentaireAdmin ?? undefined;

    return this.demandeRepository.save(demande);
  }

  /**
   * 1. BOUTON APPROUVER : Gestion du déploiement d'infrastructure
   * → Email succès ou échec vers l'utilisateur à la fin du provisionnement
   */
  async approuver(id: number, adminId: number, commentaireAdmin?: string): Promise<Demande> {
    const demande = await this.demandeRepository.findOne({
      where: { id },
      relations: ['catalogue', 'client'],
    });

    if (!demande) throw new NotFoundException(`Demande ${id} introuvable.`);
    if (demande.status !== DemandeStatus.EN_ATTENTE) {
      throw new BadRequestException("Cette demande a déjà été traitée.");
    }

    // SÉCURITÉ : On valide que le template est bien renseigné pour le IaaS
    if (demande.catalogue?.typeService === 'IAAS' && !demande.templateName) {
      throw new BadRequestException(
        "Impossible d'approuver : le nom du template OS est manquant pour cette demande IaaS.",
      );
    }

    // VÉRIFICATION DU SOLDE (Budget de l'entreprise)
    const adminWallet = await this.demandeRepository.manager.findOne(Wallet, {
      where: { user: { id: adminId } }
    });

    const solde = adminWallet ? Number(adminWallet.solde) : 0;
    const prixMensuelDemande = Number(demande.prixMensuel || 0);

    if (solde < prixMensuelDemande) {
      throw new BadRequestException(
        `Budget disponible insuffisant. Votre solde actuel est de ${solde} DT, ce qui ne couvre pas le coût de ${prixMensuelDemande} DT pour cette nouvelle machine.`
      );
    }

    // VÉRIFICATION DU NOM (Éviter les conflits pour ce client spécifique)
    const nomS = demande.nomInstanceSouhaite;
    const clientId = demande.client.id;
    const existingDbVm = await this.vmRepo.findOne({
      where: { nomPersonnalise: nomS, client: { id: clientId } }
    });
    if (existingDbVm) {
      const isOrphan = existingDbVm.status === ServiceStatus.FAILED ||
        existingDbVm.status === ServiceStatus.PROVISIONING;
      if (isOrphan) {
        await this.vmRepo.delete(existingDbVm.id);
      } else {
        throw new BadRequestException(
          `Impossible d'approuver : le client possède déjà une machine active nommée "${nomS}".`
        );
      }
    }

    // Infos réutilisées pour les emails
    const userEmail = demande.client.email;
    const userPrenom = demande.client.prenom;
    const userNom = demande.client.nom;
    let specs = demande.catalogue
      ? `${demande.catalogue.vcpu} vCPU · ${demande.catalogue.ramMB} GB RAM · ${demande.catalogue.stockageGB} GB SSD`
      : 'Spécifications non disponibles';

    if (demande.catalogue?.typeService === 'PAAS' && demande.typeSgbd) {
      specs = `Base de données : ${demande.typeSgbd} · ` + specs;
    }

    let savedVm: MachineVirtuelle | null = null;

    try {
      if (demande.catalogue?.typeService === 'SAAS') {
        // --- LOGIQUE SAAS ---
        // Le type d'app est TOUJOURS dérivé du catalogue pour éviter tout conflit
        // entre l'app demandée et le tarif du catalogue
        const nomService = (demande.catalogue.nomService || '').toLowerCase();
        const appTypeMap: Record<string, SaasAppType> = {
          'phpmyadmin': SaasAppType.PHPMYADMIN,
          'pgadmin': SaasAppType.PGADMIN,
          'wordpress': SaasAppType.WORDPRESS,
          'n8n': SaasAppType.N8N,
          'mongo express': SaasAppType.MONGO_EXPRESS,
          'mongo-express': SaasAppType.MONGO_EXPRESS,
          'mongoexpress': SaasAppType.MONGO_EXPRESS,
          'redis commander': SaasAppType.REDIS_INSIGHT,
          'redis-commander': SaasAppType.REDIS_INSIGHT,
          'rediscommander': SaasAppType.REDIS_INSIGHT,
          'redis insight': SaasAppType.REDIS_INSIGHT,
        };
        let resolvedAppType: SaasAppType | undefined;
        for (const [key, val] of Object.entries(appTypeMap)) {
          if (nomService.includes(key)) { resolvedAppType = val; break; }
        }
        if (!resolvedAppType) {
          throw new BadRequestException(
            `Impossible de déterminer le type d'application SaaS pour le catalogue "${demande.catalogue.nomService}". Vérifiez la configuration du catalogue.`
          );
        }

        await this.saasService.create({
          nomPersonnalise: demande.nomInstanceSouhaite,
          appType: resolvedAppType,
          adminEmail: demande.adminEmail,
          adminPassword: demande.adminPassword,
          catalogueId: demande.catalogue.id,
          clientId: demande.client.id,
          linkedPaasServiceId: demande.linkedPaasId ?? undefined,
        }, adminId);

      } else if (demande.catalogue?.typeService === 'PAAS') {
        // --- LOGIQUE PAAS ---
        await this.paasService.createDatabase({
          nomPersonnalise: demande.nomInstanceSouhaite,
          typeSgbd: (demande.typeSgbd as TypeSgbd) || (demande.catalogue.typeSgbd as TypeSgbd) || TypeSgbd.POSTGRESQL,
          clientId: demande.client.id,
          catalogueId: demande.catalogue.id,
        }, adminId);

      } else {
        // --- LOGIQUE IAAS ---
        // 1. Création de l'instance dans le système d'héritage (MachineVirtuelle)
        const nouvelleVM = this.vmRepo.create({
          nomPersonnalise: demande.nomInstanceSouhaite,
          status: ServiceStatus.PROVISIONING,
          vCPU: demande.catalogue?.vcpu || 0,
          ramGB: demande.catalogue?.ramMB || 0,
          stockageGB: demande.catalogue?.stockageGB || 0,
          os: demande.templateName,
          catalogue: demande.catalogue,
          prixMensuel: Number(demande.prixMensuel),
          client: demande.client,
        });
        savedVm = await this.vmRepo.save(nouvelleVM);

        // Nom unique garanti pour l'ESXi (évite les conflits globaux)
        const esxiName = `${demande.nomInstanceSouhaite}-${savedVm.id}`;

        // 2. Clonage de la VM sur VMware ESXi via ton service SOAP
        const vmRefId = await this.esxiService.cloneAndReconfigure(
          demande.templateName!,
          esxiName,
          (demande.catalogue?.ramMB || 0) * 1024,
          demande.catalogue?.vcpu || 0,
          demande.catalogue?.stockageGB || 0,
        );

        // 3. Mise à jour de la VM avec la référence
        savedVm.status = ServiceStatus.RUNNING;
        savedVm.vmReference = vmRefId;
        await this.vmRepo.save(savedVm);

        // --- DÉBIT DU WALLET ---
        if (prixMensuelDemande > 0) {
          try {
            await this.walletService.debiter(
              adminId,
              prixMensuelDemande,
              `Déploiement d'un service IaaS (Machine Virtuelle)`,
              savedVm.id
            );
          } catch (walletErr) {
            console.error(`⚠️ Impossible de débiter le wallet pour IaaS #${savedVm.id}:`, walletErr.message);
          }
        }
      }

      // C. Mise à jour de la demande
      demande.status = DemandeStatus.APPROUVEE;
      demande.commentaireAdmin = commentaireAdmin || "Demande acceptée et infrastructure déployée.";
      const result = await this.demandeRepository.save(demande);

      // ── EMAIL SUCCÈS : notifier l'utilisateur que son service est prêt ──────
      if (demande.catalogue?.typeService === 'SAAS') {
        // L'email SaaS est déjà envoyé par saasService.create() via sendProvisionningSuccesSaas
      } else {
        this.mailService.sendProvisionningSucces({
          userEmail,
          userPrenom,
          userNom,
          nomInstance: demande.nomInstanceSouhaite,
          specs,
          commentaireAdmin: demande.commentaireAdmin,
          typeService: demande.catalogue?.typeService,
        });
      }

      return result;

    } catch (error) {
      // Supprimer la VM orpheline créée en DB si le provisionnement ESXi a échoué
      if (savedVm && savedVm.id) {
        try {
          await this.vmRepo.delete(savedVm.id);
        } catch (deleteError) {
          console.error(`[DemandeService] Impossible de supprimer la VM orpheline #${savedVm.id} :`, deleteError.message);
        }
      }

      // La demande reste en attente pour permettre à l'administrateur de réessayer
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DemandeService] Échec du provisionnement ESXi pour la demande #${id} :`, errorMessage);
      throw new BadRequestException(`Échec du provisionnement. La demande n'a pas été rejetée, vous pouvez réessayer.`);
    }
  }

  /**
   * 2. BOUTON REJETER : Annulation pure et simple de la requête
   * → Email de refus vers l'utilisateur
   */
  async rejeter(id: number, adminId: number, commentaireAdmin: string): Promise<Demande> {
    const demande = await this.demandeRepository.findOne({
      where: { id },
      relations: ['client'],
    });

    if (!demande) throw new NotFoundException(`Demande ${id} introuvable.`);
    if (demande.status !== DemandeStatus.EN_ATTENTE) {
      throw new BadRequestException("Cette demande a déjà été traitée.");
    }

    if (!commentaireAdmin || commentaireAdmin.trim() === '') {
      throw new BadRequestException("Un commentaire est requis pour justifier le refus de la demande.");
    }

    demande.status = DemandeStatus.REJETEE;
    demande.commentaireAdmin = commentaireAdmin;
    const result = await this.demandeRepository.save(demande);

    // ── EMAIL REJET : notifier l'utilisateur que sa demande est refusée ──────
    this.mailService.sendDemandeRejetee({
      userEmail: demande.client.email,
      userPrenom: demande.client.prenom,
      nomInstance: demande.nomInstanceSouhaite,
      motif: commentaireAdmin,
    });

    return result;
  }
}

