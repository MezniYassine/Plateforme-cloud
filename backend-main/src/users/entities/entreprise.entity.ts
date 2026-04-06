import { Entity, Column, PrimaryColumn, CreateDateColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { Client } from './client.entity';
import { UserC } from './userC.entity';

@Entity()
export class Entreprise {
  // Clé primaire ET clé étrangère
  @PrimaryColumn()
  id: number;

  @Column()
  nomEntreprise: string;

  @Column()
  identifiantFiscal: number;

  @CreateDateColumn() // TypeORM gérera automatiquement cette date
  dateCreation: Date;

  @Column()
  maxUtilisateurs: number;

  @OneToOne(() => Client, (client) => client.entreprise, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id' }) // Lie explicitement cette colonne à l'ID du Client
  client: Client;

  @OneToMany(() => UserC, (user) => user.entreprise)
  utilisateurs: UserC[];
}