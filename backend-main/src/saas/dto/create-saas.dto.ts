import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { SaasAppType } from 'src/enum/saas-app-type.enum';

export class CreateSaasDto {
    @IsNotEmpty()
    @IsString()
    nomPersonnalise!: string;

    @IsNotEmpty()
    @IsEnum(SaasAppType)
    appType!: SaasAppType;

    @IsNotEmpty()
    @IsNumber()
    clientId!: number;

    @IsNotEmpty()
    @IsNumber()
    catalogueId!: number;

    @IsOptional()
    @IsNumber()
    linkedPaasServiceId?: number;

    // Variables d'environnement spécifiques à certaines apps (ex: email pour pgAdmin)
    @IsOptional()
    @IsString()
    adminEmail?: string;

    @IsOptional()
    @IsString()
    adminPassword?: string;
}
