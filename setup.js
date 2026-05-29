#!/usr/bin/env node

const path = require('path');
const { runSetup } = require('./lib/setup');

const baseDir = path.resolve(__dirname);

runSetup(baseDir).catch((err) => {
    console.error('Setup failed:', err);
    process.exit(1);
});
