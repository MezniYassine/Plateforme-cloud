import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { Developpeur } from './entities/developpeur.entity';
import { Entreprise } from './entities/entreprise.entity';
import { UserC } from './entities/userC.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
    @InjectRepository(Developpeur)
    private developpeurRepo: Repository<Developpeur>,
    @InjectRepository(Entreprise)
    private entrepriseRepo: Repository<Entreprise>,
    @InjectRepository(UserC)
    private userCRepo: Repository<UserC>,
  ) { }

  /** Find a user by email (used by AuthService for login) */
  async findByEmail(email: string): Promise<Client | null> {
    return this.clientRepo.findOne({ where: { email } });
  }

  /** Get all users */
  async findAll(): Promise<Client[]> {
    return this.clientRepo.find();
  }

  /** Legacy generic create (kept for backward compatibility) */
  async create(userData: Partial<Client>): Promise<Client> {
    const newUser = this.clientRepo.create(userData);
    return this.clientRepo.save(newUser);
  }

  /** Create a Client + Entreprise atomically */
  async createEnterprise(data: {
    nom: string;
    prenom: string;
    email: string;
    password: string;
    companyName: string;
    taxId: string;
    createdAt: string;
  }): Promise<Client> {
    // 1. Save Client base row
    const client = this.clientRepo.create({
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      password: data.password,
    });
    const savedClient = await this.clientRepo.save(client);

    // 2. Save Entreprise row referencing the Client id
    const entreprise = this.entrepriseRepo.create({
      id: savedClient.id,
      nomEntreprise: data.companyName,
      identifiantFiscal: Number(data.taxId),
      maxUtilisateurs: 10, // default quota
    });
    await this.entrepriseRepo.save(entreprise);

    return savedClient;
  }

  /** Create a Client + Developpeur atomically */
  async createDeveloper(data: {
    nom: string;
    prenom: string;
    email: string;
    password: string;
    techStack: string;
  }): Promise<Client> {
    // 1. Save Client base row
    const client = this.clientRepo.create({
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      password: data.password,
    });
    const savedClient = await this.clientRepo.save(client);

    // 2. Save Developpeur row referencing the Client id
    const dev = this.developpeurRepo.create({
      id: savedClient.id,
      specialite: data.techStack,
    });
    await this.developpeurRepo.save(dev);

    return savedClient;
  }

  async createUserC(data: {
    nom: string;
    prenom: string;
    email: string;
    password: string;
  }): Promise<UserC> {
    const user = this.userCRepo.create({
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      password: data.password,
    });
    const savedUser = await this.userCRepo.save(user);
    return savedUser;
  }
}