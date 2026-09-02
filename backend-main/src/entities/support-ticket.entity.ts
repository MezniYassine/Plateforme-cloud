import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { TicketStatus } from 'src/enum/ticket-status.enum';
import { TicketCategory } from 'src/enum/ticket-category.enum';

@Entity('support_ticket')
export class SupportTicket {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  sujet!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({
    type: 'enum',
    enum: TicketCategory,
    default: TicketCategory.TECHNIQUE,
  })
  categorie!: TicketCategory;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    default: TicketStatus.OUVERT,
  })
  status!: TicketStatus;

  @Column({ type: 'text', nullable: true })
  reponseAdmin?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  dateReponse?: Date | null;

  @Column({ type: 'varchar', length: 150 })
  auteurNom!: string;

  @Column({ type: 'varchar', length: 150 })
  auteurEmail!: string;

  @Column({ type: 'varchar', length: 50 })
  auteurRole!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  entrepriseNom?: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'clientId' })
  client?: Client | null;

  @Column({ nullable: true })
  clientId?: number | null;

  @CreateDateColumn()
  dateCreation!: Date;

  @UpdateDateColumn()
  dateMiseAJour!: Date;
}
