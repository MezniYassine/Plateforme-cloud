import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TicketStatus } from 'src/enum/ticket-status.enum';

export class ReplyTicketDto {
  @IsString({ message: 'La réponse doit être une chaîne de caractères.' })
  @IsOptional()
  @MaxLength(4000, { message: 'La réponse ne peut pas dépasser 4000 caractères.' })
  reponseAdmin?: string;

  @IsEnum(TicketStatus, { message: 'Le statut sélectionné est invalide.' })
  @IsOptional()
  status?: TicketStatus;
}
