import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import * as sanitizeHtml from 'sanitize-html';

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (this.isObj(value)) {
      return this.sanitizeObject(value);
    }
    return value;
  }

  private sanitizeObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (this.isObj(obj)) {
      const result: any = {};
      for (const key of Object.keys(obj)) {
        result[key] = this.sanitizeObject(obj[key]);
      }
      return result;
    }

    if (typeof obj === 'string') {
      return sanitizeHtml(obj, {
        allowedTags: [],
        allowedAttributes: {},
      });
    }

    return obj;
  }

  private isObj(obj: any): boolean {
    return typeof obj === 'object' && obj !== null && !(obj instanceof Date);
  }
}
