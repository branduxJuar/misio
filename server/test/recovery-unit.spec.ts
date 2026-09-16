import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentsService } from '../src/payments/payments.service';
import { StoreService } from '../src/store/store.service';
import { RealtimeStateService } from '../src/common/realtime-state.service';
import { DistributedLockService } from '../src/common/distributed-lock.service';
import { JobsService } from '../src/jobs/jobs.service';

describe('Payment recovery orchestration', () => {
  function setup() {
    const deposit: any = { _id: 'deposit', amount: 5, userId: 'user', fulfillment: { status: 'pending' },
      meta: { raffleId: 'raffle', ticketNumbers: [1, 2], ticketPromoCode: 'FREE1' } };
    const tx = {
      findConfirmedDeposit: jest.fn(async () => deposit), confirmDeposit: jest.fn(),
      failDepositPurchase: jest.fn(async () => undefined),
    };
    const tickets = { purchase: jest.fn(async () => ({ tickets: [{ code: 'T-1' }, { code: 'T-2' }] })) };
    const notifications = { notifyUser: jest.fn(async () => undefined) };
    const users = { findById: () => ({ select: () => ({ lean: async () => ({ name: 'User' }) }) }) };
    const locks = { acquire: jest.fn(async () => async () => undefined) };
    const service = new PaymentsService(locks as any, {} as any, users as any, {} as any, {} as any,
      tx as any, tickets as any, {} as any, notifications as any, {} as any,
      { notifySold: jest.fn(), notifyReleased: jest.fn() } as any, {} as any, {} as any, {} as any);
    return { service, deposit, tx, tickets, notifications };
  }

  it('resumes a confirmed deposit without crediting it again and forwards its ticket promo', async () => {
    const { service, tx, tickets } = setup();
    const result = await (service as any).processDeposit('deposit');
    expect(tx.confirmDeposit).not.toHaveBeenCalled();
    expect(tickets.purchase).toHaveBeenCalledWith('user', 'raffle', expect.objectContaining({
      ticketNumbers: [1, 2], promoCode: 'FREE1', depositId: 'deposit',
    }));
    expect(result.autoPurchase).toBe('ok');
  });

  it('does not buy again after fulfillment committed', async () => {
    const { service, deposit, tickets } = setup();
    deposit.fulfillment = { status: 'ok', detail: 'T-1, T-2' };
    expect((await (service as any).processDeposit('deposit')).autoPurchase).toBe('ok');
    expect(tickets.purchase).not.toHaveBeenCalled();
  });

  it('retains pending fulfillment for transient failures', async () => {
    const { service, tx, tickets } = setup();
    tickets.purchase.mockRejectedValueOnce(new ServiceUnavailableException('temporary failure'));
    await expect((service as any).processDeposit('deposit')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tx.failDepositPurchase).not.toHaveBeenCalled();
  });

  it('marks an unavailable ticket as failed without retrying forever', async () => {
    const { service, tx, tickets } = setup();
    tickets.purchase.mockRejectedValueOnce(new ConflictException('ticket sold'));
    expect((await (service as any).processDeposit('deposit')).autoPurchase).toBe('failed');
    expect(tx.failDepositPurchase).toHaveBeenCalledWith('deposit', 'ticket sold');
  });

  it('does not report a successful purchase as failed when notification fails', async () => {
    const { service, tx, notifications } = setup();
    notifications.notifyUser.mockRejectedValueOnce(new Error('offline'));
    expect((await (service as any).processDeposit('deposit')).autoPurchase).toBe('ok');
    expect(tx.failDepositPurchase).not.toHaveBeenCalled();
  });
});

describe('Transactional checkout boundaries', () => {
  it('completes the idempotency record and deposit in the purchase session before notifying', async () => {
    const events: string[] = [];
    const session = { withTransaction: async (body: () => Promise<void>) => { await body(); events.push('commit'); },
      endSession: jest.fn(async () => undefined) };
    const idempotency = { claim: async () => ({ kind: 'new', id: 'key' }),
      complete: jest.fn(async () => { events.push('idempotency'); }), fail: jest.fn() };
    const tx = { finishDepositPurchase: jest.fn(async () => { events.push('fulfillment'); }) };
    const notifications = { notifyUser: jest.fn(async () => { events.push('notification'); }) };
    const service = new StoreService({ startSession: async () => session } as any, {} as any, {} as any,
      {} as any, tx as any, notifications as any, {} as any, {} as any, {} as any, idempotency as any);
    const order = { _id: 'order', itemName: 'Item', price: 10, toObject: () => ({ _id: 'order' }) };
    jest.spyOn(service as any, 'checkoutOnce').mockResolvedValue(order);
    await service.checkout('user', [{ itemId: 'item', qty: 1 }], undefined, 'key', 'deposit');
    expect(tx.finishDepositPurchase).toHaveBeenCalledWith('deposit', 'user', 'Item', session);
    expect(idempotency.complete).toHaveBeenCalledWith('key', { _id: 'order' }, session);
    expect(events).toEqual(['fulfillment', 'idempotency', 'commit', 'notification']);
    expect(session.endSession).toHaveBeenCalled();
  });
});

describe('Redis recovery without a real Redis server', () => {
  it('fails closed while configured Redis is down, then recovers on the same service', async () => {
    const state = new RealtimeStateService({} as any);
    const redis = { status: 'reconnecting', hgetall: jest.fn(async () => ({})) };
    jest.spyOn(state as any, 'client').mockReturnValue(redis);
    (state as any).ready = Promise.resolve();
    await expect(state.getGridSelections('raffle')).rejects.toBeInstanceOf(ServiceUnavailableException);
    redis.status = 'ready';
    expect(await state.getGridSelections('raffle')).toEqual({});
  });

  it('does not turn a committed action into an error when lock release fails', async () => {
    const locks = new DistributedLockService();
    const redis = { status: 'ready', set: jest.fn(async () => 'OK'), eval: jest.fn(async () => { throw new Error('down'); }) };
    jest.spyOn(locks as any, 'getRedis').mockReturnValue(redis);
    const release = await locks.acquire('test');
    await expect(release()).resolves.toBeUndefined();
  });
});

describe('Durable ticket email processing', () => {
  it('leaves the email pending when the provider fails', async () => {
    const collection = { findOne: jest.fn(async () => ({ status: 'pending' })), updateOne: jest.fn() };
    const mail = { sendTicketPurchaseConfirmation: jest.fn(async () => { throw new Error('provider offline'); }) };
    const jobs = new JobsService({ db: { collection: () => collection } } as any, mail as any, {} as any);
    await expect((jobs as any).process({ name: 'ticket-email', data: {
      id: 'email-1', email: 'test@example.invalid', drawDate: new Date().toISOString(), tickets: ['T-1'],
    } })).rejects.toThrow('provider offline');
    expect(collection.updateOne).not.toHaveBeenCalled();
  });
});
