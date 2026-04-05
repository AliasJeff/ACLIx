import { ReplEngine } from '../../repl/engine.js';
import { SessionManager } from '../../repl/session.js';
import { createSlashRegistry } from '../../repl/slash/index.js';
import { requireAuth } from '../middlewares/index.js';

export async function replAction(): Promise<void> {
  requireAuth();

  const session = new SessionManager(process.cwd());
  session.init();

  const slashRegistry = createSlashRegistry();
  const engine = new ReplEngine(session, slashRegistry);
  await engine.start();
}
