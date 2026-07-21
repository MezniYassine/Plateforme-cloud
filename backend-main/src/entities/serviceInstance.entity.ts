import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, TableInheritance, CreateDateColumn } from 'typeorm';
import { Client } from './client.entity'; // Assure-toi d'avoir cette entité
import { ServiceStatus } from 'src/enum/service-status.enum';


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

  @ManyToOne(() => Client, (client) => client.services)
  client!: Client;
}
