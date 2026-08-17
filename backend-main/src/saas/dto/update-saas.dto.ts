import { PartialType } from '@nestjs/mapped-types';
import { CreateSaasDto } from './create-saas.dto';

export class UpdateSaasDto extends PartialType(CreateSaasDto) {}
