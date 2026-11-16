import { run } from './lib.mjs';
const [name, ...args] = process.argv.slice(2);
if (!['forge', 'cast', 'anvil'].includes(name)) throw new Error('Expected forge, cast or anvil');
run(name, args);
