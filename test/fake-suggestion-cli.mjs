import fs from 'node:fs';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
let input = ''; for await (const chunk of process.stdin) input += chunk;
const prompt = args.includes('--input-format') ? JSON.parse(input).message.content : input;
if (prompt.startsWith('Predict ONE next message')) {
  const text = '예시 하나로 더 설명해줘.';
  if (args.includes('--output-last-message')) fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], text);
  else if (args.includes('--mode')) console.log(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: text } }));
  else console.log(JSON.stringify({ result: text }));
} else {
  const child = spawn(process.execPath, [new URL('./fake-cli.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), ...args], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
  child.stdin.end(input); child.on('exit', code => process.exit(code || 0));
}
