import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { TypeSgbd } from 'src/enum/type-sgbd.enum';

export class CreatePaasDto {
    @IsNotEmpty()
    @IsString()
    nomPersonnalise!: string;

    @IsNotEmpty()
    @IsEnum(TypeSgbd)
    typeSgbd!: TypeSgbd;

    @IsNotEmpty()
    @IsNumber()
    clientId!: number;

    @IsNotEmpty()
    @IsNumber()
    catalogueId!: number;
}