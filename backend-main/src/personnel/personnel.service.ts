import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Personal } from 'src/entities/personal.entity';

@Injectable()
export class PersonnelService {
    constructor(
        @InjectRepository(Personal)
        private readonly personalRepository: Repository<Personal>,
    ) { }


    async getProfile(personalId: number) {
        return this.personalRepository.findOne({ where: { id: personalId }, relations: ['client'] });
    }

}