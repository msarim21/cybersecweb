const axios = require('axios');

const UA = 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const DEFAULT_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const API_SOURCES = [
  {
    name: 'FAMOFC Live',
    buildUrl: (q) => `https://famofc.site/api/database.php?q=${encodeURIComponent(q)}`,
    priority: 100,
  },
  {
    name: 'FAMOFC 2026',
    buildUrl: (q) => `https://famofc.site/api/database.php?q=${encodeURIComponent(q)}&year=2026`,
    priority: 95,
  },
  {
    name: 'FAMOFC Fresh',
    buildUrl: (q) => `https://famofc.site/api/database.php?q=${encodeURIComponent(q)}&fresh=1`,
    priority: 90,
  },
  {
    name: 'AryanTools',
    buildUrl: (q) => `https://www.aryantools.pro/api/simdata?number=${encodeURIComponent(q)}`,
    priority: 50,
    timeout: 8000,
  },
  {
    name: 'AryanTools Alt',
    buildUrl: (q) => `https://aryantools.pro/api/simdata?number=${encodeURIComponent(q)}`,
    priority: 45,
    timeout: 8000,
  },
];

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatCnicDashed(cnic) {
  if (cnic.length !== 13) return null;
  return `${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}`;
}

function normalizeSimQuery(raw) {
  const input = String(raw || '').trim();
  const digits = digitsOnly(input);
  if (!digits) {
    return { type: 'invalid', display: input, variants: [] };
  }

  if (digits.length === 13) {
    const dashed = formatCnicDashed(digits);
    const variants = [...new Set([digits, dashed].filter(Boolean))];
    return { type: 'cnic', display: digits, variants };
  }

  let phone = digits;
  if (phone.startsWith('92') && phone.length === 12) phone = phone.slice(2);
  if (phone.startsWith('0') && phone.length === 11) phone = phone.slice(1);

  if (phone.length === 10 && /^3\d{9}$/.test(phone)) {
    const variants = [...new Set([
      phone,
      `0${phone}`,
      `92${phone}`,
      input,
      digits,
    ])];
    return { type: 'phone', display: phone, variants };
  }

  const variants = [...new Set([input, digits, phone].filter(Boolean))];
  return {
    type: digits.length >= 10 ? 'phone' : 'unknown',
    display: digits,
    variants,
  };
}

function isMaskedValue(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/^[\*\s\-_.]+$/.test(text)) return true;
  if (/^\*+$/.test(text.replace(/\s/g, ''))) return true;
  return false;
}

function pickField(record, keys) {
  for (const key of keys) {
    const val = record?.[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function normalizeRecord(record, sourceName, priority = 0) {
  const name = pickField(record, [
    'full_name', 'name', 'owner_name', 'registered_name', 'NAME', 'Name',
  ]);
  const phone = pickField(record, [
    'phone', 'mobile', 'number', 'MOBILE', 'MobileNo', 'Mobile Number', 'mobile_no',
  ]);
  const cnic = pickField(record, [
    'cnic', 'cnic_no', 'CNIC', 'cnic_number',
  ]);
  const address = pickField(record, [
    'address', 'addr', 'ADDRESS', 'Address',
  ]);
  const network = pickField(record, [
    'network', 'operator', 'sim', 'Network', 'Operator',
  ]);
  const year = pickField(record, ['year', 'reg_year', 'registration_year', 'updated_year']);
  const date = pickField(record, ['date', 'updated_at', 'registration_date', 'created_at']);

  if (isMaskedValue(name) && isMaskedValue(cnic) && isMaskedValue(address) && isMaskedValue(phone)) {
    return null;
  }

  const completeness = [name, phone, cnic, address, network].filter((v) => v && !isMaskedValue(v)).length;
  if (completeness === 0) return null;

  return {
    name: isMaskedValue(name) ? 'N/A' : name,
    phone: isMaskedValue(phone) ? 'N/A' : phone,
    cnic: isMaskedValue(cnic) ? 'N/A' : cnic,
    address: isMaskedValue(address) ? 'N/A' : address,
    network: isMaskedValue(network) ? 'N/A' : network,
    year: year || '',
    date: date || '',
    source: sourceName,
    priority,
    completeness,
  };
}

function extractRecords(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.result)) return payload.result;
  if (Array.isArray(payload.data?.records)) return payload.data.records;
  if (Array.isArray(payload.data?.result)) return payload.data.result;
  if (Array.isArray(payload.data?.results)) return payload.data.results;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function recordKey(record) {
  const phone = digitsOnly(record.phone);
  const cnic = digitsOnly(record.cnic);
  const name = String(record.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${phone}|${cnic}|${name}`;
}

function mergeRecords(existing, incoming) {
  const map = new Map();
  for (const rec of [...existing, ...incoming]) {
    const key = recordKey(rec);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, rec);
      continue;
    }
    const score = (r) => (r.completeness * 10) + (r.priority || 0) + (parseInt(r.year, 10) || 0);
    map.set(key, score(rec) >= score(prev) ? rec : prev);
  }
  return [...map.values()].sort((a, b) => {
    const score = (r) => (r.completeness * 10) + (r.priority || 0) + (parseInt(r.year, 10) || 0);
    return score(b) - score(a);
  });
}

async function fetchSource(source, query) {
  const url = source.buildUrl(query);
  const timeout = source.timeout || 12000;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await axios.get(url, {
        timeout,
        headers: DEFAULT_HEADERS,
        validateStatus: (status) => status >= 200 && status < 500,
        transitional: { clarifyTimeoutError: true },
      });
      const json = res.data;
      const rawRecords = extractRecords(json);
      const success = json?.success === true
        || json?.status === 'success'
        || json?.status === true
        || rawRecords.length > 0;
      if (!success || rawRecords.length === 0) return [];
      return rawRecords
        .map((r) => normalizeRecord(r, source.name, source.priority))
        .filter(Boolean);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

function getExtraSources() {
  const extra = process.env.SIM_DB_EXTRA_APIS || '';
  if (!extra.trim()) return [];
  return extra.split(',').map((entry, idx) => {
    const tpl = entry.trim();
    if (!tpl) return null;
    return {
      name: `Custom${idx + 1}`,
      buildUrl: (q) => tpl.replace(/\{q\}/g, encodeURIComponent(q)),
      priority: 80,
    };
  }).filter(Boolean);
}

async function lookupSimDatabase(rawQuery) {
  const normalized = normalizeSimQuery(rawQuery);
  if (!normalized.variants.length) {
    return { records: [], normalized, sourcesTried: 0 };
  }

  const sources = [...API_SOURCES, ...getExtraSources()];
  const tasks = [];
  for (const source of sources) {
    for (const variant of normalized.variants) {
      tasks.push(
        fetchSource(source, variant)
          .then((records) => records.map((r) => ({ ...r, queryVariant: variant })))
          .catch(() => [])
      );
    }
  }

  const batches = await Promise.all(tasks);
  const records = mergeRecords([], batches.flat());
  return {
    records,
    normalized,
    sourcesTried: tasks.length,
  };
}

function formatSimRecordsMessage({ records, normalized, rawQuery, title }) {
  let msg = `${title}\n`;
  msg += `🔎 *Query:* ${rawQuery}\n`;
  if (normalized.display && normalized.display !== rawQuery) {
    msg += `🔄 *Normalized:* ${normalized.display}\n`;
  }
  msg += `📊 *Records Found:* ${records.length}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  records.forEach((rec, idx) => {
    msg += `\n📌 *Record ${idx + 1}*\n`;
    msg += `👤 *Name:* ${rec.name || 'N/A'}\n`;
    msg += `📱 *Phone:* ${rec.phone || 'N/A'}\n`;
    msg += `🆔 *CNIC:* ${rec.cnic || 'N/A'}\n`;
    msg += `🏠 *Address:* ${rec.address || 'N/A'}\n`;
    msg += `📡 *Network:* ${rec.network || 'N/A'}\n`;
    if (rec.year) msg += `📅 *Year:* ${rec.year}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  });

  msg += `_CYBER SEC PRO SIM Database_`;
  return msg;
}

module.exports = {
  normalizeSimQuery,
  lookupSimDatabase,
  formatSimRecordsMessage,
};
