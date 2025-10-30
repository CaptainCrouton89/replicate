import * as readline from 'readline';

/**
 * Prompt the user for input
 */
export async function prompt(message: string, options: { hide?: boolean } = {}): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (options.hide) {
      // For hidden input (like passwords), we need to handle it differently
      const stdin = process.stdin;
      const stdout = process.stdout;

      stdout.write(`${message}: `);

      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      let input = '';

      const onData = (char: string) => {
        char = char.toString();

        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl-D
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            stdout.write('\n');
            rl.close();
            resolve(input);
            break;
          case '\u0003': // Ctrl-C
            stdin.setRawMode(false);
            stdin.pause();
            process.exit(130);
            break;
          case '\u007f': // Backspace
          case '\u0008': // Backspace
            if (input.length > 0) {
              input = input.slice(0, -1);
            }
            break;
          default:
            input += char;
            break;
        }
      };

      stdin.on('data', onData);
    } else {
      rl.question(`${message}: `, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

/**
 * Prompt the user for confirmation (y/n)
 */
export async function confirm(message: string): Promise<boolean> {
  const answer = await prompt(`${message} (y/n)`);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}
