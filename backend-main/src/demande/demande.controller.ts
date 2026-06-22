import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { DemandeService } from './demande.service';
import { CreateDemandeDto } from './dto/create-demande.dto';
import { ReviewDemandeDto } from './dto/review-demande.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('demande')
export class DemandeController {
  constructor(private readonly demandeService: DemandeService) { }

  /**
   * POST /demande
   * Soumission d'une nouvelle demande par l'utilisateur entreprise (ENTREPRISE_USER)
   * Body: { nomInstanceSouhaite, justification, catalogueId, templateName?, versionPaas? }
   */
  @Post()
  create(@Request() req: any, @Body() createDemandeDto: CreateDemandeDto) {
    const clientId: number = req.user.sub;
    return this.demandeService.create(clientId, createDemandeDto);
  }

  /**
   * GET /demande/mes-demandes
   * Liste des demandes soumises par l'utilisateur connecté
   */
  @Get('mes-demandes')
  getMyDemandes(@Request() req: any) {
    const clientId: number = req.user.sub;
    return this.demandeService.findMyDemandes(clientId);
  }

  /**
   * GET /demande/admin
   * Liste de toutes les demandes de l'entreprise — réservé à l'ENTREPRISE_ADMIN
   */
  @Get('admin')
  findAllForAdmin(@Request() req: any) {
    const adminId: number = req.user.sub;
    return this.demandeService.findAllForAdmin(adminId);
  }

  /**
   * GET /demande/:id
   * Détail d'une demande (accessible au propriétaire ou à l'admin entreprise)
   */
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    const requesterId: number = req.user.sub;
    return this.demandeService.findOne(id, requesterId);
  }

  /**
   * PATCH /demande/:id/review
   * Approuver ou refuser une demande — réservé à l'ENTREPRISE_ADMIN
   * Body: { status: 'APPROUVEE' | 'REJETEE', commentaireAdmin?: string }
   */
  @Patch(':id/review')
  review(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() reviewDto: ReviewDemandeDto,
  ) {
    const adminId: number = req.user.sub;
    return this.demandeService.review(id, adminId, reviewDto);
  }

  /**
   * PATCH /demande/:id/approuver
   * Approuver une demande -> Déclenche automatiquement le clonage ESXi
   */
  @Patch(':id/approuver')
  approuver(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body('commentaireAdmin') commentaireAdmin?: string,
  ) {
    const adminId: number = req.user.sub;
    return this.demandeService.approuver(id, adminId, commentaireAdmin);
  }

  /**
   * PATCH /demande/:id/rejeter
   * Rejeter une demande -> Annulation avec justification obligatoire
   */
  @Patch(':id/rejeter')
  rejeter(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body('commentaireAdmin') commentaireAdmin: string, // Obligatoire pour expliquer le refus
  ) {
    const adminId: number = req.user.sub;
    return this.demandeService.rejeter(id, adminId, commentaireAdmin);
  }
}
