import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { ChatapiService } from '../services/chatapi.service';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import * as emoji from 'node-emoji';
import { HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-chat-interface',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, CommonModule,HttpClientModule],
  templateUrl: './chat-interface.component.html',
  styleUrls: ['./chat-interface.component.css'],
  providers: [ChatapiService]
})
export class ChatInterfaceComponent implements AfterViewInit {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  
  messageControl = new FormControl('');
  messages: { content: string, isBot: boolean, loading?: boolean, error?: boolean }[] = [];
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
    if (history) this.messages = JSON.parse(history);
  }

  private saveHistory() {
    localStorage.setItem('chatHistory', JSON.stringify(this.messages));
  }
  parseMarkdown(content: string) {
    return emoji.emojify(content);
  }

  async sendMessage() {
    const message = this.messageControl.value?.trim();
    if (!message) return;

    const newMessage = { content: message, isBot: false };
    this.messages = [...this.messages, newMessage];
    this.messageControl.reset();
    
    const loadingMessage = { 
      content: '', 
      isBot: true, 
      loading: true 
    };
    this.messages = [...this.messages, loadingMessage];
    
    try {
      this.typingSubject.next(true);
      const response = await this.apiService.sendMessage(message).toPromise();
      
      this.messages = this.messages.map(msg => 
        msg === loadingMessage ? { 
          content: response.response, 
          isBot: true, 
          loading: false 
        } : msg
      );
      
    } catch (error) {
      this.messages = this.messages.map(msg => 
        msg === loadingMessage ? { 
          content: 'Failed to get response. Click to retry.', 
          isBot: true, 
          error: true 
        } : msg
      );
    } finally {
      this.typingSubject.next(false);
      this.saveHistory();
      this.scrollToBottom();
    }
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme');
  }

  regenerateResponse(message: any) {
    if (message.error) {
      this.messages = this.messages.map(msg => 
        msg === message ? { ...msg, loading: true, error: false } : msg
      );
      this.sendMessage();
    }
  }
}