import { ChildEntity, Column, JoinColumn, ManyToOne } from 'typeorm';
import { ServiceInstance } from './serviceInstance.entity';
import { ServicePaaS } from './servicePaaS.entity';

@ChildEntity()
export class ServiceSaaS extends ServiceInstance {

    @ManyToOne(() => ServicePaaS, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'paas_service_id' })
    linkedPaasService!: ServicePaaS;

    @Column({ nullable: true })
    ownerEmail?: string;

    @Column({ nullable: true })
    ownerPassword?: string;

}