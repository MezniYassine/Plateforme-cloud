import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne } from 'typeorm';
import { Developpeur } from './developpeur.entity';
import { Entreprise } from './entreprise.entity';

export enum MFAStatus {
  ACTIVE = 'ACTIVE',
  DESACTIVE = 'DESACTIVE',
}

@Entity()
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nom: string;

  @Column()
  prenom: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: MFAStatus, default: MFAStatus.DESACTIVE })
  mfaStatus: MFAStatus;

  @CreateDateColumn() // TypeORM gérera automatiquement cette date
  dateInscrit: Date;

  // Relations pour l'héritage CTI
  @OneToOne(() => Developpeur, (dev) => dev.client, { cascade: true, nullable: true })
  developpeur: Developpeur;

  @OneToOne(() => Entreprise, (ent) => ent.client, { cascade: true, nullable: true })
  entreprise: Entreprise;
}