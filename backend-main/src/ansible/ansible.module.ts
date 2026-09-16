import { Module, Global, forwardRef } from '@nestjs/common';
import { AnsibleService } from './ansible.service';
import { LogsModule } from 'src/logs/logs.module';

@Global()
@Module({
  imports: [forwardRef(() => LogsModule)],
  providers: [AnsibleService],
  exports: [AnsibleService],
})
export class AnsibleModule {}
