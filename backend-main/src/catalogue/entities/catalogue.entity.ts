import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('catalogues')
export class Catalogue {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nomService!: string;

  @Column('text', { nullable: true })
  description!: string;

  @Column({ type: 'float', default: 0 })
  vcpu!: number;

  @Column({ type: 'float', default: 0 })
  ramMB!: number;

  @Column({ type: 'float', default: 0 })
  stockageGB!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.00 })
  prix!: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', nullable: true })
  typeSgbd!: string;

  @Column({ type: 'varchar', nullable: true })
  typeService!: string;
}