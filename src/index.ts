import { cac } from 'cac';

import { registerAskCommand } from './presentation/commands/ask.js';
import { registerAutoCommand } from './presentation/commands/auto.js';
import { registerChatCommand } from './presentation/commands/chat.js';
import { registerConfigCommand } from './presentation/commands/config.js';
import { registerOnboardCommand } from './presentation/commands/onboard.js';
import { registerUsageCommand } from './presentation/commands/usage.js';
import { createLogger } from './infrastructure/logger/pino.js';

const cli = cac('aclix');
const logger = createLogger();

registerOnboardCommand(cli, logger);
registerAskCommand(cli, logger);
registerAutoCommand(cli, logger);
registerChatCommand(cli, logger);
registerConfigCommand(cli, logger);
registerUsageCommand(cli, logger);

cli.help();
cli.version('1.0.0');

void cli.parse();
