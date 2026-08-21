function basicAuthGate(req, res, next) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  // If not configured, the gate is off. Fine for local dev, not fine for
  // a public Render URL during the pilot — see README.
  if (!user || !pass) return next();

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    const suppliedUser = decoded.slice(0, separatorIndex);
    const suppliedPass = decoded.slice(separatorIndex + 1);
    if (suppliedUser === user && suppliedPass === pass) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Fieldscope pilot"');
  res.status(401).send('Authentication required.');
}

module.exports = { basicAuthGate };
