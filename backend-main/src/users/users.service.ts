import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../entities/client.entity';
import { Personal } from '../entities/personal.entity';
import { Entreprise } from '../entities/entreprise.entity';
import { Admin } from '../entities/admin.entity';
import { RoleClient } from 'src/enum/role-client.enum';
import { AccountStatus } from 'src/enum/account-status.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
    @InjectRepository(Personal)
    private personalRepo: Repository<Personal>,
    @InjectRepository(Entreprise)
    private entrepriseRepo: Repository<Entreprise>,
    @InjectRepository(Admin)
    private adminRepo: Repository<Admin>,
  ) { }

  async findByEmail(email: string): Promise<Client | null> {
    return this.clientRepo.findOne({
      where: { email },
      relations: ['entreprise', 'personal']
    });
  }

  async findAdminByEmail(email: string): Promise<Admin | null> {
    return this.adminRepo.findOne({ where: { email } });
  }

  async findByTaxId(taxId: string): Promise<Entreprise | null> {
    return this.entrepriseRepo.findOne({ where: { identifiantFiscal: taxId } });
  }

  /** Get all users */
  async findAll(): Promise<Client[]> {
    return this.clientRepo.find({ relations: ['entreprise', 'personal'] });
  }

  /** Legacy generic create (kept for backward compatibility) */
  async create(userData: Partial<Client>): Promise<Client> {
    const newUser = this.clientRepo.create(userData);
    return this.clientRepo.save(newUser);
  }

  /** Update user status */
  async updateStatus(id: number, status: AccountStatus): Promise<Client> {
    const client = await this.clientRepo.findOne({ where: { id } });
    if (!client) {
      throw new Error('Client not found');
    }
    client.status = status;
    return this.clientRepo.save(client);
  }

  /** Create an Entreprise and its first Admin atomically */
  async createEnterprise(data: {
    nom: string;
    prenom: string;
    email: string;
    password: string;
    companyName: string;
    taxId: string;
  }): Promise<Client> {
    // 1. On crée l'Entreprise en premier (elle obtient son propre ID)
    const entreprise = this.entrepriseRepo.create({
      nomEntreprise: data.companyName,
      identifiantFiscal: data.taxId,
      maxUtilisateurs: 10,
    });
    const savedEntreprise = await this.entrepriseRepo.save(entreprise);

    // 2. On crée le Client Admin et on le relie à l'entreprise
    const client = this.clientRepo.create({
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      password: data.password,
      role: RoleClient.ENTREPRISE_ADMIN, // Assigne le rôle Admin
      entreprise: savedEntreprise,       // Lie le client à l'entreprise
    });

    return this.clientRepo.save(client);
  }

  /** Create a Personal user (Particulier) atomically */
  async createPersonal(data: {
    nom: string;
    prenom: string;
    email: string;
    password: string;
    profession: string;
  }): Promise<Client> {
    // 1. On crée le Client de base
    const client = this.clientRepo.create({
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      password: data.password,
      role: RoleClient.PERSONNEL, // Assigne le rôle Personnel
    });
    const savedClient = await this.clientRepo.save(client);

    // 2. On crée le profil Personal avec le MÊME ID (Clé partagée)
    const personalProfile = this.personalRepo.create({
      id: savedClient.id, // ID explicite pour la relation 1:1
      profession: data.profession,
    });
    await this.personalRepo.save(personalProfile);

    // Optionnel : on attache l'objet pour le retour propre de la fonction
    savedClient.personal = personalProfile;
    return savedClient;
  }
}