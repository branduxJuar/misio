import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../src/auth/guards/auth.guards';
import { LiveController } from '../src/live/live.controller';
import { ParticipantProofGuard } from '../src/live/participant-proof.guard';

const contextFor = (userId?: string) => ({
  switchToHttp: () => ({ getRequest: () => ({ user: userId ? { userId } : undefined }) }),
}) as ExecutionContext;

describe('acceso al acta de cotejo', () => {
  const exists = jest.fn();
  const guard = new ParticipantProofGuard({ exists } as any);

  beforeEach(() => exists.mockReset());

  it('rechaza una solicitud sin usuario autenticado', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toThrow(ForbiddenException);
    expect(exists).not.toHaveBeenCalled();
  });

  it('rechaza a un usuario sin boletos registrados', async () => {
    exists.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor('user-new'))).rejects.toThrow(ForbiddenException);
    expect(exists).toHaveBeenCalledWith({ userId: 'user-new' });
  });

  it('permite a un usuario con participación en cualquier sorteo', async () => {
    exists.mockResolvedValue({ _id: 'ticket-old' });
    await expect(guard.canActivate(contextFor('user-participant'))).resolves.toBe(true);
    expect(exists).toHaveBeenCalledWith({ userId: 'user-participant' });
  });

  it('protege el acta y el cotejo sin cerrar el resumen de la sala en vivo', () => {
    for (const route of ['proof', 'verifyCommitment', 'verify'] as const) {
      expect(Reflect.getMetadata(GUARDS_METADATA, LiveController.prototype[route])).toEqual([
        JwtAuthGuard, ParticipantProofGuard,
      ]);
    }
    expect(Reflect.getMetadata(GUARDS_METADATA, LiveController.prototype.proofStatus)).toBeUndefined();
  });
});
