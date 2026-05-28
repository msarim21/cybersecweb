// ============ TRADING MODULE — Stock & Crypto Data ============
// Free APIs: CoinGecko (crypto), Yahoo Finance (stocks)

const axios = require('axios');

// ── COUNTRY STOCK MARKETS ────────────────────────────────────────
const STOCK_MARKETS = {
  pk: {
    name: 'Pakistan 🇵🇰',
    exchange: 'PSX (Pakistan Stock Exchange)',
    stocks: [
      // Banks
      { symbol: 'HBL',   name: 'Habib Bank Limited' },
      { symbol: 'UBL',   name: 'United Bank Limited' },
      { symbol: 'MCB',   name: 'MCB Bank Limited' },
      { symbol: 'BAFL',  name: 'Bank Alfalah' },
      { symbol: 'MEBL',  name: 'Meezan Bank' },
      { symbol: 'ABL',   name: 'Allied Bank Limited' },
      { symbol: 'HMB',   name: 'Habib Metropolitan Bank' },
      { symbol: 'FABL',  name: 'Faysal Bank' },
      { symbol: 'BOP',   name: 'Bank of Punjab' },
      { symbol: 'SNBL',  name: 'Soneri Bank' },
      { symbol: 'KASBB', name: 'KASB Bank' },
      { symbol: 'SCBPL', name: 'Standard Chartered' },
      { symbol: 'NIB',   name: 'NIB Bank' },
      { symbol: 'SBL',   name: 'Summit Bank' },
      { symbol: 'BIPL',  name: 'BankIslami' },
      // Oil & Gas
      { symbol: 'OGDC',  name: 'Oil & Gas Dev. Company' },
      { symbol: 'PPL',   name: 'Pakistan Petroleum' },
      { symbol: 'POL',   name: 'Pakistan Oilfields' },
      { symbol: 'MARI',  name: 'Mari Petroleum' },
      { symbol: 'PSO',   name: 'Pakistan State Oil' },
      { symbol: 'SHEL',  name: 'Shell Pakistan' },
      { symbol: 'HASCOL',name: 'Hascol Petroleum' },
      { symbol: 'APL',   name: 'Attock Petroleum' },
      { symbol: 'ATRL',  name: 'Attock Refinery' },
      { symbol: 'NRL',   name: 'National Refinery' },
      { symbol: 'PRL',   name: 'Pakistan Refinery' },
      // Cement
      { symbol: 'LUCK',  name: 'Lucky Cement' },
      { symbol: 'DGKC',  name: 'D.G. Khan Cement' },
      { symbol: 'MLCF',  name: 'Maple Leaf Cement' },
      { symbol: 'FCCL',  name: 'Fauji Cement' },
      { symbol: 'PIOC',  name: 'Pioneer Cement' },
      { symbol: 'CHCC',  name: 'Cherat Cement' },
      { symbol: 'DHACEM',name: 'Dandot Cement' },
      { symbol: 'POWER', name: 'Power Cement' },
      { symbol: 'KOHE',  name: 'Kohat Cement' },
      { symbol: 'GADT',  name: 'Gadap Cement' },
      // Fertilizers
      { symbol: 'ENGRO', name: 'Engro Corporation' },
      { symbol: 'EFERT', name: 'Engro Fertilizers' },
      { symbol: 'FFC',   name: 'Fauji Fertilizer' },
      { symbol: 'FATIMA',name: 'Fatima Fertilizer' },
      { symbol: 'FFBL',  name: 'Fauji Fertilizer Bin Qasim' },
      { symbol: 'AGTHIA',name: 'Agriauto Industries' },
      // Auto & Engineering
      { symbol: 'MTL',   name: 'Millat Tractors' },
      { symbol: 'AGTL',  name: 'Al-Ghazi Tractors' },
      { symbol: 'GHNI',  name: 'Ghandhara Industries' },
      { symbol: 'INDU',  name: 'Indus Motor' },
      { symbol: 'HINO',  name: 'Hino Pak' },
      { symbol: 'SPL',   name: 'Sazgar Engineering' },
      { symbol: 'GATM',  name: 'Ghani Auto' },
      { symbol: 'DCL',   name: 'Dadabhoy Cement' },
      // Power & Energy
      { symbol: 'KEL',   name: 'K-Electric' },
      { symbol: 'HUBC',  name: 'Hub Power Company' },
      { symbol: 'NCPL',  name: 'Nishat Chunian Power' },
      { symbol: 'PKGP',  name: 'Pakgen Power' },
      { symbol: 'SAIF',  name: 'Saif Power' },
      { symbol: 'NPL',   name: 'Nishat Power' },
      { symbol: 'EPQL',  name: 'Engro Powergen Qadirpur' },
      { symbol: 'LPL',   name: 'Lalpir Power' },
      // Textiles
      { symbol: 'NML',   name: 'Nishat Mills' },
      { symbol: 'NCL',   name: 'Nishat Chunian' },
      { symbol: 'GATM',  name: 'Gul Ahmed Textile' },
      { symbol: 'DYN',   name: 'Dawood Hercules' },
      { symbol: 'NWT',   name: 'Nishat Chunian (Weaving)' },
      { symbol: 'SITC',  name: 'Sapphire Textile' },
      // Foods & Personal Care
      { symbol: 'NESTLE',name: 'Nestlé Pakistan' },
      { symbol: 'UNI',   name: 'Unilever Pakistan' },
      { symbol: 'GSK',   name: 'GlaxoSmithKline' },
      { symbol: 'AGP',   name: 'AGP Limited' },
      { symbol: 'ABOT',  name: 'Abbott Pakistan' },
      { symbol: 'GLAXO', name: 'Glaxo (Legacy)' },
      { symbol: 'COLG',  name: 'Colgate-Palmolive' },
      { symbol: 'PGCL',  name: 'Procter & Gamble' },
      // Technology
      { symbol: 'SYS',   name: 'Systems Limited' },
      { symbol: 'TPL',   name: 'TPL Corp' },
      { symbol: 'TRG',   name: 'TRG Pakistan' },
      { symbol: 'NETSOL',name: 'Netsol Technologies' },
      { symbol: 'AVN',   name: 'Avanceon' },
      { symbol: 'DCS',   name: 'DCS World' },
      { symbol: 'BIAH',  name: 'Biafo Industries' },
      // Misc
      { symbol: 'PAKT',  name: 'Pakistan Tobacco' },
      { symbol: 'SNGP',  name: 'Sui Northern Gas' },
      { symbol: 'SSGC',  name: 'Sui Southern Gas' },
      { symbol: 'UNITY', name: 'Unity Foods' },
      { symbol: 'BHL',   name: 'Bulleh Shah Packaging' },
      { symbol: 'PSEL',  name: 'Pakistan Stock Exchange' },
      { symbol: 'IGI',   name: 'IGI Holdings' },
      { symbol: 'BGL',   name: 'Biafo Glass' },
      { symbol: 'IBFL',  name: 'IBL HealthCare' },
      { symbol: 'PIA',   name: 'PIA (Pakistan Intl Airline)' },
      { symbol: 'THALL', name: 'Thal Limited' },
      { symbol: 'GTYR',  name: 'Ghandhara Tyre' },
    ]
  },
  us: {
    name: 'USA 🇺🇸',
    exchange: 'NYSE / NASDAQ / S&P 500',
    stocks: [
      // Mega Cap Tech
      { symbol: 'AAPL',  name: 'Apple Inc.' },
      { symbol: 'MSFT',  name: 'Microsoft' },
      { symbol: 'GOOGL', name: 'Alphabet (Google)' },
      { symbol: 'GOOG',  name: 'Alphabet Class C' },
      { symbol: 'AMZN',  name: 'Amazon' },
      { symbol: 'META',  name: 'Meta Platforms' },
      { symbol: 'NVDA',  name: 'NVIDIA' },
      { symbol: 'TSLA',  name: 'Tesla' },
      { symbol: 'AVGO',  name: 'Broadcom' },
      { symbol: 'ORCL',  name: 'Oracle' },
      { symbol: 'AMD',   name: 'AMD' },
      { symbol: 'CRM',   name: 'Salesforce' },
      { symbol: 'ADBE',  name: 'Adobe' },
      { symbol: 'NFLX',  name: 'Netflix' },
      { symbol: 'INTC',  name: 'Intel' },
      { symbol: 'CSCO',  name: 'Cisco' },
      { symbol: 'IBM',   name: 'IBM' },
      { symbol: 'QCOM',  name: 'Qualcomm' },
      { symbol: 'TXN',   name: 'Texas Instruments' },
      { symbol: 'PYPL',  name: 'PayPal' },
      { symbol: 'UBER',  name: 'Uber' },
      { symbol: 'ABNB',  name: 'Airbnb' },
      { symbol: 'SNOW',  name: 'Snowflake' },
      { symbol: 'PLTR',  name: 'Palantir' },
      { symbol: 'SHOP',  name: 'Shopify' },
      // Semiconductors
      { symbol: 'TSM',   name: 'TSMC (ADR)' },
      { symbol: 'ASML',  name: 'ASML Holding' },
      { symbol: 'MU',    name: 'Micron' },
      { symbol: 'LRCX',  name: 'Lam Research' },
      { symbol: 'KLAC',  name: 'KLA Corp' },
      { symbol: 'MRVL',  name: 'Marvell' },
      { symbol: 'NXPI',  name: 'NXP Semiconductors' },
      { symbol: 'MPWR',  name: 'Monolithic Power' },
      { symbol: 'ON',    name: 'ON Semiconductor' },
      // Financials
      { symbol: 'BRK-B', name: 'Berkshire Hathaway' },
      { symbol: 'JPM',   name: 'JPMorgan Chase' },
      { symbol: 'V',     name: 'Visa' },
      { symbol: 'MA',    name: 'Mastercard' },
      { symbol: 'BAC',   name: 'Bank of America' },
      { symbol: 'WFC',   name: 'Wells Fargo' },
      { symbol: 'GS',    name: 'Goldman Sachs' },
      { symbol: 'MS',    name: 'Morgan Stanley' },
      { symbol: 'C',     name: 'Citigroup' },
      { symbol: 'AXP',   name: 'American Express' },
      { symbol: 'BLK',   name: 'BlackRock' },
      { symbol: 'SPGI',  name: 'S&P Global' },
      { symbol: 'PGR',   name: 'Progressive' },
      { symbol: 'SCHW',  name: 'Charles Schwab' },
      { symbol: 'TFC',   name: 'Truist Financial' },
      { symbol: 'USB',   name: 'US Bancorp' },
      { symbol: 'PNC',   name: 'PNC Financial' },
      { symbol: 'COF',   name: 'Capital One' },
      // Healthcare
      { symbol: 'LLY',   name: 'Eli Lilly' },
      { symbol: 'JNJ',   name: 'Johnson & Johnson' },
      { symbol: 'UNH',   name: 'UnitedHealth' },
      { symbol: 'ABBV',  name: 'AbbVie' },
      { symbol: 'MRK',   name: 'Merck' },
      { symbol: 'PFE',   name: 'Pfizer' },
      { symbol: 'TMO',   name: 'Thermo Fisher' },
      { symbol: 'ABT',   name: 'Abbott Labs' },
      { symbol: 'DHR',   name: 'Danaher' },
      { symbol: 'BMY',   name: 'Bristol Myers' },
      { symbol: 'AMGN',  name: 'Amgen' },
      { symbol: 'GILD',  name: 'Gilead' },
      { symbol: 'REGN',  name: 'Regeneron' },
      { symbol: 'VRTX',  name: 'Vertex' },
      { symbol: 'ISRG',  name: 'Intuitive Surgical' },
      { symbol: 'ZTS',   name: 'Zoetis' },
      { symbol: 'CI',    name: 'Cigna' },
      { symbol: 'HCA',   name: 'HCA Healthcare' },
      { symbol: 'ELV',   name: 'Elevance Health' },
      { symbol: 'CVS',   name: 'CVS Health' },
      // Energy & Utilities
      { symbol: 'XOM',   name: 'Exxon Mobil' },
      { symbol: 'CVX',   name: 'Chevron' },
      { symbol: 'COP',   name: 'ConocoPhillips' },
      { symbol: 'EOG',   name: 'EOG Resources' },
      { symbol: 'SLB',   name: 'Schlumberger' },
      { symbol: 'OXY',   name: 'Occidental' },
      { symbol: 'VLO',   name: 'Valero' },
      { symbol: 'MPC',   name: 'Marathon Petroleum' },
      { symbol: 'PSX',   name: 'Phillips 66' },
      { symbol: 'WMB',   name: 'Williams' },
      { symbol: 'NEE',   name: 'NextEra Energy' },
      { symbol: 'SO',    name: 'Southern Company' },
      { symbol: 'DUK',   name: 'Duke Energy' },
      { symbol: 'AEP',   name: 'American Electric' },
      { symbol: 'EXC',   name: 'Exelon' },
      { symbol: 'SRE',   name: 'Sempra' },
      // Retail & Consumer
      { symbol: 'WMT',   name: 'Walmart' },
      { symbol: 'COST',  name: 'Costco' },
      { symbol: 'HD',    name: 'Home Depot' },
      { symbol: 'LOW',   name: 'Lowe\'s' },
      { symbol: 'TGT',   name: 'Target' },
      { symbol: 'PG',    name: 'Procter & Gamble' },
      { symbol: 'KO',    name: 'Coca-Cola' },
      { symbol: 'PEP',   name: 'PepsiCo' },
      { symbol: 'MDLZ',  name: 'Mondelez' },
      { symbol: 'GIS',   name: 'General Mills' },
      { symbol: 'KMB',   name: 'Kimberly-Clark' },
      { symbol: 'CL',    name: 'Colgate-Palmolive' },
      { symbol: 'EL',    name: 'Estée Lauder' },
      { symbol: 'MCD',   name: 'McDonald\'s' },
      { symbol: 'SBUX',  name: 'Starbucks' },
      { symbol: 'CMG',   name: 'Chipotle' },
      { symbol: 'YUM',   name: 'Yum! Brands' },
      { symbol: 'DPZ',   name: 'Domino\'s' },
      { symbol: 'NKE',   name: 'Nike' },
      { symbol: 'LULU',  name: 'Lululemon' },
      { symbol: 'TJX',   name: 'TJX Companies' },
      // Telecom & Media
      { symbol: 'VZ',    name: 'Verizon' },
      { symbol: 'T',     name: 'AT&T' },
      { symbol: 'TMUS',  name: 'T-Mobile' },
      { symbol: 'CHTR',  name: 'Charter Comm.' },
      { symbol: 'DIS',   name: 'Walt Disney' },
      { symbol: 'WBD',   name: 'Warner Bros.' },
      { symbol: 'PARA',  name: 'Paramount' },
      { symbol: 'NWSA',  name: 'News Corp' },
      { symbol: 'CMCSA', name: 'Comcast' },
      { symbol: 'FOXA',  name: 'Fox Corp' },
      // Industrials
      { symbol: 'GE',    name: 'GE Aerospace' },
      { symbol: 'RTX',   name: 'RTX Corp' },
      { symbol: 'HON',   name: 'Honeywell' },
      { symbol: 'CAT',   name: 'Caterpillar' },
      { symbol: 'BA',    name: 'Boeing' },
      { symbol: 'LMT',   name: 'Lockheed Martin' },
      { symbol: 'NOC',   name: 'Northrop Grumman' },
      { symbol: 'GD',    name: 'General Dynamics' },
      { symbol: 'TDG',   name: 'TransDigm' },
      { symbol: 'PCAR',  name: 'PACCAR' },
      { symbol: 'DE',    name: 'Deere & Company' },
      { symbol: 'ITW',   name: 'Illinois Tool' },
      { symbol: 'EMR',   name: 'Emerson' },
      { symbol: 'ETN',   name: 'Eaton Corp' },
      { symbol: 'CSX',   name: 'CSX Corp' },
      { symbol: 'UNP',   name: 'Union Pacific' },
      { symbol: 'NSC',   name: 'Norfolk Southern' },
      { symbol: 'FDX',   name: 'FedEx' },
      { symbol: 'UPS',   name: 'UPS' },
      // Materials & Mining
      { symbol: 'LIN',   name: 'Linde' },
      { symbol: 'SHW',   name: 'Sherwin-Williams' },
      { symbol: 'APD',   name: 'Air Products' },
      { symbol: 'ECL',   name: 'Ecolab' },
      { symbol: 'NUE',   name: 'Nucor' },
      { symbol: 'STLD',  name: 'Steel Dynamics' },
      { symbol: 'FCX',   name: 'Freeport-McMoRan' },
      { symbol: 'NEM',   name: 'Newmont' },
      { symbol: 'DOW',   name: 'Dow Inc.' },
      { symbol: 'DD',    name: 'DuPont' },
      // Real Estate
      { symbol: 'PLD',   name: 'Prologis' },
      { symbol: 'AMT',   name: 'American Tower' },
      { symbol: 'CCI',   name: 'Crown Castle' },
      { symbol: 'EQIX',  name: 'Equinix' },
      { symbol: 'SPG',   name: 'Simon Property' },
      { symbol: 'O',     name: 'Realty Income' },
      { symbol: 'WELL',  name: 'Welltower' },
      { symbol: 'PSA',   name: 'Public Storage' },
      { symbol: 'DLR',   name: 'Digital Realty' },
      { symbol: 'VICI',  name: 'VICI Properties' },
    ]
  },
};

// ── TOP 200 CRYPTO COINS (by market cap) ──────────────────────────
const CRYPTO_TOP = [
  // Top 50
  'bitcoin','ethereum','tether','binancecoin','solana','usd-coin',
  'xrp','dogecoin','cardano','tron','avalanche-2','chainlink',
  'polkadot','polygon','litecoin','internet-computer','uniswap',
  'ethereum-classic','stellar','cosmos','filecoin','aptos',
  'hedera-hashgraph','vechain','arbitrum','optimism','near',
  'injective-protocol','render-token','the-graph','maker',
  'rocket-pool','aave','lido-dao','quant-network','algorand',
  'flow','eos','tezos','iota','theta-token','fantom','kava',
  'zcash','dash','neo','waves','icon','ontology','harmony',
  'bitcoin-cash','monero','elrond-erd-2','eos','true-usd',
  // 51-100
  'fetch-ai','singularitynet','oasis-network','celo','1inch',
  'compound-governance-token','curve-dao-token','sushi','yearn-finance',
  'balancer','0x','basic-attention-token','loopring','enjincoin',
  'decentraland','the-sandbox','axie-infinity','gala','immutable-x',
  'illuvium','stepn','apecoin','ftx-token','paxos-standard',
  'gemini-dollar','nexo','celsius-degree-token','blockstack',
  'livepeer','mask-network','dogelon-mars','shiba-inu',
  'bone-shibaswap','pepe','floki','baby-doge-coin','dogecoin',
  'kishu-inu','akita-inu','hokkaidu-inu','wojak','bonk',
  'memecoin','harrypotterobamasonic10inu','turbo','mog-coin',
  // 101-150
  'pendle','starknet','manta-network','dymension','celestia',
  'sui','sei-network','osmosis','injective-protocol','dydx',
  'gmx','vertex-protocol','perpetual-protocol','synapse-2',
  'across-protocol','layerzero','wormhole','jito-governance',
  'pyth-network','ondo-finance','worldcoin-wld','beam-2',
  'ecash','bitcoin-sv','dash-2','ravencoin','decred',
  'komodo','horizen','nav-coin','xrp-classic','digibyte',
  'verge','reddcoin','status','nervos-network','conflux-token',
  'iotex','cartesi','celo','skale','superfarm','metal',
  'dusk-network','origin-protocol','ark','steem','wanchain',
  // 151-200
  'siacoin','storj','arweave','bittorrent','holo','chromia',
  'power-ledger','energy-web-token','origintrail','quantstamp',
  'celer-network','matic-network','raiden-network','augur',
  'gnosis','dxdao','uma','tellor','band-protocol','api3',
  'chainlink','parsec','kyber-network-crystal','bancor',
  'thorchain','ren','republic-protocol','keep-network',
  'tbtc','ribbon-finance','convex-finance','tokemak',
  'alchemix','rari-governance-token','badger-dao','harvest-finance',
  'alpha-finance','cream-2','cover-protocol','nexus-mutual',
  'armor','index-cooperative','set-protocol','power-index-pool',
  'pie-dao-dough','metaverse-index','nft-index','defi-pulse-index',
  'coin98','raydium','serum','bonfida','mango-markets',
  'orca','saber','tulip-protocol','port-finance','solend',
  'marinade-staked-sol','jito','drift-protocol','zeta-markets',
];

// ── CoinGecko Symbol-to-ID Map (common abbreviations) ───────────
const SYMBOL_MAP = {
  btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', bnb: 'binancecoin',
  sol: 'solana', usdc: 'usd-coin', xrp: 'ripple', doge: 'dogecoin',
  ada: 'cardano', trx: 'tron', avax: 'avalanche-2', link: 'chainlink',
  dot: 'polkadot', matic: 'matic-network', ltc: 'litecoin', icp: 'internet-computer',
  uni: 'uniswap', etc: 'ethereum-classic', xlm: 'stellar', atom: 'cosmos',
  fil: 'filecoin', apt: 'aptos', hbar: 'hedera-hashgraph', vet: 'vechain',
  arb: 'arbitrum', op: 'optimism', near: 'near', inj: 'injective-protocol',
  rndr: 'render-token', grt: 'the-graph', mkr: 'maker', rpl: 'rocket-pool',
  aave: 'aave', ldo: 'lido-dao', qnt: 'quant-network', algo: 'algorand',
  flow: 'flow', eos: 'eos', xtz: 'tezos', iota: 'iota', theta: 'theta-token',
  ftm: 'fantom', kava: 'kava', zec: 'zcash', dash: 'dash', neo: 'neo',
  waves: 'waves', icx: 'icon', ont: 'ontology', one: 'harmony',
  bch: 'bitcoin-cash', xmr: 'monero', egld: 'elrond-erd-2', tusd: 'true-usd',
  fet: 'fetch-ai', agix: 'singularitynet', rose: 'oasis-network',
  celo: 'celo', inch: '1inch', comp: 'compound-governance-token',
  crv: 'curve-dao-token', sushi: 'sushi', yfi: 'yearn-finance',
  bal: 'balancer', zrx: '0x', bat: 'basic-attention-token',
  lrc: 'loopring', enj: 'enjincoin', mana: 'decentraland',
  sand: 'the-sandbox', axs: 'axie-infinity', gala: 'gala', imx: 'immutable-x',
  ilv: 'illuvium', gmt: 'stepn', ape: 'apecoin', ftt: 'ftx-token',
  pax: 'paxos-standard', gusd: 'gemini-dollar', nexo: 'nexo',
  cel: 'celsius-degree-token', stx: 'blockstack', lpt: 'livepeer',
  mask: 'mask-network', elon: 'dogelon-mars', shib: 'shiba-inu',
  bone: 'bone-shibaswap', pepe: 'pepe', floki: 'floki', babydoge: 'baby-doge-coin',
  kishu: 'kishu-inu', akita: 'akita-inu', hokk: 'hokkaidu-inu',
  wojak: 'wojak', bonk: 'bonk', meme: 'memecoin', harrypotter: 'harrypotterobamasonic10inu',
  turbo: 'turbo', mog: 'mog-coin', pendle: 'pendle', strk: 'starknet',
  manta: 'manta-network', dym: 'dymension', tia: 'celestia',
  sui: 'sui', sei: 'sei-network', osmo: 'osmosis', dydx: 'dydx',
  gmx: 'gmx', vrtx: 'vertex-protocol', perp: 'perpetual-protocol',
  syn: 'synapse-2', across: 'across-protocol', zro: 'layerzero',
  w: 'wormhole', jto: 'jito-governance', pyth: 'pyth-network',
  ondo: 'ondo-finance', wld: 'worldcoin-wld', beam: 'beam-2',
  xec: 'ecash', bsv: 'bitcoin-sv', rvn: 'ravencoin', dcr: 'decred',
  kmd: 'komodo', zen: 'horizen', nav: 'nav-coin', dgb: 'digibyte',
  xvg: 'verge', rdd: 'reddcoin', snt: 'status', ckb: 'nervos-network',
  cfx: 'conflux-token', iotx: 'iotex', ctsi: 'cartesi', skl: 'skale',
  super: 'superfarm', mtl: 'metal', dusk: 'dusk-network', ogn: 'origin-protocol',
  ark: 'ark', steem: 'steem', wan: 'wanchain', sc: 'siacoin',
  storj: 'storj', ar: 'arweave', btt: 'bittorrent', hot: 'holo',
  chr: 'chromia', powr: 'power-ledger', ewt: 'energy-web-token',
  trac: 'origintrail', qsp: 'quantstamp', celr: 'celer-network',
  rdn: 'raiden-network', rep: 'augur', gno: 'gnosis', dx: 'dxdao',
  uma: 'uma', trb: 'tellor', band: 'band-protocol', api3: 'api3',
  knc: 'kyber-network-crystal', bnt: 'bancor', rune: 'thorchain',
  ren: 'ren', repv2: 'republic-protocol', keep: 'keep-network',
  tbtc: 'tbtc', rbn: 'ribbon-finance', cvx: 'convex-finance',
  toe: 'tokemak', alcx: 'alchemix', rgt: 'rari-governance-token',
  badger: 'badger-dao', farm: 'harvest-finance', alpha: 'alpha-finance',
  cream: 'cream-2', cvp: 'cover-protocol', nxm: 'nexus-mutual',
  armor: 'armor', index: 'index-cooperative', set: 'set-protocol',
  pie: 'pie-dao-dough', mvi: 'metaverse-index', nfti: 'nft-index',
  dpi: 'defi-pulse-index', c98: 'coin98', ray: 'raydium', srm: 'serum',
  fida: 'bonfida', mango: 'mango-markets', orca: 'orca', saber: 'saber',
  tulip: 'tulip-protocol', port: 'port-finance', solend: 'solend',
  msol: 'marinade-staked-sol', jito: 'jito', drift: 'drift-protocol',
  zeta: 'zeta-markets',
};

// ── Fetch Top N Crypto from CoinGecko (FREE) ─────────────────────
async function getCryptoTop(n = 20) {
  try {
    const { data } = await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${n}&page=1`,
      { timeout: 15000 }
    );
    return data.map(c => ({
      rank: c.market_cap_rank,
      name: c.name,
      symbol: c.symbol.toUpperCase(),
      price: c.current_price,
      change24h: c.price_change_percentage_24h,
      marketCap: c.market_cap,
      volume24h: c.total_volume,
      high24h: c.high_24h,
      low24h: c.low_24h,
      image: c.image,
    }));
  } catch (e) {
    console.log('[Trading] CoinGecko error:', e.message);
    return null;
  }
}

// ── Fetch Specific Crypto Detail ────────────────────────────────────
async function getCryptoDetail(coinId) {
  try {
    const { data } = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true`,
      { timeout: 15000 }
    );
    const md = data.market_data;
    return {
      name: data.name,
      symbol: data.symbol.toUpperCase(),
      price: md.current_price?.usd,
      change24h: md.price_change_percentage_24h,
      change7d: md.price_change_percentage_7d,
      change30d: md.price_change_percentage_30d,
      marketCap: md.market_cap?.usd,
      volume24h: md.total_volume?.usd,
      high24h: md.high_24h?.usd,
      low24h: md.low_24h?.usd,
      ath: md.ath?.usd,
      athChange: md.ath_change_percentage?.usd,
      circulatingSupply: md.circulating_supply,
      totalSupply: md.total_supply,
      maxSupply: md.max_supply,
      buyPressure: md.total_volume?.usd > md.market_cap?.usd * 0.05 ? '🔥 HIGH' :
                   md.total_volume?.usd > md.market_cap?.usd * 0.02 ? '⚡ MODERATE' : '📉 LOW',
      sentiment: md.price_change_percentage_24h > 5 ? '🚀 BULLISH' :
                  md.price_change_percentage_24h > 0 ? '📈 POSITIVE' :
                  md.price_change_percentage_24h > -5 ? '📉 SLIGHT BEARISH' : '🔻 BEARISH',
    };
  } catch (e) {
    console.log('[Trading] Crypto detail error:', e.message);
    return null;
  }
}

// ── Search Crypto by Symbol/Name ────────────────────────────────────────
async function searchCrypto(query) {
  try {
    // Try symbol map first
    const lower = query.toLowerCase().trim();
    if (SYMBOL_MAP[lower]) {
      return [{ id: SYMBOL_MAP[lower], name: lower.toUpperCase(), symbol: lower.toUpperCase(), marketCapRank: null }];
    }
    const { data } = await axios.get(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
      { timeout: 10000 }
    );
    return data.coins.slice(0, 5).map(c => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol.toUpperCase(),
      marketCapRank: c.market_cap_rank,
      thumb: c.thumb,
    }));
  } catch (e) {
    console.log('[Trading] Search error:', e.message);
    return null;
  }
}

// ── Resolve Symbol to CoinGecko ID ────────────────────────────────
function resolveCoinId(input) {
  const lower = input.toLowerCase().trim();
  if (SYMBOL_MAP[lower]) return SYMBOL_MAP[lower];
  return lower;
}

// ── Fetch Stock Price (Yahoo Finance) ──────────────────────────
async function getStockPrice(symbol) {
  try {
    const endpoints = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    ];
    for (const url of endpoints) {
      try {
        const { data } = await axios.get(url, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const result = data.chart?.result?.[0];
        if (!result) continue;
        const meta = result.meta;
        const quote = result.indicators?.quote?.[0];
        const close = quote?.close?.filter(Boolean);
        const open = quote?.open?.filter(Boolean);
        const high = quote?.high?.filter(Boolean);
        const low = quote?.low?.filter(Boolean);
        const volume = quote?.volume?.filter(Boolean);
        const latestClose = close?.[close.length - 1] || meta.regularMarketPrice;
        const latestOpen = open?.[0] || meta.previousClose;
        const change = latestClose - latestOpen;
        const changePct = latestOpen ? (change / latestOpen) * 100 : 0;
        const avgVolume = meta.regularMarketVolume || 0;
        const latestVolume = volume?.[volume.length - 1] || avgVolume;
        const volumeRatio = avgVolume > 0 ? latestVolume / avgVolume : 1;
        return {
          symbol: meta.symbol,
          name: meta.shortName || meta.longName || meta.symbol,
          currency: meta.currency,
          exchange: meta.exchangeName,
          price: latestClose,
          open: latestOpen,
          change: change,
          changePct: changePct,
          high: high?.[high.length - 1] || meta.regularMarketDayHigh,
          low: low?.[low.length - 1] || meta.regularMarketDayLow,
          volume: latestVolume,
          marketCap: meta.marketCap,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
          buyPressure: volumeRatio > 2 ? '🔥 STRONG BUY' :
                       volumeRatio > 1.3 ? '⚡ MODERATE BUY' :
                       volumeRatio < 0.7 ? '🔻 SELL PRESSURE' : '➡️ NEUTRAL',
          marketStatus: meta.marketState || 'UNKNOWN',
        };
      } catch (innerErr) { continue; }
    }
    return null;
  } catch (e) {
    console.log('[Trading] Stock price error:', e.message);
    return null;
  }
}

// ── Format Helpers ─────────────────────────────────────────────
function formatCurrency(num) {
  if (!num && num !== 0) return 'N/A';
  if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
  return '$' + num.toFixed(2);
}

function formatPrice(num) {
  if (!num && num !== 0) return 'N/A';
  if (num >= 1) return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 0.01) return '$' + num.toFixed(4);
  return '$' + num.toFixed(8);
}

function formatVolume(num) {
  if (!num) return 'N/A';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toString();
}

function formatChange(pct) {
  if (!pct && pct !== 0) return 'N/A';
  const emoji = pct >= 0 ? '🟢' : '🔴';
  return `${emoji} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

// ── Build Countries List Text ──────────────────────────────────────
const numberEmojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];

function getCountriesList() {
  const codes = Object.keys(STOCK_MARKETS);
  const lines = codes.map((code, i) => {
    const info = STOCK_MARKETS[code];
    const num = numberEmojis[Math.min(i, 8)] || `${i + 1}.`;
    return `  ${num} *${code.toUpperCase()}* — ${info.name} (${info.stocks.length} stocks)`;
  });
  return lines.join('\n');
}

// ── Build Stocks List for a Country (paginated for large lists) ────────────
function getStocksList(countryCode) {
  const market = STOCK_MARKETS[countryCode.toLowerCase()];
  if (!market) return null;
  const lines = market.stocks.map((s, i) => {
    const num = numberEmojis[Math.min(i, 8)] || `${i + 1}.`;
    return `  ${num} *${s.symbol}* — ${s.name}`;
  });
  return {
    name: market.name,
    exchange: market.exchange,
    stocks: lines.join('\n'),
    count: market.stocks.length,
  };
}

// ── Paginated stocks list (for WhatsApp message limits ~4k chars) ──────────
function getStocksListPage(countryCode, page = 0, perPage = 50) {
  const market = STOCK_MARKETS[countryCode.toLowerCase()];
  if (!market) return null;
  const start = page * perPage;
  const end = start + perPage;
  const slice = market.stocks.slice(start, end);
  const lines = slice.map((s, i) => {
    const realIdx = start + i + 1;
    return `  ${realIdx}. *${s.symbol}* — ${s.name}`;
  });
  const totalPages = Math.ceil(market.stocks.length / perPage);
  return {
    name: market.name,
    exchange: market.exchange,
    stocks: lines.join('\n'),
    count: market.stocks.length,
    page: page + 1,
    totalPages,
    hasMore: end < market.stocks.length,
  };
}

// ── Get Top Gainers ─────────────────────────────────────────
async function getCryptoGainers(n = 20) {
  try {
    const coins = await getCryptoTop(250);
    if (!coins) return null;
    return coins
      .filter(c => c.change24h !== null && c.change24h !== undefined)
      .sort((a, b) => b.change24h - a.change24h)
      .slice(0, n);
  } catch (e) {
    console.log('[Trading] Gainers error:', e.message);
    return null;
  }
}

// ── Get Top Losers ──────────────────────────────────────────
async function getCryptoLosers(n = 20) {
  try {
    const coins = await getCryptoTop(250);
    if (!coins) return null;
    return coins
      .filter(c => c.change24h !== null && c.change24h !== undefined)
      .sort((a, b) => a.change24h - b.change24h)
      .slice(0, n);
  } catch (e) {
    console.log('[Trading] Losers error:', e.message);
    return null;
  }
}

module.exports = {
  STOCK_MARKETS, CRYPTO_TOP, SYMBOL_MAP,
  getCryptoTop, getCryptoDetail, searchCrypto, resolveCoinId, getStockPrice,
  getCryptoGainers, getCryptoLosers,
  formatCurrency, formatPrice, formatVolume, formatChange,
  getCountriesList, getStocksList, getStocksListPage,
};
