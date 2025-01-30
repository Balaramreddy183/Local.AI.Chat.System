import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { ChatapiService } from '../services/chatapi.service';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, lastValueFrom, throwError, TimeoutError } from 'rxjs';
import * as emoji from 'node-emoji';
import { HttpClientModule } from '@angular/common/http';
import { timeout } from 'rxjs/operators';

interface ChatMessage {
  content: string;
  isBot: boolean;
  loading?: boolean;
  error?: boolean;
  timestamp: Date;  // Made required
  status?: 'sent' | 'delivered' | 'failed';
  retryable?: boolean;
}

@Component({
  selector: 'app-chat-interface',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, CommonModule, HttpClientModule],
  templateUrl: './chat-interface.component.html',
  styleUrls: ['./chat-interface.component.css'],
  providers: [ChatapiService]
})
export class ChatInterfaceComponent implements AfterViewInit {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  messageControl = new FormControl('');
  messages: ChatMessage[] = [];
  isTyping = false;
  theme: 'light' | 'dark' = 'light';
  typingSubject = new Subject<boolean>();
  emojiPickerVisible = false;

  constructor(private apiService: ChatapiService) {
    this.typingSubject.pipe(
      debounceTime(1000),
      distinctUntilChanged()
    ).subscribe((typing: boolean) => {
      this.isTyping = typing;
    });
  }

  ngAfterViewInit() {
    this.scrollToBottom();
    this.loadHistory();
  }

  private scrollToBottom() {
    setTimeout(() => {
      this.messagesContainer.nativeElement.scrollTop =
        this.messagesContainer.nativeElement.scrollHeight;
    }, 100);
  }

  private loadHistory() {
    const history = localStorage.getItem('chatHistory');
    if (history) {
      try {
        const parsed = JSON.parse(history);
        this.messages = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      } catch (error) {
        console.error('Error loading history:', error);
      }
    }
  }

  private saveHistory() {
    localStorage.setItem('chatHistory', JSON.stringify(this.messages));
  }

  parseMarkdown(content: string) {
    return emoji.emojify(content);
  }

  async sendMessage(): Promise<void> {
    const message = this.messageControl.value?.trim();
    if (!message) return;

    const userMessage: ChatMessage = { 
      content: message, 
      isBot: false, 
      timestamp: new Date(),
      status: 'sent'
    };
    
    this.messages = [...this.messages, userMessage];
    this.messageControl.reset();

    const loadingMessage: ChatMessage = { 
      content: '...', 
      isBot: true, 
      loading: true,
      timestamp: new Date()
    };
    this.messages = [...this.messages, loadingMessage];

    try {
      this.typingSubject.next(true);
      
      const response = await lastValueFrom(
        this.apiService.sendMessage(message).pipe(
          timeout(30000)
        )
      );

      this.messages = this.messages.map(msg => 
        msg === loadingMessage ? {
          content: response.response,
          isBot: true,
          timestamp: new Date(),
          status: 'delivered'
        } : msg
      );

    } catch (error) {
      const errorMessage = error instanceof TimeoutError ? 
        'Response timed out. Please try again.' : 
        'Failed to get response. Click to retry.';

      this.messages = this.messages.map(msg => 
        msg === loadingMessage ? {
          content: errorMessage,
          isBot: true,
          error: true,
          timestamp: new Date(),
          retryable: true
        } : msg
      );

    } finally {
      this.typingSubject.next(false);
      this.saveHistory();
      this.scrollToBottom();
      setTimeout(() => this.messageInput.nativeElement.focus(), 100);
    }
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme');
  }

  regenerateResponse(message: ChatMessage) {
    if (message.retryable) {
      this.messages = this.messages.map(msg =>
        msg === message ? { 
          ...msg, 
          loading: true, 
          error: false,
          timestamp: new Date()
        } : msg
      );
      this.sendMessage();
    }
  }
}