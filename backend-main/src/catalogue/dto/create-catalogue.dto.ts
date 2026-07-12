import { IsString, IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCatalogueDto {
  @IsString()
  nomService!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vcpu!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ramMB!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockageGB!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prix!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
