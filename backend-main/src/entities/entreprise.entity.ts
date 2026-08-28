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

  @Column({ type: 'varchar', nullable: true })
  tailleEntreprise?: string | null;

  @Column({ type: 'varchar', nullable: true })
  telephone?: string | null;

  @CreateDateColumn()
  dateCreation!: Date;

  @OneToMany(() => Client, (client) => client.entreprise)
  clients!: Client[];

}