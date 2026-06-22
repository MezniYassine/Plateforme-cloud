import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { Client } from './client.entity';

@Entity()
export class Entreprise {
  // Clé primaire ET clé étrangère
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nomEntreprise!: string;

  @Column({ unique: true })
  identifiantFiscal!: string;

  @CreateDateColumn()
  dateCreation!: Date;

  @Column()
  maxUtilisateurs!: number;

  @OneToMany(() => Client, (client) => client.entreprise)
  clients!: Client[];

}