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
      this.usersService.pingPresence(request.user.userId.toString());
    } else if (request.user && request.user.id) {
      this.usersService.pingPresence(request.user.id.toString());
    }
    return next.handle();
  }
}
