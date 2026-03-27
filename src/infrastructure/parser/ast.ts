import { parse } from 'shell-quote';

export function parseCommandAst(command: string): ReturnType<typeof parse> {
  return parse(command);
}
