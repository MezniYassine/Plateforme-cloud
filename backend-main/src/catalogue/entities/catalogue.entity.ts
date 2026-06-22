import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('catalogues')
export class Catalogue {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nomService!: string;

  @Column('text', { nullable: true })
  description!: string;

  @Column({ type: 'int' })
  vcpu!: number;

  @Column({ type: 'int' })
  ramMB!: number;

  @Column({ type: 'int' })
  stockageGB!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.00 })
  prix!: number;

  @Column({ default: true })
  isActive!: boolean;
}