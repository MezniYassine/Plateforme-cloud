import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  /**
   * POST /tickets
   * Soumission d'un nouveau ticket par un utilisateur
   */
  @Post()
  create(@Request() req: any, @Body() dto: CreateTicketDto) {
    const userId: number = req.user.sub;
    return this.ticketsService.create(userId, dto);
  }

  /**
   * GET /tickets/my
   * Récupérer tous les tickets de l'utilisateur connecté
   */
  @Get('my')
  findMyTickets(@Request() req: any) {
    const userId: number = req.user.sub;
    return this.ticketsService.findMyTickets(userId);
  }

  /**
   * GET /tickets/admin/stats
   * Statistiques des tickets pour l'admin global
   */
  @Get('admin/stats')
  getAdminStats() {
    return this.ticketsService.getAdminStats();
  }

  /**
   * GET /tickets/admin/all
   * Liste de tous les tickets pour l'admin global avec filtres
   */
  @Get('admin/all')
  findAllForAdmin(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.ticketsService.findAllForAdmin(status, search);
  }

  /**
   * PATCH /tickets/admin/:id/reply
   * Répondre à un ticket et actualiser son statut
   */
  @Patch('admin/:id/reply')
  reply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.ticketsService.reply(id, dto);
  }
}
