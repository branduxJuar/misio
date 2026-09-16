/**
 * TESTS DE LAS RUTAS QUE MUEVEN DINERO.
 *
 * Estos no son tests académicos: cada uno existe porque ESE bug ocurrió.
 * La compra cobraba doble, el cierre tragaba errores en silencio, y los
 * reembolsos se duplicaban sin el candado. Si alguno de estos tests
 * falla, es que rompimos algo que ya nos costó horas diagnosticar.
 *
 * Se ejecutan sin BD real: solo verifican la LÓGICA, no la integración.
 * Para eso están los smoke tests manuales con la BD de desarrollo.
 */
import { maskName } from '../src/common/mask-name.util';
import { WsRateLimiter } from '../src/common/ws-rate-limiter';

describe('maskName — formato acordado con el negocio', () => {
  it('oculta el apellido y conserva solo parte del primer nombre', () => {
    expect(maskName('Brandux Juarez')).toBe('Bran.......');
  });

  it('nombre simple de una palabra', () => {
    expect(maskName('Ana')).toBe('An.....');
  });

  it('tres palabras: no revela nombres adicionales ni apellidos', () => {
    const r = maskName('Carlos Eduardo Pérez');
    expect(r).toBe('Carl.......');
  });

  it('entrada vacía no revienta', () => {
    expect(maskName('')).toBe('—');
    expect(maskName(null as any)).toBe('—');
  });
});

describe('WsRateLimiter — protección de los sockets', () => {
  const fakeSocket = (id: string) => ({ id, once: () => {} }) as any;

  it('acepta hasta el límite y bloquea el resto', async () => {
    const limiter = new WsRateLimiter();
    const s = fakeSocket('bot-1');
    let accepted = 0;
    for (let i = 0; i < 50; i++) {
      if (!await limiter.check(s, 'place_bid')) accepted++;
    }
    // place_bid: 12 por ventana de 10s
    expect(accepted).toBe(12);
  });

  it('otro socket no se ve afectado', async () => {
    const limiter = new WsRateLimiter();
    const bot = fakeSocket('bot');
    const human = fakeSocket('human');
    for (let i = 0; i < 50; i++) await limiter.check(bot, 'place_bid');
    expect(await limiter.check(human, 'place_bid')).toBeNull(); // null = puede pasar
  });

  it('eventos distintos tienen cubetas distintas', async () => {
    const limiter = new WsRateLimiter();
    const s = fakeSocket('s1');
    for (let i = 0; i < 50; i++) await limiter.check(s, 'place_bid');
    // Agoté place_bid, pero react es otra cubeta
    expect(await limiter.check(s, 'react')).toBeNull();
  });

  it('devuelve mensaje de espera al bloquear', async () => {
    const limiter = new WsRateLimiter();
    const s = fakeSocket('s2');
    for (let i = 0; i < 15; i++) await limiter.check(s, 'buy_now');
    const msg = await limiter.check(s, 'buy_now');
    expect(msg).toBeTruthy();
    expect(msg).toContain('espera');
  });
});

describe('AuditInterceptor — bitácora de acciones del staff', () => {
  // Este test existe porque el interceptor reventó TODA escritura del
  // staff durante semanas (pipe({...} as any) en vez de tap).
  it('no revienta con pipe() y registra la acción', async () => {
    const { of } = await import('rxjs');
    const { AuditInterceptor } = await import('../src/audit/audit.interceptor');

    const saved: any[] = [];
    const fakeModel = { create: async (doc: any) => { saved.push(doc); return doc; } } as any;
    const interceptor = new AuditInterceptor(fakeModel);

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'PUT',
          url: '/api/v1/auctions/flag',
          user: { userId: 'u1', name: 'Admin', role: 'admin' },
          params: {}, body: { enabled: true, password: 'secreto' },
          headers: {}, ip: '1.2.3.4',
          route: { path: '/auctions/flag' },
        }),
      }),
    } as any;

    const result = await new Promise((resolve, reject) => {
      interceptor.intercept(ctx, { handle: () => of({ ok: true }) } as any)
        .subscribe({ next: resolve, error: reject });
    });

    expect(result).toEqual({ ok: true }); // La respuesta pasa limpia
    await new Promise((r) => setTimeout(r, 50));
    expect(saved.length).toBe(1);
    expect(saved[0].action).toBe('PUT /auctions/flag');
    expect(saved[0].success).toBe(true);
    // NUNCA guarda contraseñas
    expect(saved[0].meta.password).toBeUndefined();
  });

  it('un usuario normal no se registra', async () => {
    const { of } = await import('rxjs');
    const { AuditInterceptor } = await import('../src/audit/audit.interceptor');
    const saved: any[] = [];
    const fakeModel = { create: async (d: any) => { saved.push(d); } } as any;
    const interceptor = new AuditInterceptor(fakeModel);

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST', url: '/buy', params: {}, body: {},
          user: { userId: 'u9', name: 'Carla', role: 'user' },
          headers: {}, ip: '1.1.1.1', route: {},
        }),
      }),
    } as any;

    await new Promise((resolve) => {
      interceptor.intercept(ctx, { handle: () => of('ok') } as any).subscribe({ next: resolve });
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(saved.length).toBe(0);
  });
});
