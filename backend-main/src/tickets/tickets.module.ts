import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { SupportTicket } from 'src/entities/support-ticket.entity';
import { Client } from 'src/entities/client.entity';
import { Admin } from 'src/entities/admin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket, Client, Admin])],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
