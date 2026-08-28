import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, TableInheritance, CreateDateColumn } from 'typeorm';
import { Client } from './client.entity';
import { ServiceStatus } from 'src/enum/service-status.enum';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';

@Entity()
@TableInheritance({ column: { type: 'varchar', name: 'type' } })
export abstract class ServiceInstance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nomPersonnalise!: string;

  @Column({
    type: 'enum',
    enum: ServiceStatus,
    default: ServiceStatus.PROVISIONING
  })
  status!: ServiceStatus;

  @CreateDateColumn()
  dateCreation!: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.00 })
  prixMensuel!: number;

  @Column({ type: 'timestamp', nullable: true })
  dateProchaineFacturation!: Date | null;

  @Column({ type: 'int', nullable: true })
  port?: number | null;

  @Column({ type: 'text', nullable: true })
  connectionString!: string;

  @Column({ type: 'varchar', nullable: true })
  referenceFacture?: string;

  @ManyToOne(() => Client, (client) => client.services)
  client!: Client;

  @ManyToOne(() => Catalogue, { nullable: true, eager: false, onDelete: 'SET NULL' })
  catalogue?: Catalogue | null;
}
