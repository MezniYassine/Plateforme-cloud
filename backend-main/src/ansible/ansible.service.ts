import { Injectable, Logger, OnApplicationBootstrap, Optional, Inject, forwardRef } from '@nestjs/common';
import { withSsh } from 'src/common/ssh.util';
import { LogsService } from 'src/logs/logs.service';
import { LogSource } from 'src/enum/log-source.enum';
import * as path from 'path';

export interface AnsibleExecutionResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

@Injectable()
export class AnsibleService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnsibleService.name);

  private get workerIp(): string {
    return (process.env.PAAS_HOST_IP || '192.168.8.183').replace(/^"(.*)"$/, '$1').trim();
  }

  private get sshUser(): string {
    return (process.env.PAAS_SSH_USER || 'dbaas').replace(/^"(.*)"$/, '$1').trim();
  }

  private get sshPass(): string {
    return (process.env.PAAS_SSH_PASS || '123456789').replace(/^"(.*)"$/, '$1').trim();
  }

  private readonly remoteAnsibleDir = '/opt/dynamix/ansible';

  constructor(
    @Optional()
    @Inject(forwardRef(() => LogsService))
    private readonly logsService?: LogsService,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Initialisation du moteur Ansible sur le worker...');
    // Synchronisation asynchrone non-bloquante au démarrage
    setTimeout(() => {
      this.syncAnsibleDirectory().catch((err) => {
        this.logger.warn(`Synchronisation initiale Ansible différée : ${err.message}`);
      });
    }, 5000);
  }

  /**
   * Synchronise les playbooks et rôles locaux vers le worker distant
   */
  async syncAnsibleDirectory(): Promise<void> {
    const localAnsibleDir = path.resolve(process.cwd(), '..', 'InfraStructure', 'ansible');
    const sshOptions = {
      host: this.workerIp,
      username: this.sshUser,
      password: this.sshPass,
      readyTimeout: 10000,
    };

    try {
      await withSsh(sshOptions, async (ssh) => {
        await ssh.execCommand(`echo ${this.sshPass} | sudo -S mkdir -p ${this.remoteAnsibleDir} && echo ${this.sshPass} | sudo -S chown -R ${this.sshUser}:${this.sshUser} /opt/dynamix`);
        await ssh.putDirectory(localAnsibleDir, this.remoteAnsibleDir, {
          recursive: true,
          concurrency: 10,
        });
      });
      this.logger.log(`✅ Recettes Ansible synchronisées avec succès sur le worker (${this.workerIp}:${this.remoteAnsibleDir})`);
    } catch (error: any) {
      this.logger.error(`❌ Échec de la synchronisation des playbooks Ansible : ${error.message}`);
      throw error;
    }
  }

  /**
   * Exécute un playbook Ansible avec variables déclaratives
   */
  async runPlaybook(playbookName: string, extraVars: Record<string, any>): Promise<AnsibleExecutionResult> {
    const sshOptions = {
      host: this.workerIp,
      username: this.sshUser,
      password: this.sshPass,
      readyTimeout: 15000,
    };

    // Échappement propre du JSON de variables
    const jsonVars = JSON.stringify(extraVars);
    const escapedVars = jsonVars.replace(/'/g, "'\\''");

    const command = `cd ${this.remoteAnsibleDir} && ansible-playbook -i inventory/hosts.ini -l localhost playbooks/${playbookName} --extra-vars '${escapedVars}'`;

    this.logger.log(`🚀 Exécution Ansible : playbooks/${playbookName} (instance: ${extraVars.instance_name || 'N/A'})`);

    try {
      return await withSsh(sshOptions, async (ssh) => {
        const result = await ssh.execCommand(command);

        if (result.code !== 0) {
          this.logger.error(`❌ Erreur Ansible sur playbooks/${playbookName} (Code ${result.code}) :\n${result.stderr || result.stdout}`);
          await this.logsService?.logCritical(
            LogSource.DOCKER,
            `Échec de l'exécution du playbook Ansible ${playbookName}`,
            `Code de retour: ${result.code}\nSortie: ${result.stdout}\nErreur: ${result.stderr}`,
            { resourceName: extraVars.instance_name }
          );
          return {
            success: false,
            code: result.code ?? 1,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        }

        this.logger.log(`✅ Succès de l'orchestration Ansible playbooks/${playbookName} pour ${extraVars.instance_name || 'instance'}`);
        return {
          success: true,
          code: 0,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      });
    } catch (error: any) {
      this.logger.error(`❌ Échec SSH lors de l'exécution Ansible : ${error.message}`);
      throw error;
    }
  }
}
