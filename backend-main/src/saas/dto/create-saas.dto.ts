import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Matches } from 'class-validator';
import { SaasAppType } from 'src/enum/saas-app-type.enum';

export class CreateSaasDto {
    @IsNotEmpty()
    @IsString()
    @Length(3, 32, { message: "Le nom d'instance doit contenir entre 3 et 32 caractères." })
    @Matches(/^[a-zA-Z0-9_-]+$/, { message: "Le nom d'instance ne peut contenir que des lettres, des chiffres, des tirets (-) et des underscores (_)." })
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
