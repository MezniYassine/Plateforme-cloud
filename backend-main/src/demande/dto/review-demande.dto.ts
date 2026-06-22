import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DemandeStatus } from '../entities/demande.entity';

export class ReviewDemandeDto {
  @IsEnum(DemandeStatus)
  status!: DemandeStatus.APPROUVEE | DemandeStatus.REJETEE;

  @IsOptional()
  @IsString()
  commentaireAdmin?: string;
}
