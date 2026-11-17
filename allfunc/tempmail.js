/**
 * allfunc/tempmail.js
 *
 * Disposable inbox backed by mail.tm (free, no API key, no signup).
 *
 * Why: the old code used 1secmail.com and apis.HansTz.my.id — both are dead
 * (connection never completes), so .tempmail / .checkmail / .readmail always
 * failed. mail.tm is a working open service with the same idea:
 *
 *   GET  /domains              -> available email domains
 *   POST /accounts             -> create a mailbox (address + password)
 *   POST /token                -> get a bearer token for that mailbox
 *   GET  /messages             -> inbox list
 *   GET  /messages/{id}        -> one message (text/html body)
 *   DELETE /accounts/{id}      -> remove the mailbox
 *
 * Exports:
 *   createMailbox()            -> { address, password, token, accountId, domain }
 *   getInbox(token)            -> [{ id, from, subject, date, seen }]
 *   readMessage(token, id)     -> { id, from, subject, date, text, html }
 *   deleteMailbox(token, accountId) -> boolean
 */

const axios = require('axios');

const BASE = 'https://api.mail.tm';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) WhatsApp-Bot/1.0';

const http = axios.create({
  baseURL: BASE,
  timeout: 20000,
  headers: { 'User-Agent': UA, 'Accept': 'application/json' },
});

function randWord(len) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

// mail.tm returns either a plain JSON array or a Hydra collection
// ({ 'hydra:member': [...] }) depending on the Accept header — handle both.
function asList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data['hydra:member'])) return data['hydra:member'];
  if (data && Array.isArray(data.member)) return data.member;
  return [];
}

async function getDomain() {
  const { data } = await http.get('/domains');
  const list = asList(data);
  const active = list.find((d) => d.isActive !== false) || list[0];
  if (!active || !active.domain) throw new Error('mail.tm ne koi domain nahi diya');
  return active.domain;
}

async function createMailbox() {
  const domain = await getDomain();
  const address = 'cyber' + randWord(10) + '@' + domain;
  const password = 'Cy' + randWord(12) + '9!';

  const acc = await http.post('/accounts', { address, password }, {
    headers: { 'Content-Type': 'application/json' },
  });

  const accountId = acc.data && (acc.data.id || acc.data['@id']) ? acc.data.id : null;

  const tok = await http.post('/token', { address, password }, {
    headers: { 'Content-Type': 'application/json' },
  });
  const token = tok.data && tok.data.token;
  if (!token) throw new Error('mail.tm token nahi mila');

  return { address, password, token, accountId, domain };
}

async function getInbox(token) {
  const { data } = await http.get('/messages', {
    headers: { Authorization: 'Bearer ' + token },
  });
  const list = asList(data);
  return list.map((m) => ({
    id: m.id,
    from: (m.from && m.from.address) || m.from || 'unknown',
    subject: m.subject || '(no subject)',
    date: m.date || '',
    seen: Boolean(m.seen),
  }));
}

async function readMessage(token, id) {
  const { data } = await http.get('/messages/' + encodeURIComponent(id), {
    headers: { Authorization: 'Bearer ' + token },
  });
  return {
    id: data.id,
    from: (data.from && data.from.address) || 'unknown',
    subject: data.subject || '(no subject)',
    date: data.date || '',
    text: data.text || '',
    html: data.html || '',
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
  };
}

async function deleteMailbox(token, accountId) {
  if (!accountId) return false;
  try {
    await http.delete('/accounts/' + encodeURIComponent(accountId), {
      headers: { Authorization: 'Bearer ' + token },
    });
    return true;
  } catch (e) {
    console.warn('[tempmail] delete failed:', e.message);
    return false;
  }
}

module.exports = { createMailbox, getInbox, readMessage, deleteMailbox, getDomain };
