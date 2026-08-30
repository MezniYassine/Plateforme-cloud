import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { LogLevel } from 'src/enum/log-level.enum';
import { LogSource } from 'src/enum/log-source.enum';

@Entity('system_logs')
export class SystemLog {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: 'enum',
        enum: LogLevel,
        default: LogLevel.ERROR,
    })
    level!: LogLevel;

    @Column({
        type: 'enum',
        enum: LogSource,
        default: LogSource.SYSTEM,
    })
    source!: LogSource;

    @Column({ nullable: true })
    serviceType?: string; // 'IAAS' | 'PAAS' | 'SAAS' | 'SYSTEM'

    @Column({ nullable: true })
    resourceId?: string; // VM ID, PaaS ID, SaaS ID, container name

    @Column({ nullable: true })
    resourceName?: string;

    @Column({ nullable: true })
    clientEmail?: string;

    @Column({ type: 'text' })
    message!: string;

    @Column({ type: 'text', nullable: true })
    details?: string;

    @Column({ default: false })
    resolved!: boolean;

    @Column({ type: 'timestamp', nullable: true })
    resolvedAt?: Date;

    @CreateDateColumn()
    createdAt!: Date;
}
