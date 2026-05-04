import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'src/entities/client.entity';

@Injectable()
export class EntrepriseUserService {
    constructor(
        @InjectRepository(Client)
        private readonly clientRepository: Repository<Client>,
    ) { }


    async getProfile(clientId: number) {
        return this.clientRepository.findOne({ where: { id: clientId }, relations: ['entreprise'] });
    }

}