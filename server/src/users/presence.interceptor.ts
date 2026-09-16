import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { UsersService } from './users.service';

@Injectable()
export class PresenceInterceptor implements NestInterceptor {
  constructor(private readonly usersService: UsersService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    // If user is authenticated, ping presence
    if (request.user && request.user.userId) {
      void this.usersService.pingPresence(request.user.userId.toString()).catch(() => undefined);
    } else if (request.user && request.user.id) {
      void this.usersService.pingPresence(request.user.id.toString()).catch(() => undefined);
    }
    return next.handle();
  }
}
