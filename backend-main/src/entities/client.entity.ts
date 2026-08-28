import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne, ManyToOne, JoinColumn,
  OneToMany
} from 'typeorm';
import { Personal } from './personal.entity';
import { Entreprise } from './entreprise.entity';
import { RoleClient } from 'src/enum/role-client.enum';
import { AccountStatus } from 'src/enum/account-status.enum';
import { MFAStatus } from 'src/enum/mfa-status.enum';
import { ServiceInstance } from './serviceInstance.entity';
import { Wallet } from './wallet.entity';


@Entity('client')
export class Client {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nom!: string;

  @Column()
  prenom!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  password!: string | null;

  @Column({ type: 'varchar', nullable: true })
  telephone?: string | null;

  // --- NOUVEAU : Rôle de l'utilisateur ---
  @Column({ type: 'enum', enum: RoleClient, default: RoleClient.PERSONNEL })
  role!: RoleClient;

  // Statut d'approbation
  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.PENDING_VALIDATION })
  status!: AccountStatus;

  // Vérification de l'email
  @Column({ default: false })
  isEmailVerified!: boolean;

  @Column({ type: 'enum', enum: MFAStatus, default: MFAStatus.DESACTIVE })
  mfaStatus!: MFAStatus;

  // OTP pour la vérification MFA par email
  @Column({ type: 'varchar', nullable: true })
  otpCode!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  otpExpiry!: Date | null;

  @CreateDateColumn()
  dateInscrit!: Date;

  @Column({ type: 'simple-array', nullable: true })
  providers?: string[]; // 'local', 'google', ou 'microsoft'

  @Column({ type: 'simple-array', nullable: true })
  providerIds?: string[]; // L'ID unique fourni par Google/Microsoft


  // 1. Relation pour le Particulier (1 Client <-> 1 Profil Personnel)
  @OneToOne(() => Personal, (personal) => personal.client, { cascade: true, nullable: true })
  personal!: Personal;

  // 2. Relation pour l'Entreprise (Plusieurs Clients -> 1 Entreprise)
  // L'Admin de l'entreprise ET les employés pointeront vers la même entreprise
  @ManyToOne(() => Entreprise, (ent) => ent.clients, { cascade: true, nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entrepriseId' })
  entreprise!: Entreprise;

  @OneToMany(() => ServiceInstance, (service) => service.client)
  services!: ServiceInstance[];

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  @JoinColumn()
  wallet: Wallet;
}
