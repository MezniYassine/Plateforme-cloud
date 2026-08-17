import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDemandeDto {
  @IsNotEmpty()
  @IsString()
  nomInstanceSouhaite!: string;

  @IsNotEmpty()
  @IsString()
  justification!: string;

  @IsNotEmpty()
  @IsNumber()
  catalogueId!: number;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  versionPaas?: string;

  @IsOptional()
  @IsString()
  typeSgbd?: string;

  @IsOptional()
  @IsString()
  appType?: string;

  @IsOptional()
  @IsString()
  adminEmail?: string;

  @IsOptional()
  @IsString()
  adminPassword?: string;

  @IsOptional()
  @IsNumber()
  linkedPaasId?: number;
}
