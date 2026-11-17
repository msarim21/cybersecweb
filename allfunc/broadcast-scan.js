'use strict';
// Builds the per-user auto broadcast list (axis_storage/broadcast_lists.json).
// case.js called require('./pair').autoScanBroadcastList, which never existed,
// so .bcscan / .bcrescan / .bcauto always failed.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'axis_storage', 'broadcast_lists.json');

function readAll() { try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch (_) { return {}; } }
function writeAll(d) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }

async function autoScanBroadcastList(sock, key, store, helpers = {}) {
  const list = [], seen = new Set();
  const add = (id, name, type) => { if (!id || seen.has(id)) return; seen.add(id); list.push({ id, name: name || id.split('@')[0], type }); };
  try {
    const groups = helpers.getAllGroups ? await helpers.getAllGroups(sock) : Object.entries(await sock.groupFetchAllParticipating() || {}).map(([id, g]) => ({ id, name: g.subject }));
    for (const g of groups) add(g.id, g.name, 'group');
  } catch (_) {}
  try {
    const users = helpers.getAllPrivateChats ? helpers.getAllPrivateChats(store) : [];
    const self = String(sock?.user?.id || '').split(':')[0];
    for (const u of users) if (!self || !u.id.startsWith(self + '@')) add(u.id, u.name, 'private');
  } catch (_) {}
  const all = readAll();
  all[key] = list;
  writeAll(all);
  return { total: list.length, privateChats: list.filter(e => e.type === 'private').length, groups: list.filter(e => e.type === 'group').length };
}

module.exports = { autoScanBroadcastList, readAll, FILE };
