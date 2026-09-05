import { IsEnum, IsNotEmpty, IsNumber, IsString, Length, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { TypeSgbd } from 'src/enum/type-sgbd.enum';

export class CreatePaasDto {
    @IsNotEmpty()
    @IsString()
    @Length(3, 32, { message: "Le nom d'instance doit contenir entre 3 et 32 caractères." })
    @Matches(/^[a-zA-Z0-9_-]+$/, { message: "Le nom d'instance ne peut contenir que des lettres, des chiffres, des tirets (-) et des underscores (_)." })
    nomPersonnalise!: string;

    @IsNotEmpty()
    @IsEnum(TypeSgbd)
    typeSgbd!: TypeSgbd;

    @IsNotEmpty()
    @Type(() => Number)
    @IsNumber()
    clientId!: number;

    @IsNotEmpty()
    @Type(() => Number)
    @IsNumber()
    catalogueId!: number;
}