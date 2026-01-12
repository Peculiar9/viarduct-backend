// run `node index.js` in the terminal
import 'reflect-metadata';
import './extensions/request-extension'; // Add this line
import { EnvironmentConfig } from './Infrastructure/Config/EnvironmentConfig';

console.log(`Hello Node.js v${process.versions.node}!`);
