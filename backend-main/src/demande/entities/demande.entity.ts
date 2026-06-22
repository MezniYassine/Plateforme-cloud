import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { Client } from 'src/entities/client.entity';

export enum DemandeStatus {
    EN_ATTENTE = 'EN_ATTENTE',
    APPROUVEE = 'APPROUVEE',
    REJETEE = 'REJETEE'
}

@Entity('demandes')
export class Demande {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nomInstanceSouhaite!: string;

    @Column({
        type: 'enum',
        enum: DemandeStatus,
        default: DemandeStatus.EN_ATTENTE
    })
    status!: DemandeStatus;

    @Column('text')
    justification!: string;

    @Column({ nullable: true })
    commentaireAdmin?: string;

    @CreateDateColumn()
    dateDemande!: Date;


    @Column({ nullable: true })
    templateName?: string;

    @Column({ nullable: true })
    versionPaas?: string;


    @ManyToOne(() => Catalogue, { eager: true })
    catalogue!: Catalogue;

    @ManyToOne(() => Client)
    client!: Client;
}