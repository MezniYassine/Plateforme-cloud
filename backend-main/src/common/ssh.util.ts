import { NodeSSH } from 'node-ssh';

export interface SshConnectOptions {
    host: string;
    username: string;
    password: string;
    port?: number;
    readyTimeout?: number;
    tryKeyboard?: boolean;
}

/**
 * Crée et connecte un client SSH en s'assurant que toutes les erreurs
 * (y compris ECONNRESET) sont correctement capturées et ne crashent pas le process.
 */
export async function createSshClient(options: SshConnectOptions): Promise<NodeSSH> {
    const ssh = new NodeSSH();

    await new Promise<void>((resolve, reject) => {
        // Intercepter les erreurs de socket AVANT même que connect() resolve/reject
        // car ECONNRESET peut être émis en dehors du cycle promise normal
        const onError = (err: Error) => reject(err);

        ssh.connect({
            host: options.host,
            username: options.username,
            password: options.password,
            port: options.port ?? 22,
            readyTimeout: options.readyTimeout ?? 15000,
            tryKeyboard: options.tryKeyboard ?? true,
            onKeyboardInteractive: (_name, _instructions, _lang, prompts, finish) => {
                finish(prompts.map(() => options.password));
            },
        }).then(() => resolve()).catch(onError);

        // Attacher un listener d'erreur direct sur le client ssh2 sous-jacent
        // pour capturer ECONNRESET avant qu'il devienne "unhandled"
        const rawClient = (ssh as any).connection;
        if (rawClient && typeof rawClient.on === 'function') {
            rawClient.once('error', onError);
        }
    });

    return ssh;
}

/**
 * Exécute une fonction avec une connexion SSH et garantit que
 * la connexion est toujours fermée, même en cas d'erreur.
 */
export async function withSsh<T>(
    options: SshConnectOptions,
    fn: (ssh: NodeSSH) => Promise<T>,
): Promise<T> {
    const ssh = await createSshClient(options);
    try {
        return await fn(ssh);
    } finally {
        try {
            ssh.dispose();
        } catch {
            // Ignorer les erreurs de fermeture
        }
    }
}
