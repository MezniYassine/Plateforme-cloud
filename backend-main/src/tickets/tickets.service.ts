import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket } from 'src/entities/support-ticket.entity';
import { Client } from 'src/entities/client.entity';
import { Admin } from 'src/entities/admin.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { TicketCategory } from 'src/enum/ticket-category.enum';
import { TicketStatus } from 'src/enum/ticket-status.enum';

/**
 * Nettoyage et assainissement strict des chaînes de caractères pour éliminer tout danger :
 * - Suppression des octets nuls (\0)
 * - Élimination des balises exécutables (script, iframe, style, event handlers)
 * - Échappement des caractères HTML dangereux
 * - Troncature selon la longueur maximale
 */
function sanitizeInput(input: string | undefined | null, maxLen = 3000): string {
  if (!input || typeof input !== 'string') return '';

  return (
    input
      // Supprimer les octets nuls
      .replace(/\0/g, '')
      // Supprimer les scripts et iframes dangereux
      .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      // Échapper les balises HTML brutes
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim()
      .slice(0, maxLen)
  );
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
  ) {}

  /**
   * Création d'un ticket de support avec validation et sanitisation des entrées
   */
  async create(userId: number, dto: CreateTicketDto): Promise<SupportTicket> {
    if (!userId || isNaN(Number(userId))) {
      throw new BadRequestException('Identifiant utilisateur invalide.');
    }

    const cleanSujet = sanitizeInput(dto.sujet, 150);
    const cleanMessage = sanitizeInput(dto.message, 3000);

    if (!cleanSujet || cleanSujet.length < 3) {
      throw new BadRequestException(
        'Le sujet de la demande doit contenir au moins 3 caractères valides.',
      );
    }

    if (!cleanMessage || cleanMessage.length < 10) {
      throw new BadRequestException(
        'Le message doit contenir au moins 10 caractères explicatifs.',
      );
    }

    // Validation stricte de la catégorie
    const validCategories = Object.values(TicketCategory);
    const categorie =
      dto.categorie && validCategories.includes(dto.categorie)
        ? dto.categorie
        : TicketCategory.TECHNIQUE;

    const client = await this.clientRepo.findOne({
      where: { id: userId },
      relations: ['entreprise'],
    });

    let auteurNom = 'Utilisateur';
    let auteurEmail = 'email@inconnu.com';
    let auteurRole = 'PERSONNEL';
    let entrepriseNom: string | null = null;
    let clientEntity: Client | null = null;

    if (client) {
      clientEntity = client;
      auteurNom = sanitizeInput(
        `${client.prenom || ''} ${client.nom || ''}`.trim() || 'Utilisateur',
        100,
      );
      auteurEmail = sanitizeInput(client.email, 120);
      auteurRole = client.role ? String(client.role) : 'PERSONNEL';
      entrepriseNom = client.entreprise
        ? sanitizeInput(client.entreprise.nomEntreprise, 150)
        : null;
    } else {
      const admin = await this.adminRepo.findOne({ where: { id: userId } });
      if (admin) {
        auteurNom = sanitizeInput(
          `${admin.prenom || ''} ${admin.nom || ''}`.trim() || 'Admin',
          100,
        );
        auteurEmail = sanitizeInput(admin.email, 120);
        auteurRole = 'ADMIN';
      }
    }

    const ticket = this.ticketRepo.create({
      sujet: cleanSujet,
      message: cleanMessage,
      categorie,
      status: TicketStatus.OUVERT,
      auteurNom,
      auteurEmail,
      auteurRole,
      entrepriseNom,
      client: clientEntity,
      clientId: clientEntity ? clientEntity.id : null,
    });

    return this.ticketRepo.save(ticket);
  }

  /**
   * Récupérer les tickets de l'utilisateur connecté
   */
  async findMyTickets(userId: number): Promise<SupportTicket[]> {
    if (!userId || isNaN(Number(userId))) {
      return [];
    }

    const client = await this.clientRepo.findOne({ where: { id: userId } });
    if (!client) {
      return this.ticketRepo.find({
        where: { clientId: userId },
        order: { dateCreation: 'DESC' },
      });
    }

    return this.ticketRepo.find({
      where: [{ clientId: userId }, { auteurEmail: client.email }],
      order: { dateCreation: 'DESC' },
    });
  }

  /**
   * Récupérer tous les tickets pour l'Admin Global avec filtres et recherche sécurisés
   */
  async findAllForAdmin(
    status?: string,
    search?: string,
  ): Promise<SupportTicket[]> {
    const qb = this.ticketRepo.createQueryBuilder('ticket');

    // Validation du statut contre l'énumération
    const validStatuses = Object.values(TicketStatus) as string[];
    if (status && status !== 'ALL' && validStatuses.includes(status)) {
      qb.andWhere('ticket.status = :status', { status });
    }

    // Protection contre l'injection de caractères jokers SQL (LIKE)
    if (search && typeof search === 'string' && search.trim()) {
      const sanitizedSearch = sanitizeInput(search, 100).toLowerCase();
      // Échapper %, _ et \ pour éviter l'injection de wildcards
      const escapedSearch = sanitizedSearch.replace(/[%_\\]/g, '\\$&');
      const s = `%${escapedSearch}%`;

      qb.andWhere(
        '(LOWER(ticket.sujet) LIKE :s OR LOWER(ticket.auteurNom) LIKE :s OR LOWER(ticket.auteurEmail) LIKE :s OR LOWER(ticket.entrepriseNom) LIKE :s OR LOWER(ticket.message) LIKE :s)',
        { s },
      );
    }

    qb.orderBy('ticket.dateCreation', 'DESC');
    return qb.getMany();
  }

  /**
   * Obtenir les statistiques globales des tickets
   */
  async getAdminStats(): Promise<{
    total: number;
    ouvert: number;
    enCours: number;
    resolu: number;
    ferme: number;
  }> {
    const [total, ouvert, enCours, resolu, ferme] = await Promise.all([
      this.ticketRepo.count(),
      this.ticketRepo.count({ where: { status: TicketStatus.OUVERT } }),
      this.ticketRepo.count({ where: { status: TicketStatus.EN_COURS } }),
      this.ticketRepo.count({ where: { status: TicketStatus.RESOLU } }),
      this.ticketRepo.count({ where: { status: TicketStatus.FERME } }),
    ]);

    return { total, ouvert, enCours, resolu, ferme };
  }

  /**
   * Répondre à un ticket et mettre à jour son statut (Admin Global) avec sanitisation
   */
  async reply(ticketId: number, dto: ReplyTicketDto): Promise<SupportTicket> {
    const id = Number(ticketId);
    if (!id || isNaN(id) || id <= 0) {
      throw new BadRequestException('Identifiant de ticket invalide.');
    }

    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Ticket #${id} introuvable.`);
    }

    if (dto.reponseAdmin !== undefined) {
      const cleanReply = sanitizeInput(dto.reponseAdmin, 4000);
      ticket.reponseAdmin = cleanReply;
      ticket.dateReponse = new Date();
    }

    const validStatuses = Object.values(TicketStatus);
    if (dto.status && validStatuses.includes(dto.status)) {
      ticket.status = dto.status;
    } else if (dto.reponseAdmin && ticket.status === TicketStatus.OUVERT) {
      ticket.status = TicketStatus.RESOLU;
    }

    return this.ticketRepo.save(ticket);
  }
}
