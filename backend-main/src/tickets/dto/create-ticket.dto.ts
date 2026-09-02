import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TicketCategory } from 'src/enum/ticket-category.enum';

export class CreateTicketDto {
  @IsString({ message: 'Le sujet doit être une chaîne de caractères.' })
  @IsNotEmpty({ message: 'Le sujet de la demande est obligatoire.' })
  @MinLength(3, { message: 'Le sujet doit comporter au moins 3 caractères.' })
  @MaxLength(150, { message: 'Le sujet ne peut pas dépasser 150 caractères.' })
  sujet!: string;

  @IsString({ message: 'Le message doit être une chaîne de caractères.' })
  @IsNotEmpty({ message: 'Le message de la demande est obligatoire.' })
  @MinLength(10, { message: 'Le message doit comporter au moins 10 caractères.' })
  @MaxLength(3000, { message: 'Le message ne peut pas dépasser 3000 caractères.' })
  message!: string;

  @IsEnum(TicketCategory, { message: 'La catégorie sélectionnée est invalide.' })
  @IsOptional()
  categorie?: TicketCategory;
}
