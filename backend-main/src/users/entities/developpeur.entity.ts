import { Entity, Column, PrimaryColumn, OneToOne, JoinColumn } from 'typeorm';
import { Client } from './client.entity';

@Entity()
export class Developpeur {
  // Clé primaire ET clé étrangère
  @PrimaryColumn()
  id: number;

  @Column()
  specialite: string;

  @OneToOne(() => Client, (client) => client.developpeur, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id' }) // Lie explicitement cette colonne à l'ID du Client
  client: Client;
}