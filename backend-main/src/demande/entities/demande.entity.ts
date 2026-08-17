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

    @Column({ type: 'varchar', nullable: true })
    typeSgbd?: string;

    @Column({ type: 'varchar', nullable: true })
    appType?: string;

    @Column({ type: 'varchar', nullable: true })
    adminEmail?: string;

    @Column({ type: 'varchar', nullable: true })
    adminPassword?: string;

    @Column({ type: 'int', nullable: true })
    linkedPaasId?: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.00 })
    prixMensuel!: number;

    @ManyToOne(() => Catalogue, { nullable: true, eager: true, onDelete: 'SET NULL' })
    catalogue?: Catalogue | null;

    @ManyToOne(() => Client)
    client!: Client;
}