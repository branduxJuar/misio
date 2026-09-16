import { clientOrigins } from './client-origins.util';

describe('clientOrigins', () => {
  const original = process.env.CLIENT_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = original;
  });

  it('accepts both production domains and removes trailing slashes', () => {
    process.env.CLIENT_URL = 'https://misio.pe/, https://www.misio.pe/';
    expect(clientOrigins('http://localhost:5173')).toEqual([
      'https://misio.pe', 'https://www.misio.pe',
    ]);
  });

  it('tolerates brackets accidentally copied around the list', () => {
    process.env.CLIENT_URL = '[https://misio.pe,https://www.misio.pe]';
    expect(clientOrigins('http://localhost:5173')).toEqual([
      'https://misio.pe', 'https://www.misio.pe',
    ]);
  });

  it('ignores invalid entries instead of creating a broken CORS origin', () => {
    process.env.CLIENT_URL = 'not-a-url,https://misio.pe';
    expect(clientOrigins('http://localhost:5173')).toEqual(['https://misio.pe']);
  });
});
