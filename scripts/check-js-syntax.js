#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.cache', 'coverage']);
const ESM_CONFIG_SKIP = new Set([
    path.join('client', 'postcss.config.js'),
    path.join('client', 'tailwind.config.js'),
    path.join('client', 'vite.config.js'),
]);

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

const files = walk(ROOT).sort();
const failures = [];

function hasEsmSyntax(source) {
    return /^\s*(import|export)\s/m.test(source) || /\bexport\s+default\b/.test(source);
}

function checkCommonJsSyntax(source, file) {
    const cleaned = source.startsWith('#!') ? source.replace(/^#!.*\r?\n/, '') : source;
    const wrapped = `(function (exports, require, module, __filename, __dirname) {\n${cleaned}\n});`;
    new vm.Script(wrapped, { filename: file });
}

function checkEsmSyntax(source, file) {
    if (typeof vm.SourceTextModule !== 'function') return false;
    new vm.SourceTextModule(source, { identifier: file });
    return true;
}

for (const file of files) {
    try {
        const source = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT, file);
        if (ESM_CONFIG_SKIP.has(rel)) {
            console.log(`[check-js-syntax] SKIPPED: ${rel}`);
        } else if (hasEsmSyntax(source)) {
            if (!checkEsmSyntax(source, file)) {
                throw new Error('ESM parser unavailable in this runtime');
            }
        } else {
            checkCommonJsSyntax(source, file);
        }
    } catch (err) {
        failures.push(file);
        if (err && err.stack) {
            process.stderr.write(`${err.stack}\n`);
        } else if (err) {
            process.stderr.write(`${String(err)}\n`);
        }
        console.error(`[check-js-syntax] FAILED: ${path.relative(ROOT, file)}`);
    }
}

if (failures.length) {
    console.error(`\n[check-js-syntax] ${failures.length}/${files.length} file(s) failed syntax checks.`);
    process.exit(1);
}

console.log(`[check-js-syntax] OK: ${files.length} JS file(s) parsed successfully.`);
