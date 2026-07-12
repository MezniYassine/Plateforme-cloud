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
  ) { }

  /**
   * Soumission d'une demande par un utilisateur entreprise (ENTREPRISE_USER)
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
      status: DemandeStatus.EN_ATTENTE,
      catalogue,
      client,
    });

    return this.demandeRepository.save(demande);
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
    if (!demande.templateName) {
      throw new BadRequestException(
        "Impossible d'approuver : le nom du template OS est manquant pour cette demande IaaS.",
      );
    }

    // VÉRIFICATION DU NOM (Éviter les conflits pour ce client spécifique)
    const nomS = demande.nomInstanceSouhaite;
    const clientId = demande.client.id;
    const existingDbVm = await this.vmRepo.findOne({
      where: { nomPersonnalise: nomS, client: { id: clientId } }
    });
    if (existingDbVm) {
      // Si la VM existante est une orpheline (provisionnement précédent échoué),
      // on la supprime silencieusement pour autoriser la ré-approbation.
      const isOrphan = existingDbVm.status === ServiceStatus.FAILED ||
        existingDbVm.status === ServiceStatus.PROVISIONING;
      if (isOrphan) {
        await this.vmRepo.delete(existingDbVm.id);
      } else {
        // La VM est bien active (RUNNING / STOPPED) → conflit réel, on bloque.
        throw new BadRequestException(
          `Impossible d'approuver : le client possède déjà une machine active nommée "${nomS}".`
        );
      }
    }

    // Variable pour suivre la VM créée en DB, afin de pouvoir la supprimer en cas d'échec
    let savedVm: MachineVirtuelle | null = null;

    try {
      // 1. Création de l'instance dans le système d'héritage (MachineVirtuelle)
      const nouvelleVM = this.vmRepo.create({
        nomPersonnalise: demande.nomInstanceSouhaite,
        status: ServiceStatus.PROVISIONING,
        vCPU: demande.catalogue.vcpu,
        ramGB: demande.catalogue.ramMB,
        stockageGB: demande.catalogue.stockageGB,
        os: demande.templateName,
        catalogue: demande.catalogue,
        client: demande.client,
      });
      savedVm = await this.vmRepo.save(nouvelleVM);

      // Nom unique garanti pour l'ESXi (évite les conflits globaux)
      const esxiName = `${demande.nomInstanceSouhaite}-${savedVm.id}`;

      // 2. Clonage de la VM sur VMware ESXi via ton service SOAP
      const vmRefId = await this.esxiService.cloneAndReconfigure(
        demande.templateName,
        esxiName,
        demande.catalogue.ramMB * 1024,
        demande.catalogue.vcpu,
        demande.catalogue.stockageGB,
      );

      // 3. Mise à jour de la VM avec la référence
      savedVm.status = ServiceStatus.RUNNING;
      savedVm.vmReference = vmRefId;
      await this.vmRepo.save(savedVm);

      // C. Mise à jour de la demande
      demande.status = DemandeStatus.APPROUVEE;
      demande.commentaireAdmin = commentaireAdmin || "Demande acceptée et infrastructure déployée.";

      return await this.demandeRepository.save(demande);

    } catch (error) {
      // CORRECTION : Supprimer la VM orpheline créée en DB si le provisionnement ESXi a échoué.
      // Sans cette suppression, l'utilisateur verrait une VM dans son tableau de bord
      // même si sa demande a été rejetée suite à une erreur.
      if (savedVm && savedVm.id) {
        try {
          await this.vmRepo.delete(savedVm.id);
        } catch (deleteError) {
          // Log silencieux — l'erreur principale reste prioritaire
          console.error(`[DemandeService] Impossible de supprimer la VM orpheline #${savedVm.id} :`, deleteError.message);
        }
      }

      // En cas de panne de l'ESXi, la demande passe en échec automatiquement
      demande.status = DemandeStatus.REJETEE;
      demande.commentaireAdmin = `Échec de l'automatisation ESXi : ${error.message}`;
      await this.demandeRepository.save(demande);
      throw new BadRequestException(`Erreur critique lors du provisionnement : ${error.message}`);
    }
  }

  /**
   * 2. BOUTON REJETER : Annulation pure et simple de la requête
   */
  async rejeter(id: number, adminId: number, commentaireAdmin: string): Promise<Demande> {
    const demande = await this.demandeRepository.findOne({ where: { id } });

    if (!demande) throw new NotFoundException(`Demande ${id} introuvable.`);
    if (demande.status !== DemandeStatus.EN_ATTENTE) {
      throw new BadRequestException("Cette demande a déjà été traitée.");
    }

    if (!commentaireAdmin || commentaireAdmin.trim() === '') {
      throw new BadRequestException("Un commentaire est requis pour justifier le refus de la demande.");
    }

    demande.status = DemandeStatus.REJETEE;
    demande.commentaireAdmin = commentaireAdmin;

    return await this.demandeRepository.save(demande);
  }
}
