import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SendMessageResponse {
  reply: string;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly base = environment.apiBaseUrl.replace(/\/$/, '');
  private http = inject(HttpClient);

  sendMessage(message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []): Observable<SendMessageResponse> {
    return this.http.post<SendMessageResponse>(`${this.base}/chat/message`, {
      message,
      history,
    });
  }
}
