import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum MetricResourceType {
    IAAS = 'IAAS',
    PAAS = 'PAAS',
    SAAS = 'SAAS',
}

@Entity('metrics')
@Index(['resourceType', 'resourceId', 'timestamp'])
export class Metric {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 20 })
    resourceType!: MetricResourceType | string;

    @Column({ type: 'varchar', length: 100 })
    resourceId!: string;

    @Column({ type: 'float', default: 0 })
    cpuUsage!: number;

    @Column({ type: 'float', default: 0 })
    ramUsage!: number;

    @Column({ type: 'float', nullable: true })
    diskUsageMb?: number;

    @CreateDateColumn({ type: 'timestamp' })
    timestamp!: Date;
}
