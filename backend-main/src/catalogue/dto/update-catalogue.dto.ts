import { IsString, IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCatalogueDto {
  @IsOptional()
  @IsString()
  nomService?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vcpu?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ramMB?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockageGB?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prix?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
