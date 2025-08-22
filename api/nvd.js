// Forçando um novo deploy para limpar o cache global
// api/nvd.js
// Função serverless para proxy da API NVD no Vercel
// Compatível com ES Modules

export default async function handler(req, res) {
  // --------------------------
  // Configuração CORS
  // --------------------------
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const origin = req.headers.origin || '';
  const isAllowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin);

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder pré-flight OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // --------------------------
    // Parâmetros obrigatórios
    // --------------------------
    const { pubStartDate, pubEndDate, startIndex = '0', resultsPerPage = '2000' } = req.query;

    if (!pubStartDate || !pubEndDate) {
      res.status(400).json({ error: 'Parâmetros obrigatórios: pubStartDate e pubEndDate' });
      return;
    }

    // --------------------------
    // Construção da URL NVD
    // --------------------------
    const url = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');
    url.searchParams.set('pubStartDate', pubStartDate);
    url.searchParams.set('pubEndDate', pubEndDate);
    url.searchParams.set('startIndex', startIndex);
    url.searchParams.set('resultsPerPage', resultsPerPage);

    // --------------------------
    // Headers opcionais (chave NVD)
    // --------------------------
    const headers = {};
    if (process.env.NVD_API_KEY) {
      headers['apiKey'] = process.env.NVD_API_KEY;
    }

    // --------------------------
    // Requisição para NVD
    // --------------------------
    const r = await fetch(url.toString(), { headers });
    if (!r.ok) {
      const text = await r.text();
      res.status(r.status).send(text);
      return;
    }

    const data = await r.json();
    res.status(200).json(data);

  } catch (err) {
    res.status(500).json({ error: 'Falha ao consultar a NVD', detail: String(err) });
  }
}

