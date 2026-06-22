import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Catalogue } from './entities/catalogue.entity'; // Vérifie que ce chemin est correct

@Injectable()
export class CatalogueService {
  constructor(
    @InjectRepository(Catalogue)
    private catalogueRepo: Repository<Catalogue>,
  ) {}

  // --- CREATE ---
  async create(data: Partial<Catalogue>): Promise<Catalogue> {
    const newCatalogue = this.catalogueRepo.create(data);
    return await this.catalogueRepo.save(newCatalogue);
  }

  // --- READ (Tous) ---
  async findAll(): Promise<Catalogue[]> {
    // Retourne toute la liste (pratique pour l'interface Admin)
    return await this.catalogueRepo.find();
  }

  // --- READ (Un seul pour le Client par exemple, que les actifs) ---
  async findActive(): Promise<Catalogue[]> {
    return await this.catalogueRepo.find({ where: { isActive: true } });
  }

  // --- READ (Un spécifiquement) ---
  async findOne(id: number): Promise<Catalogue> {
    const catalogue = await this.catalogueRepo.findOne({ where: { id } });
    
    // Sécurité : si l'ID n'existe pas dans la base
    if (!catalogue) {
      throw new NotFoundException(`L'offre Catalogue avec l'ID #${id} est introuvable.`);
    }
    
    return catalogue;
  }

  // --- UPDATE ---
  async update(id: number, updateData: Partial<Catalogue>): Promise<Catalogue> {
    // On réutilise findOne qui va vérifier si l'ID existe et lever une erreur sinon
    const catalogue = await this.findOne(id);
    
    // Fusionne les anciennes données avec les nouvelles
    Object.assign(catalogue, updateData);
    
    return await this.catalogueRepo.save(catalogue);
  }

  // --- DELETE (Suppression physique) ---
  async remove(id: number): Promise<void> {
    const catalogue = await this.findOne(id);
    await this.catalogueRepo.remove(catalogue);
  }

  // --- BONUS ADMIN : Activer/Désactiver au lieu de supprimer (Soft Delete) ---
  async toggleActive(id: number): Promise<Catalogue> {
    const catalogue = await this.findOne(id);
    catalogue.isActive = !catalogue.isActive; // Inverse l'état (true -> false ou false -> true)
    return await this.catalogueRepo.save(catalogue);
  }
}