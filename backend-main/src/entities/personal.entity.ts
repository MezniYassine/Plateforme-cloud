import { Entity, Column, PrimaryColumn, OneToOne, JoinColumn } from 'typeorm';
import { Client } from './client.entity';

@Entity()
export class Personal {
  // Clé primaire ET clé étrangère
  @PrimaryColumn()
  id!: number;

  @Column()
  profession!: string;

  @OneToOne(() => Client, (client) => client.personal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id' }) // Lie explicitement cette colonne à l'ID du Client
  client!: Client;
}